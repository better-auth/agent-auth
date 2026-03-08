import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import { verifyAgentJWT } from "../../utils/crypto";
import type { JtiCacheStore } from "../../utils/jti-cache";
import type { AgentHost, AgentJWK, ResolvedAgentAuthOptions } from "../../types";

export function reactivateHost(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiCacheStore,
) {
	return createAuthEndpoint(
		"/agent/host/reactivate",
		{
			method: "POST",
			body: z.object({
				host_id: z.string(),
				proof: z.string().meta({
					description:
						"A JWT signed by the host's private key proving possession.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Reactivate an expired agent host via proof-of-possession (§7).",
				},
			},
		},
		async (ctx) => {
			const { host_id: hostId, proof } = ctx.body;
			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: TABLE.host,
				where: [{ field: "id", value: hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERR.HOST_NOT_FOUND);
			}

			if (host.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERR.HOST_REVOKED);
			}

			if (host.status === "active") {
				return ctx.json({
					status: "active",
					message: "Agent host is already active.",
				});
			}

			if (!host.publicKey) {
				throw APIError.from("FORBIDDEN", ERR.HOST_REVOKED);
			}

			let hostPubKey: AgentJWK;
			try {
				hostPubKey = JSON.parse(host.publicKey) as AgentJWK;
			} catch {
				throw APIError.from("FORBIDDEN", ERR.INVALID_PUBLIC_KEY);
			}

			const payload = await verifyAgentJWT({
				jwt: proof,
				publicKey: hostPubKey,
				maxAge: opts.jwtMaxAge,
			});

			if (!payload || payload.sub !== host.id) {
				throw APIError.from("UNAUTHORIZED", ERR.INVALID_JWT);
			}

			if (jtiCache && payload.jti) {
				if (await jtiCache.has(String(payload.jti))) {
					throw APIError.from("UNAUTHORIZED", ERR.JWT_REPLAY);
				}
				await jtiCache.add(String(payload.jti), opts.jwtMaxAge);
			}

			const now = new Date();
			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			await ctx.context.adapter.update({
				model: TABLE.host,
				where: [{ field: "id", value: host.id }],
				update: {
					status: "active",
					activatedAt: now,
					expiresAt,
					lastUsedAt: now,
					updatedAt: now,
				},
			});

			emit(opts, {
				type: "host.reactivated",
				hostId: host.id,
				actorType: "system",
			}, ctx);

			return ctx.json({
				status: "active",
				hostId: host.id,
				activatedAt: now,
			});
		},
	);
}
