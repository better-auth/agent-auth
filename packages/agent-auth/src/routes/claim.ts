import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { sanitizeDisplayText, DISPLAY_LIMITS } from "../utils/sanitize";
import type {
  Agent,
  AgentCapabilityGrant,
  AgentHost,
  HostSession,
  ResolvedAgentAuthOptions,
} from "../types";
import { buildApprovalInfo, formatGrantsResponse } from "./_helpers";

/**
 * POST /agent/claim
 *
 * Initiate a claim on an autonomous agent. The calling host must be
 * authenticated via host JWT (set by the middleware).
 *
 * Creates an approval request for the target autonomous agent.
 * When the user approves, `approve-capability` transfers ownership
 * of the agent and its host to the approving user.
 */
export function claimAgent(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/agent/claim",
    {
      method: "POST",
      body: z.object({
        agent_id: z.string().meta({
          description: "ID of the autonomous agent to claim.",
        }),
        preferred_method: z.string().optional(),
        login_hint: z.string().optional(),
        binding_message: z.string().optional(),
      }),
      metadata: {
        openapi: {
          description:
            "Initiate a claim on an autonomous agent. Triggers an approval flow. When approved, the autonomous agent is claimed and its resources transfer to the approving user.",
        },
      },
    },
    async (ctx) => {
      const hostSession = (ctx.context as Record<string, unknown>).hostSession as
        | HostSession
        | undefined;

      if (!hostSession) {
        throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
      }

      const {
        agent_id: targetAgentId,
        preferred_method: preferredMethod,
        login_hint: loginHint,
        binding_message: rawBindingMessage,
      } = ctx.body;

      const bindingMessage = rawBindingMessage
        ? sanitizeDisplayText(rawBindingMessage, DISPLAY_LIMITS.bindingMessage)
        : undefined;

      // ── Find and validate the target autonomous agent ──

      const targetAgent = await ctx.context.adapter.findOne<Agent>({
        model: TABLE.agent,
        where: [{ field: "id", value: targetAgentId }],
      });

      if (!targetAgent) {
        throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
      }

      if (targetAgent.mode !== "autonomous") {
        throw agentError(
          "BAD_REQUEST",
          ERR.UNSUPPORTED_MODE,
          "Only autonomous agents can be claimed.",
        );
      }

      if (targetAgent.status === "claimed") {
        throw agentError("CONFLICT", ERR.AGENT_CLAIMED, "This agent has already been claimed.");
      }

      if (targetAgent.status !== "active") {
        throw agentError(
          "BAD_REQUEST",
          ERR.AGENT_NOT_FOUND,
          "Agent is not available for claiming.",
        );
      }

      const targetHost = await ctx.context.adapter.findOne<AgentHost>({
        model: TABLE.host,
        where: [{ field: "id", value: targetAgent.hostId }],
      });

      if (!targetHost) {
        throw agentError("NOT_FOUND", ERR.HOST_NOT_FOUND);
      }

      if (targetHost.userId) {
        throw agentError(
          "CONFLICT",
          ERR.AGENT_CLAIMED,
          "This agent's host is already owned by a user.",
        );
      }

      // ── Collect the autonomous agent's active capabilities ──

      const targetGrants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
        model: TABLE.grant,
        where: [{ field: "agentId", value: targetAgent.id }],
      });

      const activeCapabilities = targetGrants
        .filter((g) => g.status === "active")
        .map((g) => g.capability);

      // ── Build approval directly for the target agent ──

      const origin = new URL(ctx.context.baseURL).origin;
      const approval = await buildApprovalInfo(
        opts,
        ctx.context.adapter,
        ctx.context.internalAdapter,
        {
          origin,
          agentId: targetAgent.id,
          userId: null,
          agentName: targetAgent.name,
          hostId: targetAgent.hostId,
          capabilities: activeCapabilities,
          preferredMethod,
          loginHint,
          bindingMessage: bindingMessage ?? `Claim autonomous agent "${targetAgent.name}"`,
        },
      );

      emit(
        opts,
        {
          type: "approval.created",
          agentId: targetAgent.id,
          hostId: targetAgent.hostId,
          metadata: {
            type: "claim",
          },
        },
        ctx,
      );

      return ctx.json({
        agent_id: targetAgent.id,
        host_id: targetAgent.hostId,
        name: targetAgent.name,
        mode: targetAgent.mode,
        status: targetAgent.status,
        agent_capability_grants: formatGrantsResponse(targetGrants, opts.capabilities),
        approval,
      });
    },
  );
}
