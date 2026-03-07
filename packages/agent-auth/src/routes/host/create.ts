import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { TABLE, DEFAULTS } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import {
	generateEnrollmentToken,
} from "../../utils/approval";
import type { AgentHost, ResolvedAgentAuthOptions } from "../../types";
import {
	findHostByKey,
	validateKeyAlgorithm,
	validateCapabilityIds,
	validateCapabilitiesExist,
} from "../_helpers";

export function createHost(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/host/create",
		{
			method: "POST",
			body: z.object({
				name: z.string().optional().meta({
					description:
						"Human-readable name identifying the environment/device.",
				}),
				publicKey: z
					.record(
						z.string(),
						z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
					)
					.optional()
					.meta({
						description:
							"Host Ed25519 public key as JWK. Optional when jwksUrl is provided or for enrollment flow.",
					}),
				jwksUrl: z.string().url().optional().meta({
					description:
						"JWKS URL for remote key discovery. If provided, publicKey is optional.",
				}),
				defaultCapabilityIds: z.array(z.string()).optional().meta({
					description:
						"Default capability IDs agents inherit. Reactivated agents reset to these.",
				}),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Create or reactivate an agent host (§3.2). If a kid matches an existing host, that host is reactivated.",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const {
				name: hostName,
				publicKey,
				jwksUrl,
				defaultCapabilityIds: bodyCapIds,
			} = ctx.body;
			const isEnrollmentFlow = !publicKey && !jwksUrl;

			if (publicKey) {
				if (!publicKey.kty || !publicKey.x) {
					throw APIError.from("BAD_REQUEST", ERR.INVALID_PUBLIC_KEY);
				}
				validateKeyAlgorithm(publicKey, opts.allowedKeyAlgorithms);
			}

			const defaultCapabilityIds = bodyCapIds ?? [];
			validateCapabilityIds(defaultCapabilityIds, opts);
			await validateCapabilitiesExist(defaultCapabilityIds, opts);

			const now = new Date();
			const kid = publicKey
				? (publicKey.kid as string | undefined) ?? null
				: null;
			const expiresAt =
				!isEnrollmentFlow && opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			if (publicKey) {
				const existing = await findHostByKey(ctx.context.adapter, publicKey);
				if (existing && existing.status === "revoked") {
					throw APIError.from("FORBIDDEN", ERR.HOST_REVOKED);
				}

				if (existing) {
					if (existing.userId && existing.userId !== session.user.id) {
						throw APIError.from("CONFLICT", ERR.HOST_ALREADY_LINKED);
					}
					if (!existing.userId) {
						await opts.onHostClaimed?.({
							ctx,
							hostId: existing.id,
							userId: session.user.id,
							previousUserId: null,
						});
					}
					const reactivateUpdate: Record<string, unknown> = {
						defaultCapabilityIds,
						publicKey: JSON.stringify(publicKey),
						jwksUrl: jwksUrl ?? null,
						userId: session.user.id,
						status: "active",
						activatedAt: now,
						expiresAt,
						updatedAt: now,
					};
					if (hostName) {
						reactivateUpdate.name = hostName;
					}
					await ctx.context.adapter.update({
						model: TABLE.host,
						where: [{ field: "id", value: existing.id }],
						update: reactivateUpdate,
					});

					emit(opts, {
						type: "host.reactivated",
						actorId: session.user.id,
						hostId: existing.id,
						metadata: { defaultCapabilityIds },
					}, ctx);

					return ctx.json({
						hostId: existing.id,
						default_capability_ids: defaultCapabilityIds,
						status: "active",
					});
				}
			}

			let enrollmentTokenPlaintext: string | null = null;
			let enrollmentTokenHash: string | null = null;
			let enrollmentTokenExpiresAt: Date | null = null;

			if (isEnrollmentFlow) {
				const token = await generateEnrollmentToken();
				enrollmentTokenPlaintext = token.plaintext;
				enrollmentTokenHash = token.hash;
				enrollmentTokenExpiresAt = new Date(
					now.getTime() + DEFAULTS.enrollmentTokenTTL * 1000,
				);
			}

			const host = await ctx.context.adapter.create<
				Record<string, unknown>,
				AgentHost
			>({
				model: TABLE.host,
				data: {
					name: hostName ?? null,
					userId: session.user.id,
					defaultCapabilityIds,
					publicKey: publicKey ? JSON.stringify(publicKey) : "",
					kid,
					jwksUrl: jwksUrl ?? null,
					enrollmentTokenHash,
					enrollmentTokenExpiresAt,
					status: isEnrollmentFlow ? "pending_enrollment" : "active",
					activatedAt: isEnrollmentFlow ? null : now,
					expiresAt,
					lastUsedAt: null,
					createdAt: now,
					updatedAt: now,
				},
			});

			emit(opts, {
				type: "host.created",
				actorId: session.user.id,
				hostId: host.id,
				metadata: {
					defaultCapabilityIds,
					status: isEnrollmentFlow ? "pending_enrollment" : "active",
				},
			}, ctx);

			if (isEnrollmentFlow) {
				return ctx.json({
					hostId: host.id,
					default_capability_ids: defaultCapabilityIds,
					status: "pending_enrollment",
					enrollmentToken: enrollmentTokenPlaintext,
					enrollmentTokenExpiresAt,
				});
			}

			return ctx.json({
				hostId: host.id,
				default_capability_ids: defaultCapabilityIds,
				status: "active",
			});
		},
	);
}
