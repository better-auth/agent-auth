import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { JtiReplayCache } from "../jti-cache";
import { parseScopes } from "../scopes";
import type {
	Agent,
	AgentHost,
	AgentPermission,
	ResolvedAgentAuthOptions,
} from "../types";

const AGENT_TABLE = "agent";
const HOST_TABLE = "agentHost";
const PERMISSION_TABLE = "agentPermission";

/**
 * POST /agent/reactivate
 *
 * Reactivate an expired agent via proof-of-possession (§7).
 * The agent must be in "expired" state (public key retained).
 * Permissions decay to the host's scopes (§7.3).
 * `activatedAt` and `maxLifetime` clock reset.
 */
export function reactivateAgent(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return createAuthEndpoint(
		"/agent/reactivate",
		{
			method: "POST",
			body: z.object({
				agentId: z.string(),
				proof: z.string().meta({
					description:
						"A signed JWT from the agent's existing keypair proving possession.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Reactivate an expired agent via proof-of-possession. Permissions decay to host scopes.",
				},
			},
		},
		async (ctx) => {
			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: ctx.body.agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			if (agent.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERROR_CODES.AGENT_REVOKED);
			}

			if (agent.status === "active") {
				return ctx.json({
					status: "active",
					message: "Agent is already active.",
				});
			}

			if (opts.absoluteLifetime > 0 && agent.createdAt) {
				const absoluteExpiry =
					new Date(agent.createdAt).getTime() + opts.absoluteLifetime * 1000;
				if (Date.now() >= absoluteExpiry) {
					await ctx.context.adapter.update({
						model: AGENT_TABLE,
						where: [{ field: "id", value: agent.id }],
						update: {
							status: "revoked",
							publicKey: "",
							kid: null,
							updatedAt: new Date(),
						},
					});
					throw APIError.from("FORBIDDEN", ERROR_CODES.AGENT_REVOKED);
				}
			}

			if (!agent.publicKey) {
				throw APIError.from("FORBIDDEN", ERROR_CODES.AGENT_REVOKED);
			}

			let publicKey: AgentJWK;
			try {
				publicKey = JSON.parse(agent.publicKey);
			} catch {
				throw APIError.from("FORBIDDEN", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const payload = await verifyAgentJWT({
				jwt: ctx.body.proof,
				publicKey,
				maxAge: opts.jwtMaxAge,
			});

			if (!payload || payload.sub !== agent.id) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
			}

			if (jtiCache && payload.jti) {
				if (jtiCache.has(payload.jti)) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.JWT_REPLAY);
				}
				jtiCache.add(payload.jti, opts.jwtMaxAge);
			}

			const now = new Date();

			// Scope decay: if host exists, reset permissions to host scopes
			if (agent.hostId) {
				const host = await ctx.context.adapter.findOne<AgentHost>({
					model: HOST_TABLE,
					where: [{ field: "id", value: agent.hostId }],
				});

				if (!host || host.status === "revoked") {
					throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
				}

				const baseScopes: string[] = parseScopes(host.scopes);

				const existingPerms =
					await ctx.context.adapter.findMany<AgentPermission>({
						model: PERMISSION_TABLE,
						where: [{ field: "agentId", value: agent.id }],
					});
				for (const perm of existingPerms) {
					await ctx.context.adapter.delete({
						model: PERMISSION_TABLE,
						where: [{ field: "id", value: perm.id }],
					});
				}
				for (const scope of baseScopes) {
					await ctx.context.adapter.create({
						model: PERMISSION_TABLE,
						data: {
							agentId: agent.id,
							scope,
							referenceId: null,
							grantedBy: agent.userId,
							expiresAt: null,
							status: "active",
							reason: null,
							createdAt: now,
							updatedAt: now,
						},
					});
				}
			}
			// If no host, keep existing permissions as-is

			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			await ctx.context.adapter.update({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agent.id }],
				update: {
					status: "active",
					activatedAt: now,
					expiresAt,
					lastUsedAt: now,
					updatedAt: now,
				},
			});

			const permissions = await ctx.context.adapter.findMany<AgentPermission>({
				model: PERMISSION_TABLE,
				where: [{ field: "agentId", value: agent.id }],
			});

			const activePermissions = permissions.filter(
				(p) => p.status === "active",
			);

			return ctx.json({
				status: "active",
				agentId: agent.id,
				permissions: activePermissions.map((p) => ({
					scope: p.scope,
					referenceId: p.referenceId,
					grantedBy: p.grantedBy,
				})),
				activatedAt: now,
			});
		},
	);
}
