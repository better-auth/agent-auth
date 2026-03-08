import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import { TABLE } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import { verifyAgentJWT } from "../../utils/crypto";
import type { JwksCacheStore } from "../../utils/jwks-cache";
import { MemoryJwksCache } from "../../utils/jwks-cache";
import type { JtiCacheStore } from "../../utils/jti-cache";
import type { AgentHost, AgentJWK, ResolvedAgentAuthOptions } from "../../types";
import { validateKeyAlgorithm } from "../_helpers";

export function rotateHostKey(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiCacheStore,
	jwksCache?: JwksCacheStore,
) {
	const cache = jwksCache ?? new MemoryJwksCache();
	return createAuthEndpoint(
		"/host/rotate-key",
		{
			method: "POST",
			body: z.object({
				public_key: z
					.record(
						z.string(),
						z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
					)
					.meta({ description: "New public key as JWK" }),
			}),
			metadata: {
				openapi: {
					description:
						"Rotate a host's public key via host JWT (§6.8). Old key stops working immediately.",
				},
			},
		},
		async (ctx) => {
			const { public_key: publicKey } = ctx.body;

			const authHeader = ctx.headers?.get("authorization");
			const bearer = authHeader?.replace(/^Bearer\s+/i, "");
			if (!bearer || bearer === authHeader) {
				throw APIError.from("UNAUTHORIZED", ERR.INVALID_JWT);
			}

			let hostId: string;
			try {
				const decoded = decodeJwt(bearer);
				if (!decoded.sub) {
					throw new Error("Missing sub");
				}
				hostId = decoded.sub;
			} catch {
				throw APIError.from("UNAUTHORIZED", ERR.INVALID_JWT);
			}

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

			if (!host.publicKey && !host.jwksUrl) {
				throw APIError.from("FORBIDDEN", ERR.HOST_REVOKED);
			}

			let currentPubKey: AgentJWK;
			if (host.jwksUrl) {
				const header = await decodeProtectedHeader(bearer);
				if (!header.kid) {
					throw APIError.from("UNAUTHORIZED", ERR.INVALID_JWT);
				}
				const key = await cache.getKeyByKid(host.jwksUrl, header.kid);
				if (!key) {
					throw APIError.from("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
				}
				currentPubKey = key as AgentJWK;
			} else {
				try {
					currentPubKey = JSON.parse(host.publicKey!) as AgentJWK;
				} catch {
					throw APIError.from("FORBIDDEN", ERR.INVALID_PUBLIC_KEY);
				}
			}

			const payload = await verifyAgentJWT({
				jwt: bearer,
				publicKey: currentPubKey,
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

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERR.INVALID_PUBLIC_KEY);
			}

			validateKeyAlgorithm(publicKey, opts.allowedKeyAlgorithms);

			const kid = (publicKey.kid as string | undefined) ?? null;

			await ctx.context.adapter.update({
				model: TABLE.host,
				where: [{ field: "id", value: host.id }],
				update: {
					publicKey: JSON.stringify(publicKey),
					kid,
					updatedAt: new Date(),
				},
			});

			emit(opts, {
				type: "host.key_rotated",
				hostId: host.id,
				actorType: "system",
			}, ctx);

			return ctx.json({
				host_id: host.id,
				status: "active" as const,
			});
		},
	);
}
