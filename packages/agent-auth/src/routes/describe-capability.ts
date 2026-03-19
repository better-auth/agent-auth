import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, agentAuthChallenge, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
  AgentCapabilityGrant,
  AgentSession,
  HostSession,
  ResolvedAgentAuthOptions,
} from "../types";

/**
 * GET /capability/describe (§6.2.1).
 *
 * Returns the full detail for a single capability including `input`
 * schema and any execution metadata. Supports the same three auth
 * modes as `/capability/list`:
 * - No auth: public capability detail
 * - Host JWT: capability for host's linked user
 * - Agent JWT: capability with grant_status
 */
export function describeCapability(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/capability/describe",
    {
      method: "GET",
      query: z.object({
        name: z.string(),
      }),
      metadata: {
        openapi: {
          description: "Returns full detail for a single capability (§6.2.1).",
        },
      },
    },
    async (ctx) => {
      const capabilityName = ctx.query.name;

      const agentSession = (ctx.context as Record<string, unknown>).agentSession as
        | AgentSession
        | undefined;
      const hostSession = (ctx.context as Record<string, unknown>).hostSession as
        | HostSession
        | undefined;

      if (opts.requireAuthForCapabilities && !agentSession && !hostSession) {
        throw agentError(
          "UNAUTHORIZED",
          ERR.AUTH_REQUIRED_FOR_CAPABILITIES,
          undefined,
          agentAuthChallenge(ctx.context.baseURL),
        );
      }

      let allCapabilities = opts.capabilities ?? [];

      if (opts.resolveCapabilities) {
        allCapabilities = await opts.resolveCapabilities({
          capabilities: allCapabilities,
          query: null,
          agentSession: agentSession ?? null,
          hostSession: hostSession ?? null,
        });
      }

      const capability = allCapabilities.find((c) => c.name === capabilityName);

      if (!capability) {
        throw agentError(
          "NOT_FOUND",
          ERR.CAPABILITY_NOT_FOUND,
          `Capability "${capabilityName}" does not exist.`,
        );
      }

      const { grant_status: _gs, approvalStrength, ...capabilityFields } = capability;
      const response: Record<string, unknown> = {
        ...capabilityFields,
        ...(approvalStrength ? { approval_strength: approvalStrength } : {}),
      };

      if (agentSession) {
        const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
          model: TABLE.grant,
          where: [
            { field: "agentId", value: agentSession.agent.id },
            { field: "capability", value: capabilityName },
          ],
        });

        const now = new Date();
        const hasActiveGrant = grants.some(
          (g) => g.status === "active" && (!g.expiresAt || new Date(g.expiresAt) > now),
        );

        response.grant_status = hasActiveGrant ? "granted" : "not_granted";
      } else if (hostSession) {
        const hostDefaults = hostSession.host.defaultCapabilities ?? [];
        response.grant_status = hostDefaults.includes(capabilityName) ? "granted" : "not_granted";
      }

      // §10.6: Capability Caching — use private when response varies by auth
      const cacheScope = agentSession || hostSession ? "private" : "public";
      ctx.setHeader("Cache-Control", `${cacheScope}, max-age=300`);

      return ctx.json(response);
    },
  );
}
