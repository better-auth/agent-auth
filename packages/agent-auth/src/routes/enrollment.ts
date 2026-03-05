import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { JtiReplayCache } from "../jti-cache";
import { findBlockedScopes, parseScopes } from "../scopes";
import type { Agent, AgentHost, ResolvedAgentAuthOptions } from "../types";

const ENROLLMENT_TOKEN_TTL = 3600;

async function generateEnrollmentToken(): Promise<{
	plaintext: string;
	hash: string;
}> {
	const bytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	const plaintext = btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(plaintext),
	);
	const hashBytes = new Uint8Array(digest);
	let hashBinary = "";
	for (const byte of hashBytes) {
		hashBinary += String.fromCharCode(byte);
	}
	const hash = btoa(hashBinary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	return { plaintext, hash };
}

async function hashToken(token: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	const bytes = new Uint8Array(digest);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

const HOST_TABLE = "agentHost";
const AGENT_TABLE = "agent";
const MEMBER_TABLE = "member";

type BetterAuthAdapter = {
	findMany: <T>(opts: {
		model: string;
		where: Array<{ field: string; value: string }>;
	}) => Promise<T[]>;
	[key: string]: unknown;
};

async function checkSharedOrg(
	adapter: BetterAuthAdapter,
	userA: string,
	userB: string,
): Promise<boolean> {
	try {
		const membershipsA = await adapter.findMany<{
			organizationId: string;
		}>({
			model: MEMBER_TABLE,
			where: [{ field: "userId", value: userA }],
		});
		if (membershipsA.length === 0) return false;

		const orgIds = membershipsA.map((m) => m.organizationId);
		for (const orgId of orgIds) {
			const membershipsB = await adapter.findMany<{
				organizationId: string;
			}>({
				model: MEMBER_TABLE,
				where: [
					{ field: "userId", value: userB },
					{ field: "organizationId", value: orgId },
				],
			});
			if (membershipsB.length > 0) return true;
		}
		return false;
	} catch {
		return false;
	}
}

export function createHost(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/host/create",
		{
			method: "POST",
			body: z.object({
				name: z.string().optional().meta({
					description:
						"Human-readable name identifying the environment/device (e.g. 'Cursor on MacBook-Pro').",
				}),
				publicKey: z
					.record(
						z.string(),
						z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
					)
					.optional()
					.meta({
						description:
							"Host Ed25519 public key as JWK. Client retains the private key. Optional when jwksUrl is provided.",
					}),
				jwksUrl: z.string().url().optional().meta({
					description:
						"JWKS URL for remote key discovery. If provided, publicKey is optional.",
				}),
				scopes: z.array(z.string()).optional().meta({
					description:
						"Default scopes agents inherit. Reactivated agents reset to these.",
				}),
				referenceId: z.string().optional().meta({
					description:
						"Optional server-defined external identifier (org ID, tenant ID, etc.).",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Create or reactivate an agent host. If a kid matches an existing host for this user, that host is reactivated (§4.3).",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { name: hostName, publicKey, jwksUrl, referenceId } = ctx.body;
			const isEnrollmentFlow = !publicKey && !jwksUrl;

			if (publicKey) {
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
			}

			const hostScopes = ctx.body.scopes ?? [];

			if (hostScopes.length > 0 && opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(hostScopes, opts.blockedScopes);
				if (blocked.length > 0) {
					throw new APIError("BAD_REQUEST", {
						message: `${ERROR_CODES.SCOPE_BLOCKED} Blocked: ${blocked.join(", ")}.`,
					});
				}
			}

			if (hostScopes.length > 0 && opts.validateScopes) {
				const valid = await opts.validateScopes(hostScopes);
				if (!valid) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.UNKNOWN_SCOPES);
				}
			}

			const now = new Date();
			const kid = publicKey ? ((publicKey.kid as string) ?? null) : null;
			const expiresAt =
				!isEnrollmentFlow && opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			// §4.3: Idempotent creation — if same kid+userId exists, reactivate it
			if (kid) {
				const existing = await ctx.context.adapter.findOne<AgentHost>({
					model: HOST_TABLE,
					where: [
						{ field: "kid", value: kid },
						{ field: "userId", value: session.user.id },
					],
				});

				if (existing && existing.status === "revoked") {
					throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
				}

				if (existing) {
					const reactivateUpdate: Record<string, unknown> = {
						scopes: hostScopes,
						publicKey: publicKey ? JSON.stringify(publicKey) : "",
						jwksUrl: jwksUrl ?? null,
						status: "active",
						activatedAt: now,
						expiresAt,
						updatedAt: now,
					};
					if (hostName) {
						reactivateUpdate.name = hostName;
					}
					await ctx.context.adapter.update({
						model: HOST_TABLE,
						where: [{ field: "id", value: existing.id }],
						update: reactivateUpdate,
					});

					emit(opts, {
						type: "host.reactivated",
						actorId: session.user.id,
						hostId: existing.id,
						metadata: { scopes: hostScopes },
					});

					return ctx.json({
						hostId: existing.id,
						scopes: hostScopes,
						status: "active",
						reactivated: true,
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
					now.getTime() + ENROLLMENT_TOKEN_TTL * 1000,
				);
			}

			const host = await ctx.context.adapter.create<
				Record<string, unknown>,
				AgentHost
			>({
				model: HOST_TABLE,
				data: {
					name: hostName ?? null,
					userId: session.user.id,
					referenceId: referenceId ?? null,
					scopes: hostScopes,
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
					scopes: hostScopes,
					status: isEnrollmentFlow ? "pending_enrollment" : "active",
				},
			});

			if (isEnrollmentFlow) {
				return ctx.json({
					hostId: host.id,
					scopes: hostScopes,
					status: "pending_enrollment",
					enrollmentToken: enrollmentTokenPlaintext,
					enrollmentTokenExpiresAt,
				});
			}

			return ctx.json({
				hostId: host.id,
				scopes: hostScopes,
				status: "active",
			});
		},
	);
}

export function listHosts() {
	return createAuthEndpoint(
		"/agent/host/list",
		{
			method: "GET",
			query: z
				.object({
					status: z
						.enum([
							"active",
							"pending",
							"pending_enrollment",
							"expired",
							"revoked",
							"rejected",
						])
						.optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description: "List agent hosts for the current user.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const where: { field: string; value: string }[] = [
				{ field: "userId", value: session.user.id },
			];
			if (ctx.query?.status) {
				where.push({ field: "status", value: ctx.query.status });
			}

			const hosts = await ctx.context.adapter.findMany<AgentHost>({
				model: HOST_TABLE,
				where,
				sortBy: { field: "createdAt", direction: "desc" },
			});

			return ctx.json({
				hosts: hosts.map((e) => ({
					id: e.id,
					name: e.name ?? null,
					scopes: parseScopes(e.scopes),
					status: e.status,
					activatedAt: e.activatedAt,
					expiresAt: e.expiresAt,
					lastUsedAt: e.lastUsedAt,
					createdAt: e.createdAt,
					updatedAt: e.updatedAt,
				})),
			});
		},
	);
}

export function getHost() {
	return createAuthEndpoint(
		"/agent/host/get",
		{
			method: "GET",
			query: z.object({
				hostId: z.string(),
			}),
			metadata: {
				openapi: {
					description: "Get a specific agent host by ID.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: HOST_TABLE,
				where: [
					{ field: "id", value: ctx.query.hostId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
			}

			return ctx.json({
				id: host.id,
				name: host.name ?? null,
				scopes: parseScopes(host.scopes),
				status: host.status,
				activatedAt: host.activatedAt,
				expiresAt: host.expiresAt,
				lastUsedAt: host.lastUsedAt,
				createdAt: host.createdAt,
				updatedAt: host.updatedAt,
			});
		},
	);
}

export function revokeHost(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/host/revoke",
		{
			method: "POST",
			body: z.object({
				hostId: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Revoke an agent host (clears public key) and cascade to all agents under it (§9.3).",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: HOST_TABLE,
				where: [{ field: "id", value: ctx.body.hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
			}

			if (host.userId !== session.user.id && host.userId !== null) {
				const sameOrg = await checkSharedOrg(
					ctx.context.adapter,
					session.user.id,
					host.userId,
				);
				if (!sameOrg) {
					throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
				}
			}

			if (host.status === "revoked") {
				return ctx.json({
					host_id: host.id,
					status: "revoked",
					agents_revoked: 0,
				});
			}

			const now = new Date();

			await ctx.context.adapter.update({
				model: HOST_TABLE,
				where: [{ field: "id", value: host.id }],
				update: {
					status: "revoked",
					publicKey: "",
					kid: null,
					updatedAt: now,
				},
			});

			const allAgents = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "hostId", value: host.id }],
			});

			const toRevoke = allAgents.filter(
				(a) => a.status !== "revoked" && a.status !== "rejected",
			);

			for (const agent of toRevoke) {
				await ctx.context.adapter.update({
					model: AGENT_TABLE,
					where: [{ field: "id", value: agent.id }],
					update: {
						status: "revoked",
						publicKey: "",
						kid: null,
						updatedAt: now,
					},
				});
			}

			emit(opts, {
				type: "host.revoked",
				actorId: session.user.id,
				hostId: host.id,
				metadata: { agentsRevoked: toRevoke.length },
			});

			return ctx.json({
				host_id: host.id,
				status: "revoked",
				agents_revoked: toRevoke.length,
			});
		},
	);
}

/**
 * POST /agent/host/reactivate
 *
 * Reactivate an expired agent host via proof-of-possession.
 * The host must be in "expired" state (public key retained).
 */
export function reactivateHost(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return createAuthEndpoint(
		"/agent/host/reactivate",
		{
			method: "POST",
			body: z.object({
				hostId: z.string(),
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
			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: HOST_TABLE,
				where: [{ field: "id", value: ctx.body.hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
			}

			if (host.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
			}

			if (host.status === "active") {
				return ctx.json({
					status: "active",
					message: "Agent host is already active.",
				});
			}

			if (!host.publicKey) {
				throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
			}

			let hostPubKey: AgentJWK;
			try {
				hostPubKey = JSON.parse(host.publicKey);
			} catch {
				throw APIError.from("FORBIDDEN", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const payload = await verifyAgentJWT({
				jwt: ctx.body.proof,
				publicKey: hostPubKey,
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

			// §9.2 absoluteLifetime — cannot reactivate past absolute lifetime
			if (opts.absoluteLifetime > 0 && host.createdAt) {
				const absoluteExpiry =
					new Date(host.createdAt).getTime() + opts.absoluteLifetime * 1000;
				if (Date.now() >= absoluteExpiry) {
					await ctx.context.adapter.update({
						model: HOST_TABLE,
						where: [{ field: "id", value: host.id }],
						update: {
							status: "revoked",
							publicKey: "",
							kid: null,
							updatedAt: new Date(),
						},
					});
					throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
				}
			}

			const now = new Date();
			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			await ctx.context.adapter.update({
				model: HOST_TABLE,
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
			});

			return ctx.json({
				status: "active",
				hostId: host.id,
				activatedAt: now,
			});
		},
	);
}

export function updateHost(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/host/update",
		{
			method: "POST",
			body: z.object({
				hostId: z.string().meta({ description: "ID of the host to update" }),
				name: z.string().optional().meta({
					description: "Human-readable name identifying the environment/device",
				}),
				publicKey: z
					.record(
						z.string(),
						z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
					)
					.optional()
					.meta({ description: "New static public key as JWK" }),
				jwksUrl: z
					.string()
					.url()
					.optional()
					.meta({ description: "New JWKS URL for remote key discovery" }),
				scopes: z
					.array(z.string())
					.optional()
					.meta({ description: "Update pre-authorized scopes" }),
			}),
			metadata: {
				openapi: {
					description:
						"Update an agent host's name, public key, JWKS URL, or scopes. Requires user session.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: HOST_TABLE,
				where: [{ field: "id", value: ctx.body.hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
			}

			if (host.userId !== session.user.id && host.userId !== null) {
				const sameOrg = await checkSharedOrg(
					ctx.context.adapter,
					session.user.id,
					host.userId,
				);
				if (!sameOrg) {
					throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
				}
			}

			if (host.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
			}

			const { name, publicKey, jwksUrl, scopes } = ctx.body;

			const update: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (name !== undefined) {
				update.name = name;
			}

			if (publicKey) {
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
				update.publicKey = JSON.stringify(publicKey);
				update.kid = (publicKey.kid as string) ?? null;
			}

			if (jwksUrl !== undefined) {
				update.jwksUrl = jwksUrl;
			}

			if (scopes !== undefined) {
				if (scopes.length > 0 && opts.blockedScopes.length > 0) {
					const blocked = findBlockedScopes(scopes, opts.blockedScopes);
					if (blocked.length > 0) {
						throw new APIError("BAD_REQUEST", {
							message: `${ERROR_CODES.SCOPE_BLOCKED} Blocked: ${blocked.join(", ")}.`,
						});
					}
				}

				if (scopes.length > 0 && opts.validateScopes) {
					const valid = await opts.validateScopes(scopes);
					if (!valid) {
						throw APIError.from("BAD_REQUEST", ERROR_CODES.UNKNOWN_SCOPES);
					}
				}

				update.scopes = scopes;
			}

			await ctx.context.adapter.update({
				model: HOST_TABLE,
				where: [{ field: "id", value: host.id }],
				update,
			});

			const updated = await ctx.context.adapter.findOne<AgentHost>({
				model: HOST_TABLE,
				where: [{ field: "id", value: host.id }],
			});

			emit(opts, {
				type: "host.updated",
				actorId: session.user.id,
				hostId: host.id,
				metadata: { name, scopes, jwksUrl },
			});

			return ctx.json({
				id: updated!.id,
				scopes: parseScopes(updated!.scopes),
				jwksUrl: updated!.jwksUrl,
				status: updated!.status,
				updatedAt: updated!.updatedAt,
			});
		},
	);
}

/**
 * POST /agent/host/enroll
 *
 * Claim a dashboard-provisioned host using a one-time enrollment token.
 * The device generates a keypair locally, sends the public key and token.
 * No session auth required — the token IS the authorization.
 */
export function enrollHost(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/host/enroll",
		{
			method: "POST",
			body: z.object({
				token: z.string().meta({
					description: "One-time enrollment token received from the dashboard.",
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
						"Enroll a device as a host using a one-time enrollment token from the dashboard. " +
						"The device generates a keypair locally and sends the public key.",
				},
			},
		},
		async (ctx) => {
			const { token, publicKey, name } = ctx.body;

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

			const tokenHash = await hashToken(token);

			const hosts = await ctx.context.adapter.findMany<AgentHost>({
				model: HOST_TABLE,
				where: [{ field: "enrollmentTokenHash", value: tokenHash }],
			});

			const host = hosts[0] ?? null;
			if (!host) {
				throw APIError.from(
					"UNAUTHORIZED",
					ERROR_CODES.ENROLLMENT_TOKEN_INVALID,
				);
			}

			if (host.status !== "pending_enrollment") {
				throw APIError.from(
					"BAD_REQUEST",
					ERROR_CODES.HOST_NOT_PENDING_ENROLLMENT,
				);
			}

			if (
				host.enrollmentTokenExpiresAt &&
				new Date(host.enrollmentTokenExpiresAt) <= new Date()
			) {
				throw APIError.from(
					"UNAUTHORIZED",
					ERROR_CODES.ENROLLMENT_TOKEN_EXPIRED,
				);
			}

			const now = new Date();
			const kid = (publicKey.kid as string) ?? null;
			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

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
				model: HOST_TABLE,
				where: [{ field: "id", value: host.id }],
				update,
			});

			emit(opts, {
				type: "host.enrolled",
				hostId: host.id,
				actorType: "system",
				metadata: { name: name ?? host.name },
			});

			return ctx.json({
				hostId: host.id,
				name: name ?? host.name,
				scopes: parseScopes(host.scopes),
				status: "active",
			});
		},
	);
}
