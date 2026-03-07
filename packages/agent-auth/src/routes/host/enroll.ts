import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import { hashToken } from "../../utils/approval";
import { parseCapabilityIds } from "../../utils/capabilities";
import type { Agent, AgentHost, ResolvedAgentAuthOptions } from "../../types";
import { findHostByKey, validateKeyAlgorithm } from "../_helpers";

export function enrollHost(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/host/enroll",
		{
			method: "POST",
			body: z.object({
				token: z.string().meta({
					description:
						"One-time enrollment token received from the dashboard.",
				}),
				publicKey: z
					.record(
						z.string(),
						z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
					)
					.meta({
						description:
							"Host Ed25519 public key as JWK, generated on the device.",
					}),
				name: z.string().optional().meta({
					description: "Override the host name set during provisioning.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Enroll a device as a host using a one-time enrollment token (§3.2).",
				},
			},
		},
		async (ctx) => {
			const { token, publicKey, name } = ctx.body;

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERR.INVALID_PUBLIC_KEY);
			}

			validateKeyAlgorithm(publicKey, opts.allowedKeyAlgorithms);

			const tokenHash = await hashToken(token);

			const hosts = await ctx.context.adapter.findMany<AgentHost>({
				model: TABLE.host,
				where: [{ field: "enrollmentTokenHash", value: tokenHash }],
			});

			const host = hosts[0] ?? null;
			if (!host) {
				throw APIError.from("UNAUTHORIZED", ERR.ENROLLMENT_TOKEN_INVALID);
			}

			if (host.status !== "pending_enrollment") {
				throw APIError.from("BAD_REQUEST", ERR.HOST_NOT_PENDING_ENROLLMENT);
			}

			if (
				host.enrollmentTokenExpiresAt &&
				new Date(host.enrollmentTokenExpiresAt) <= new Date()
			) {
				throw APIError.from("UNAUTHORIZED", ERR.ENROLLMENT_TOKEN_EXPIRED);
			}

			const now = new Date();
			const kid = (publicKey.kid as string | undefined) ?? null;
			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			const existing = await findHostByKey(ctx.context.adapter, publicKey);
			if (existing && existing.id !== host.id) {
				if (existing.status === "revoked") {
					throw APIError.from("FORBIDDEN", ERR.HOST_REVOKED);
				}
				if (existing.userId && existing.userId !== host.userId) {
					throw APIError.from("CONFLICT", ERR.HOST_ALREADY_LINKED);
				}
				if (!existing.userId && host.userId) {
					await opts.onHostClaimed?.({
						ctx,
						hostId: existing.id,
						userId: host.userId,
						previousUserId: null,
					});
				}

				await ctx.context.adapter.update({
					model: TABLE.host,
					where: [{ field: "id", value: existing.id }],
					update: {
						name: name ?? host.name ?? existing.name,
						userId: existing.userId ?? host.userId,
						publicKey: JSON.stringify(publicKey),
						kid,
						status: "active",
						activatedAt: now,
						expiresAt,
						enrollmentTokenHash: null,
						enrollmentTokenExpiresAt: null,
						updatedAt: now,
					},
				});

				if (!existing.userId && host.userId) {
					const hostAgents = await ctx.context.adapter.findMany<Agent>({
						model: TABLE.agent,
						where: [{ field: "hostId", value: existing.id }],
					});
					for (const agent of hostAgents) {
						await ctx.context.adapter.update({
							model: TABLE.agent,
							where: [{ field: "id", value: agent.id }],
							update: { userId: host.userId, updatedAt: now },
						});
					}
				}

				await ctx.context.adapter.update({
					model: TABLE.host,
					where: [{ field: "id", value: host.id }],
					update: {
						status: "rejected",
						enrollmentTokenHash: null,
						enrollmentTokenExpiresAt: null,
						updatedAt: now,
					},
				});

				return ctx.json({
					hostId: existing.id,
					name: name ?? host.name ?? existing.name,
					default_capability_ids: parseCapabilityIds(
						existing.defaultCapabilityIds,
					),
					status: "active",
				});
			}

			const update: Record<string, unknown> = {
				publicKey: JSON.stringify(publicKey),
				kid,
				status: "active",
				activatedAt: now,
				expiresAt,
				enrollmentTokenHash: null,
				enrollmentTokenExpiresAt: null,
				updatedAt: now,
			};

			if (name) {
				update.name = name;
			}

			await ctx.context.adapter.update({
				model: TABLE.host,
				where: [{ field: "id", value: host.id }],
				update,
			});

			emit(opts, {
				type: "host.enrolled",
				hostId: host.id,
				actorType: "system",
				metadata: { name: name ?? host.name },
			}, ctx);

			return ctx.json({
				hostId: host.id,
				name: name ?? host.name,
				default_capability_ids: parseCapabilityIds(host.defaultCapabilityIds),
				status: "active",
			});
		},
	);
}
