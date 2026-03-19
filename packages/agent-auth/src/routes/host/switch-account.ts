import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import type { Agent, AgentCapabilityGrant, AgentHost, ResolvedAgentAuthOptions } from "../../types";
import { checkSharedOrg, claimAutonomousAgents } from "../_helpers";

/**
 * POST /host/switch-account (§2.9).
 *
 * Switches a host to a different user account. The host retains its
 * `host_id` and key material but all agents under it are revoked
 * (they must re-register under the new user context).
 *
 * Auth: User session — the new user who will own the host.
 */
export function switchHostAccount(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/host/switch-account",
    {
      method: "POST",
      body: z.object({
        host_id: z.string().min(1),
      }),
      use: [sessionMiddleware],
      metadata: {
        openapi: {
          description:
            "Switch a host to the current user's account (§2.9). Revokes all agents under the host.",
        },
      },
    },
    async (ctx) => {
      const session = ctx.context.session;
      const { host_id: hostId } = ctx.body;

      const host = await ctx.context.adapter.findOne<AgentHost>({
        model: TABLE.host,
        where: [{ field: "id", value: hostId }],
      });

      if (!host) {
        throw agentError("NOT_FOUND", ERR.HOST_NOT_FOUND);
      }

      if (host.status === "revoked") {
        throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
      }

      // Must be the current owner or in the same org
      if (host.userId && host.userId !== session.user.id) {
        const sameOrg = await checkSharedOrg(ctx.context.adapter, session.user.id, host.userId);
        if (!sameOrg) {
          throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
        }
      }

      const previousUserId = host.userId;
      const now = new Date();

      // Claim autonomous agents first — transfers data to new user
      // before revoking everything
      await claimAutonomousAgents(ctx.context.adapter, opts, ctx, {
        hostId,
        userId: session.user.id,
      });

      // §2.9: Revoke remaining (non-claimed) agents under this host
      const agents = await ctx.context.adapter.findMany<Agent>({
        model: TABLE.agent,
        where: [{ field: "hostId", value: hostId }],
      });

      let agentsRevoked = 0;
      for (const agent of agents) {
        if (
          agent.status === "revoked" ||
          agent.status === "rejected" ||
          agent.status === "claimed"
        ) {
          continue;
        }
        await ctx.context.adapter.update({
          model: TABLE.agent,
          where: [{ field: "id", value: agent.id }],
          update: {
            status: "revoked",
            publicKey: "",
            kid: null,
            jwksUrl: null,
            updatedAt: now,
          },
        });
        const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
          model: TABLE.grant,
          where: [{ field: "agentId", value: agent.id }],
        });
        for (const grant of grants) {
          await ctx.context.adapter.update({
            model: TABLE.grant,
            where: [{ field: "id", value: grant.id }],
            update: { status: "revoked", updatedAt: now },
          });
        }
        agentsRevoked++;
      }

      // §2.9: Re-link host to new user, retain host_id and key material
      await ctx.context.adapter.update({
        model: TABLE.host,
        where: [{ field: "id", value: hostId }],
        update: {
          userId: session.user.id,
          updatedAt: now,
        },
      });

      emit(
        opts,
        {
          type: "host.claimed",
          actorId: session.user.id,
          hostId,
          metadata: {
            previousUserId,
            newUserId: session.user.id,
            agentsRevoked,
          },
        },
        ctx,
      );

      if (opts.onHostClaimed) {
        await opts.onHostClaimed({
          ctx,
          hostId,
          userId: session.user.id,
          previousUserId,
        });
      }

      return ctx.json({
        host_id: hostId,
        status: host.status,
        previous_user_id: previousUserId,
        new_user_id: session.user.id,
        agents_revoked: agentsRevoked,
      });
    },
  );
}
