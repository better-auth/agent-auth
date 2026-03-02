import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { JtiReplayCache } from "../jti-cache";
import { JWKSCache } from "../jwks-cache";
import type { AgentHost, ResolvedAgentAuthOptions } from "../types";

const HOST_TABLE = "agentHost";

const jwksCache = new JWKSCache();

/**
 * POST /agent/host/rotate-key
 *
 * Rotate a host's public key in-place (§2.11).
 * Authenticated via host JWT signed with the current key.
 * The old key stops working immediately. All agents under the host
 * continue to work — only the host's authentication key changes.
 */
export function rotateHostKey(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return createAuthEndpoint(
		"/agent/host/rotate-key",
		{
			method: "POST",
			body: z.object({
				hostJWT: z.string().meta({
					description:
						"JWT signed by the host's current private key (sub = hostId).",
				}),
				publicKey: z
					.record(
						z.string(),
						z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
					)
					.meta({ description: "New public key as JWK" }),
			}),
			metadata: {
				openapi: {
					description:
						"Rotate a host's public key via host JWT (§2.11). Old key stops working immediately.",
				},
			},
		},
		async (ctx) => {
			const { hostJWT, publicKey } = ctx.body;

			let hostId: string;
			try {
				const decoded = decodeJwt(hostJWT);
				if (!decoded.sub) {
					throw new Error("Missing sub");
				}
				hostId = decoded.sub;
			} catch {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
			}

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: HOST_TABLE,
				where: [{ field: "id", value: hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
			}

			if (host.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
			}

			if (!host.publicKey && !host.jwksUrl) {
				throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
			}

			let currentPubKey: AgentJWK;
			if (host.jwksUrl) {
				const header = await decodeProtectedHeader(hostJWT);
				if (!header.kid) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
				}
				const key = await jwksCache.getKeyByKid(host.jwksUrl, header.kid);
				if (!key) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_PUBLIC_KEY);
				}
				currentPubKey = key as AgentJWK;
			} else {
				try {
					currentPubKey = JSON.parse(host.publicKey);
				} catch {
					throw APIError.from("FORBIDDEN", ERROR_CODES.INVALID_PUBLIC_KEY);
				}
			}

			const payload = await verifyAgentJWT({
				jwt: hostJWT,
				publicKey: currentPubKey,
				maxAge: opts.jwtMaxAge,
			});

			if (!payload || payload.sub !== host.id) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
			}

			if (jtiCache && payload.jti) {
				if (jtiCache.has(payload.jti)) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.JWT_REPLAY);
				}
				jtiCache.add(payload.jti, opts.jwtMaxAge);
			}

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const kty = publicKey.kty as string;
			const crv = (publicKey.crv as string) ?? null;
			const keyAlg = crv ? `${crv}` : kty;
			if (!opts.allowedKeyAlgorithms.includes(keyAlg)) {
				throw new APIError("BAD_REQUEST", {
					message: `Key algorithm "${keyAlg}" is not allowed. Accepted: ${opts.allowedKeyAlgorithms.join(", ")}`,
				});
			}

			const kid = (publicKey.kid as string) ?? null;

			await ctx.context.adapter.update({
				model: HOST_TABLE,
				where: [{ field: "id", value: host.id }],
				update: {
					publicKey: JSON.stringify(publicKey),
					kid,
					updatedAt: new Date(),
				},
			});

			return ctx.json({
				host_id: host.id,
				status: "active",
			});
		},
	);
}
