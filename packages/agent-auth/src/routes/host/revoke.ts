import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../../types";
import { checkSharedOrg } from "../_helpers";

/**
 * POST /agent/host/revoke (§6.10).
 *
 * Revokes a host and cascades to all agents under it.
 * Supports two auth modes:
 *   - Host JWT: the host revokes itself (spec §6.10)
 *   - User session: user revokes a host they own
 */
export function revokeHost(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/host/revoke",
		{
			method: "POST",
			body: z
				.object({
					host_id: z.string().optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description:
						"Revoke a host and cascade to all agents under it (§6.10).",
				},
			},
		},
		async (ctx) => {
			const hostSession = (ctx.context as Record<string, unknown>)
				.hostSession as HostSession | undefined;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const userSession = await getSessionFromCtx(ctx as any);

			let targetHostId: string;

			if (hostSession) {
				targetHostId = ctx.body?.host_id ?? hostSession.host.id;
				if (targetHostId !== hostSession.host.id) {
					throw APIError.from("FORBIDDEN", ERR.UNAUTHORIZED);
				}
			} else if (userSession) {
				if (!ctx.body?.host_id) {
					throw new APIError("BAD_REQUEST", {
						message:
							"host_id is required when using user session.",
					});
				}
				targetHostId = ctx.body.host_id;
			} else {
				throw APIError.from(
					"UNAUTHORIZED",
					ERR.UNAUTHORIZED_SESSION,
				);
			}

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: TABLE.host,
				where: [{ field: "id", value: targetHostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERR.HOST_NOT_FOUND);
			}

			if (userSession && !hostSession) {
				if (host.userId !== userSession.user.id && host.userId !== null) {
					const sameOrg = await checkSharedOrg(
						ctx.context.adapter,
						userSession.user.id,
						host.userId,
					);
					if (!sameOrg) {
						throw APIError.from("NOT_FOUND", ERR.HOST_NOT_FOUND);
					}
				}
			}

			if (host.status === "revoked") {
				return ctx.json({
					host_id: host.id,
					status: "revoked" as const,
					agents_revoked: 0,
				});
			}

			const now = new Date();

			await ctx.context.adapter.update({
				model: TABLE.host,
				where: [{ field: "id", value: host.id }],
				update: {
					status: "revoked",
					publicKey: "",
					kid: null,
					updatedAt: now,
				},
			});

			const allAgents = await ctx.context.adapter.findMany<Agent>({
				model: TABLE.agent,
				where: [{ field: "hostId", value: host.id }],
			});

			const toRevoke = allAgents.filter(
				(a) => a.status !== "revoked" && a.status !== "rejected",
			);

			for (const agent of toRevoke) {
				await ctx.context.adapter.update({
					model: TABLE.agent,
					where: [{ field: "id", value: agent.id }],
					update: {
						status: "revoked",
						publicKey: "",
						kid: null,
						updatedAt: now,
					},
				});
				const grants =
					await ctx.context.adapter.findMany<AgentCapabilityGrant>({
						model: TABLE.grant,
						where: [{ field: "agentId", value: agent.id }],
					});
				for (const g of grants) {
					if (g.status === "active" || g.status === "pending") {
						await ctx.context.adapter.update({
							model: TABLE.grant,
							where: [{ field: "id", value: g.id }],
							update: { status: "denied", updatedAt: now },
						});
					}
				}
			}

			emit(opts, {
				type: "host.revoked",
				actorId:
					userSession?.user.id ??
					hostSession?.host.userId ??
					undefined,
				hostId: host.id,
				metadata: { agentsRevoked: toRevoke.length },
			}, ctx);

			return ctx.json({
				host_id: host.id,
				status: "revoked" as const,
				agents_revoked: toRevoke.length,
			});
		},
	);
}
