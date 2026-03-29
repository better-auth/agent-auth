import { createAuthEndpoint } from "@better-auth/core/api";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { emit } from "../emit";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
  Agent,
  AgentCapabilityGrant,
  AgentSession,
  HostSession,
  ResolvedAgentAuthOptions,
} from "../types";

/**
 * POST /agent/revoke
 *
 * Revoke an agent. Accepts any of:
 * - Agent JWT: the agent revokes itself (body optional)
 * - Host JWT: the host proves ownership via `agent.hostId`
 * - User session: the user proves ownership via `agent.userId`
 */
export function revokeAgent(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/agent/revoke",
    {
      method: "POST",
      body: z.object({
        agent_id: z.string().optional(),
      }),
      metadata: {
        openapi: {
          description: "Revoke an agent via agent JWT, host JWT, or user session (§6.6).",
        },
      },
    },
    async (ctx) => {
      const agentSession = (ctx.context as Record<string, unknown>).agentSession as
        | AgentSession
        | undefined;
      const hostSession = (ctx.context as Record<string, unknown>).hostSession as
        | HostSession
        | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userSession = await getSessionFromCtx(ctx as any);

      if (!agentSession && !hostSession && !userSession) {
        throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
      }

      const agentId = ctx.body.agent_id ?? agentSession?.agent.id;

      if (!agentId) {
        throw agentError("BAD_REQUEST", ERR.INVALID_REQUEST);
      }

      const agent = await ctx.context.adapter.findOne<Agent>({
        model: TABLE.agent,
        where: [{ field: "id", value: agentId }],
      });

      if (!agent) {
        throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
      }

      if (agentSession) {
        if (agent.id !== agentSession.agent.id) {
          throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
        }
      } else if (hostSession) {
        if (agent.hostId !== hostSession.host.id) {
          throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
        }
      } else if (userSession) {
        if (agent.userId !== userSession.user.id) {
          throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
        }
      }

      const now = new Date();
      await ctx.context.adapter.update({
        model: TABLE.agent,
        where: [{ field: "id", value: agentId }],
        update: {
          status: "revoked",
          publicKey: "",
          kid: null,
          updatedAt: now,
        },
      });

      const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
        model: TABLE.grant,
        where: [{ field: "agentId", value: agentId }],
      });
      for (const grant of grants) {
        await ctx.context.adapter.update({
          model: TABLE.grant,
          where: [{ field: "id", value: grant.id }],
          update: { status: "revoked", updatedAt: now },
        });
      }

      emit(
        opts,
        {
          type: "agent.revoked",
          actorId:
            agentSession?.user.id ?? userSession?.user.id ?? hostSession?.host.userId ?? undefined,
          agentId: agent.id,
          hostId: agent.hostId,
        },
        ctx,
      );

      return ctx.json({
        agent_id: agent.id,
        status: "revoked",
      });
    },
  );
}
