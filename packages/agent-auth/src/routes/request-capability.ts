import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { resolveGrantExpiresAt } from "../utils/grant-ttl";
import { sanitizeDisplayText, DISPLAY_LIMITS } from "../utils/sanitize";
import { findBlockedCapabilities, hasCapability, parseCapabilityIds } from "../utils/capabilities";
import type {
  AgentCapabilityGrant,
  AgentHost,
  AgentSession,
  ApprovalRequest,
  Constraints,
  ResolvedAgentAuthOptions,
} from "../types";
import { normalizeCapabilityRequests } from "../types";
import {
  buildApprovalInfo,
  capabilityItemZ,
  formatGrantsResponse,
  validateCapabilitiesExist,
} from "./_helpers";
import { constraintsCover } from "../utils/constraints";

const capabilityRequestItem = z.union([
  z.string(),
  z.object({
    name: z.string(),
    constraints: z.record(z.string(), z.unknown()).optional(),
  }),
]);

/**
 * POST /agent/request-capability (§5.4).
 *
 * Requests additional capabilities for an existing agent.
 * Auto-approves capabilities within the host's default set;
 * creates pending grants for capabilities outside the budget.
 */
export function requestCapability(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/agent/request-capability",
    {
      method: "POST",
      body: z.object({
        capabilities: z.array(capabilityItemZ).min(1),
        reason: z.string().optional(),
        preferred_method: z.string().optional(),
        login_hint: z.string().optional(),
        binding_message: z.string().optional(),
      }),
      requireHeaders: true,
      metadata: {
        openapi: {
          description: "Request additional capabilities for an agent (§6.4).",
        },
      },
    },
    async (ctx) => {
      const agentSession = (ctx.context as Record<string, unknown>).agentSession as
        | AgentSession
        | undefined;

      if (!agentSession) {
        throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
      }

      const {
        capabilities: rawCapabilities,
        reason: rawReason,
        preferred_method: preferredMethod,
        login_hint: loginHint,
        binding_message: rawBindingMessage,
      } = ctx.body;

      const reason = rawReason ? sanitizeDisplayText(rawReason, DISPLAY_LIMITS.reason) : undefined;
      const bindingMessage = rawBindingMessage
        ? sanitizeDisplayText(rawBindingMessage, DISPLAY_LIMITS.bindingMessage)
        : undefined;

      const normalizedCaps = normalizeCapabilityRequests(
        rawCapabilities as Array<string | { name: string; constraints?: Constraints }>,
      );
      const capabilityIds = normalizedCaps.map((c) => c.name);
      const constraintsMap = new Map<string, Constraints | null>();
      for (const c of normalizedCaps) {
        constraintsMap.set(c.name, c.constraints);
      }

      // Validate blocked (§10.6)
      if (opts.blockedCapabilities.length > 0) {
        const blocked = findBlockedCapabilities(capabilityIds, opts.blockedCapabilities);
        if (blocked.length > 0) {
          throw agentError("BAD_REQUEST", ERR.INVALID_CAPABILITIES);
        }
      }

      // Validate existence (§10.6)
      await validateCapabilitiesExist(capabilityIds, opts);

      const existingGrants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
        model: TABLE.grant,
        where: [{ field: "agentId", value: agentSession.agent.id }],
      });

      const ownerId = agentSession.host?.userId ?? null;
      const now = new Date();

      const activeGrants = existingGrants.filter(
        (g) => g.status === "active" && (!g.expiresAt || new Date(g.expiresAt) > now),
      );
      const pendingGrants = existingGrants.filter(
        (g) => g.status === "pending" && (!g.grantedBy || g.grantedBy === ownerId),
      );

      const isCoveredByActive = (capId: string) =>
        activeGrants.some(
          (g) =>
            g.capability === capId &&
            constraintsCover(g.constraints, constraintsMap.get(capId) ?? null),
        );
      const isCoveredByPending = (capId: string) =>
        pendingGrants.some(
          (g) =>
            g.capability === capId &&
            constraintsCover(g.constraints, constraintsMap.get(capId) ?? null),
        );

      const newOnly = capabilityIds.filter((c) => !isCoveredByActive(c) && !isCoveredByPending(c));

      if (newOnly.length === 0) {
        const allActive = capabilityIds.every((c) => isCoveredByActive(c));
        if (allActive) {
          throw agentError("CONFLICT", ERR.ALREADY_GRANTED);
        }

        // Some still pending — return pending with approval info
        const stillPending = capabilityIds.filter((c) => isCoveredByPending(c));

        // §5.4: return only the requested grants, not the full set
        const requestedSet = new Set(capabilityIds);
        const requestedGrants = existingGrants.filter((g) => requestedSet.has(g.capability));

        const existingApproval = await ctx.context.adapter.findOne<ApprovalRequest>({
          model: TABLE.approval,
          where: [
            {
              field: "agentId",
              value: agentSession.agent.id,
            },
            { field: "status", value: "pending" },
          ],
        });

        if (existingApproval && new Date(existingApproval.expiresAt) > now) {
          return ctx.json({
            agent_id: agentSession.agent.id,
            status: "pending",
            agent_capability_grants: formatGrantsResponse(requestedGrants, opts.capabilities),
            approval: {
              method: existingApproval.method,
              expires_in: Math.floor(
                (new Date(existingApproval.expiresAt).getTime() - now.getTime()) / 1000,
              ),
              interval: existingApproval.interval,
            },
          });
        }

        const approval = await buildApprovalInfo(
          opts,
          ctx.context.adapter,
          ctx.context.internalAdapter,
          {
            origin: new URL(ctx.context.baseURL).origin,
            agentId: agentSession.agent.id,
            agentName: agentSession.agent.name,
            userId: agentSession.host?.userId ?? null,
            hostId: agentSession.agent.hostId,
            capabilities: stillPending,
            preferredMethod,
            loginHint,
            bindingMessage,
          },
        );

        return ctx.json({
          agent_id: agentSession.agent.id,
          status: "pending",
          agent_capability_grants: formatGrantsResponse(requestedGrants, opts.capabilities),
          approval,
        });
      }

      // Resolve host budget
      let hostBudget: string[] = [];
      let hostIsActive = false;
      let hostUserId: string | null = null;
      if (agentSession.agent.hostId) {
        const host = await ctx.context.adapter.findOne<AgentHost>({
          model: TABLE.host,
          where: [
            {
              field: "id",
              value: agentSession.agent.hostId,
            },
          ],
        });
        if (host) {
          hostBudget = parseCapabilityIds(host.defaultCapabilities);
          hostIsActive = host.status === "active";
          hostUserId = host.userId ?? null;
        }
      }

      let autoApprove: string[];
      let needsApproval: string[];

      if (hostIsActive && hostBudget.length > 0) {
        autoApprove = newOnly.filter((c) => hasCapability(hostBudget, c));
        needsApproval = newOnly.filter((c) => !hasCapability(hostBudget, c));
      } else {
        autoApprove = [];
        needsApproval = newOnly;
      }

      if (needsApproval.length > 0 && agentSession.agent.mode === "autonomous") {
        if (!hostUserId) {
          needsApproval = [];
        }
      }

      // Auto-approve
      for (const capId of autoApprove) {
        const expiresAt = await resolveGrantExpiresAt(opts, capId, {
          agentId: agentSession.agent.id,
          hostId: agentSession.agent.hostId,
          userId: agentSession.host?.userId ?? null,
        });
        await ctx.context.adapter.create({
          model: TABLE.grant,
          data: {
            agentId: agentSession.agent.id,
            capability: capId,
            constraints: constraintsMap.get(capId) ?? null,
            grantedBy: agentSession.host?.userId ?? null,
            deniedBy: null,
            expiresAt,
            status: "active",
            reason: reason ?? null,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      if (needsApproval.length === 0) {
        if (autoApprove.length > 0) {
          emit(
            opts,
            {
              type: "capability.granted",
              actorType: "system",
              agentId: agentSession.agent.id,
              hostId: agentSession.agent.hostId,
              metadata: {
                capabilities: autoApprove,
                auto: true,
              },
            },
            ctx,
          );
        }

        // §5.4: return only the newly requested grants, not the full set
        const newGrantSet = new Set(capabilityIds);
        const updatedGrants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
          model: TABLE.grant,
          where: [
            {
              field: "agentId",
              value: agentSession.agent.id,
            },
          ],
        });
        const requestedGrants = updatedGrants.filter((g) => newGrantSet.has(g.capability));

        return ctx.json({
          agent_id: agentSession.agent.id,
          status: "active",
          agent_capability_grants: formatGrantsResponse(requestedGrants, opts.capabilities),
        });
      }

      // Create pending grants
      for (const capId of needsApproval) {
        await ctx.context.adapter.create({
          model: TABLE.grant,
          data: {
            agentId: agentSession.agent.id,
            capability: capId,
            constraints: constraintsMap.get(capId) ?? null,
            grantedBy: agentSession.host?.userId ?? null,
            deniedBy: null,
            expiresAt: null,
            status: "pending",
            reason: reason ?? null,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      const approval = await buildApprovalInfo(
        opts,
        ctx.context.adapter,
        ctx.context.internalAdapter,
        {
          origin: new URL(ctx.context.baseURL).origin,
          agentId: agentSession.agent.id,
          agentName: agentSession.agent.name,
          userId: agentSession.host?.userId ?? null,
          hostId: agentSession.agent.hostId,
          capabilities: needsApproval,
          preferredMethod,
          loginHint,
          bindingMessage,
        },
      );

      emit(
        opts,
        {
          type: "capability.requested",
          actorType: "agent",
          actorId: agentSession.host?.userId ?? undefined,
          agentId: agentSession.agent.id,
          hostId: agentSession.agent.hostId,
          metadata: {
            autoApproved: autoApprove,
            pending: needsApproval,
            reason,
          },
        },
        ctx,
      );

      // §5.4: return only the newly requested grants, not the full set
      const requestedSet = new Set(capabilityIds);
      const allGrants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
        model: TABLE.grant,
        where: [{ field: "agentId", value: agentSession.agent.id }],
      });
      const requestedGrants = allGrants.filter((g) => requestedSet.has(g.capability));

      return ctx.json({
        agent_id: agentSession.agent.id,
        status: "pending",
        agent_capability_grants: formatGrantsResponse(requestedGrants, opts.capabilities),
        approval,
      });
    },
  );
}
