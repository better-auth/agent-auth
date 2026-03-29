import { createAuthEndpoint } from "@better-auth/core/api";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { hasCapability, parseCapabilityIds } from "../utils/capabilities";
import type {
  Agent,
  AgentCapabilityGrant,
  AgentHost,
  HostSession,
  ResolvedAgentAuthOptions,
} from "../types";

/**
 * POST /agent/revoke-capability
 *
 * Revoke individual capability grants from an agent without
 * revoking the entire agent. Default host capabilities cannot
 * be revoked individually — remove them from the host's
 * defaultCapabilities instead.
 *
 * Auth: user session (agent owner or host owner) or host JWT.
 */
export function revokeCapability(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/agent/revoke-capability",
    {
      method: "POST",
      body: z.object({
        agent_id: z.string(),
        capabilities: z.array(z.string()).min(1),
        reason: z.string().optional(),
      }),
      metadata: {
        openapi: {
          description:
            "Revoke individual capability grants from an agent. " +
            "Default host capabilities cannot be individually revoked.",
        },
      },
    },
    async (ctx) => {
      const hostSession = (ctx.context as Record<string, unknown>).hostSession as
        | HostSession
        | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userSession = await getSessionFromCtx(ctx as any);

      if (!hostSession && !userSession) {
        throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
      }

      const { agent_id: agentId, capabilities, reason } = ctx.body;

      const agent = await ctx.context.adapter.findOne<Agent>({
        model: TABLE.agent,
        where: [{ field: "id", value: agentId }],
      });

      if (!agent) {
        throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
      }

      if (agent.status === "revoked") {
        throw agentError("FORBIDDEN", ERR.AGENT_REVOKED);
      }

      // Fetch host once — used for both ownership check and default cap guard
      let host: AgentHost | null = null;
      if (agent.hostId) {
        host = await ctx.context.adapter.findOne<AgentHost>({
          model: TABLE.host,
          where: [{ field: "id", value: agent.hostId }],
        });
      }

      // Ownership check
      if (hostSession) {
        if (agent.hostId !== hostSession.host.id) {
          throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
        }
      } else if (userSession) {
        if (agent.userId !== userSession.user.id) {
          if (!host || host.userId !== userSession.user.id) {
            throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
          }
        }
      }
      const hostBudget = host ? parseCapabilityIds(host.defaultCapabilities) : [];
      const defaultCaps = capabilities.filter((c) => hasCapability(hostBudget, c));
      if (defaultCaps.length > 0) {
        throw agentError(
          "BAD_REQUEST",
          ERR.DEFAULT_CAPABILITY_NOT_REVOCABLE,
          `Cannot individually revoke default capabilities: ${defaultCaps.join(", ")}. ` +
            "Remove them from the host's defaultCapabilities instead.",
        );
      }

      // Revoke matching active grants
      const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
        model: TABLE.grant,
        where: [{ field: "agentId", value: agentId }],
      });

      const now = new Date();
      const revoked: string[] = [];
      const revokedGrantIds: string[] = [];

      for (const capName of capabilities) {
        const activeGrants = grants.filter(
          (g) => g.capability === capName && g.status === "active",
        );
        for (const grant of activeGrants) {
          await ctx.context.adapter.update({
            model: TABLE.grant,
            where: [{ field: "id", value: grant.id }],
            update: { status: "revoked", updatedAt: now },
          });
          revokedGrantIds.push(grant.id);
        }
        if (activeGrants.length > 0) {
          revoked.push(capName);
        }
      }

      emit(
        opts,
        {
          type: "capability.revoked",
          actorId: userSession?.user.id ?? hostSession?.host.userId ?? undefined,
          agentId,
          metadata: {
            capabilities: revoked,
            ...(reason ? { reason } : {}),
          },
        },
        ctx,
      );

      return ctx.json({
        agent_id: agentId,
        revoked,
        grant_ids: revokedGrantIds,
      });
    },
  );
}
