import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import { TABLE } from "../../constants";
import { emit } from "../../emit";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import type {
	AgentHost,
	AgentJWK,
	ResolvedAgentAuthOptions,
} from "../../types";
import { verifyJWT } from "../../utils/crypto";
import type { JtiCacheStore } from "../../utils/jti-cache";
import type { JwksCacheStore } from "../../utils/jwks-cache";
import { MemoryJwksCache } from "../../utils/jwks-cache";
import { validateKeyAlgorithm } from "../_helpers";

export function rotateHostKey(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiCacheStore,
	jwksCache?: JwksCacheStore
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
						z.union([z.string(), z.boolean(), z.array(z.string())]).optional()
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
				throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
			}

			let hostId: string;
			try {
				const decoded = decodeJwt(bearer);
				const hdr = decodeProtectedHeader(bearer);
				// §4.2: Host JWTs MUST have typ: "host+jwt"
				if (hdr.typ !== "host+jwt") {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}
				// §4.2: iss = JWK thumbprint is the host identifier
				if (typeof decoded.iss !== "string") {
					throw new Error("Missing iss");
				}
				hostId = decoded.iss;
			} catch (e) {
				if (e instanceof APIError) {
					throw e;
				}
				throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
			}

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

			if (!(host.publicKey || host.jwksUrl)) {
				throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
			}

			let currentPubKey: AgentJWK;
			if (host.jwksUrl) {
				const header = await decodeProtectedHeader(bearer);
				if (!header.kid) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}
				const key = await cache.getKeyByKid(host.jwksUrl, header.kid);
				if (!key) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
				}
				currentPubKey = key as AgentJWK;
			} else {
				try {
					currentPubKey = JSON.parse(host.publicKey!) as AgentJWK;
				} catch {
					throw agentError("FORBIDDEN", ERR.INVALID_PUBLIC_KEY);
				}
			}

			const payload = await verifyJWT({
				jwt: bearer,
				publicKey: currentPubKey,
				maxAge: opts.jwtMaxAge,
			});

			// §4.2: iss identifies the host
			if (!payload || payload.iss !== host.id) {
				throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
			}

			if (!opts.dangerouslySkipJtiCheck) {
				if (!payload.jti) {
					throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
				}
				const jtiKey = `host:${hostId}:${payload.jti}`;
				if (jtiCache && (await jtiCache.has(jtiKey))) {
					throw agentError("UNAUTHORIZED", ERR.JWT_REPLAY);
				}
				if (jtiCache) {
					await jtiCache.add(jtiKey, opts.jwtMaxAge);
				}
			}

			if (!(publicKey.kty && publicKey.x)) {
				throw agentError("BAD_REQUEST", ERR.INVALID_PUBLIC_KEY);
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

			emit(
				opts,
				{
					type: "host.key_rotated",
					hostId: host.id,
					actorType: "system",
				},
				ctx
			);

			return ctx.json({
				host_id: host.id,
				status: "active" as const,
			});
		}
	);
}
