import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import { decodeJwt } from "jose";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { findBlockedScopes, isSubsetOf } from "../scopes";
import type { Agent, Enrollment, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";
const ENROLLMENT_TABLE = "agentEnrollment";

const createAgentBodySchema = z.object({
	name: z.string().min(1).meta({ description: "Friendly name for the agent" }),
	publicKey: z
		.record(
			z.string(),
			z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
		)
		.meta({ description: "Agent's Ed25519 public key as JWK" }),
	scopes: z
		.array(z.string())
		.meta({
			description:
				"Scope strings the agent is granted. When used with enrollmentJWT, must be a subset of baseScopes.",
		})
		.optional(),
	role: z.string().meta({ description: "Role name for the agent" }).optional(),
	orgId: z
		.string()
		.meta({ description: "Organization ID (if org-scoped)" })
		.optional(),
	workgroupId: z
		.string()
		.meta({ description: "Workgroup ID within the org" })
		.optional(),
	source: z
		.string()
		.meta({
			description:
				'Upstream application identifier (e.g. "cursor", "claude-code")',
		})
		.optional(),
	enrollmentJWT: z
		.string()
		.meta({
			description:
				"A JWT signed by the enrollment's private key (sub = enrollmentId). Enables silent agent creation without user session (§6).",
		})
		.optional(),
	metadata: z
		.record(
			z.string(),
			z.union([z.string(), z.number(), z.boolean(), z.null()]),
		)
		.meta({ description: "Optional metadata" })
		.optional(),
});

export function createAgent(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/create",
		{
			method: "POST",
			body: createAgentBodySchema,
			metadata: {
				openapi: {
					description:
						"Register a new agent with its public key. Supports session-based or enrollment-based (silent) creation via signed JWT.",
					responses: {
						"200": {
							description: "Agent created successfully",
						},
					},
				},
			},
		},
		async (ctx) => {
			const {
				name,
				publicKey,
				scopes,
				role,
				orgId,
				workgroupId,
				source,
				enrollmentJWT,
				metadata,
			} = ctx.body;

			let userId: string;
			let enrollmentId: string | null = null;
			let enrollmentBaseScopes: string[] | null = null;
			let deviceApprovedScopes: string[] | null = null;

			if (enrollmentJWT) {
				let enrollmentIdFromJwt: string;
				try {
					const decoded = decodeJwt(enrollmentJWT);
					if (!decoded.sub) {
						throw new Error("Missing sub");
					}
					enrollmentIdFromJwt = decoded.sub;
				} catch {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
				}

				const enrollment = await ctx.context.adapter.findOne<Enrollment>({
					model: ENROLLMENT_TABLE,
					where: [{ field: "id", value: enrollmentIdFromJwt }],
				});

				if (!enrollment) {
					throw APIError.from("NOT_FOUND", ERROR_CODES.ENROLLMENT_NOT_FOUND);
				}
				if (enrollment.status === "revoked") {
					throw APIError.from("FORBIDDEN", ERROR_CODES.ENROLLMENT_REVOKED);
				}
				if (enrollment.status === "expired") {
					throw APIError.from("FORBIDDEN", ERROR_CODES.ENROLLMENT_REVOKED);
				}

				if (!enrollment.publicKey) {
					throw APIError.from("FORBIDDEN", ERROR_CODES.ENROLLMENT_REVOKED);
				}

				let enrollmentPubKey: AgentJWK;
				try {
					enrollmentPubKey = JSON.parse(enrollment.publicKey);
				} catch {
					throw APIError.from("FORBIDDEN", ERROR_CODES.INVALID_PUBLIC_KEY);
				}

				const payload = await verifyAgentJWT({
					jwt: enrollmentJWT,
					publicKey: enrollmentPubKey,
					maxAge: opts.jwtMaxAge,
				});

				if (!payload || payload.sub !== enrollment.id) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_JWT);
				}

				userId = enrollment.userId;
				enrollmentId = enrollment.id;
				enrollmentBaseScopes =
					typeof enrollment.baseScopes === "string"
						? JSON.parse(enrollment.baseScopes)
						: enrollment.baseScopes;

				ctx.context.runInBackground(
					ctx.context.adapter
						.update({
							model: ENROLLMENT_TABLE,
							where: [{ field: "id", value: enrollment.id }],
							update: { lastUsedAt: new Date() },
						})
						.catch(() => {}),
				);
			} else {
				const cookieSession = await getSessionFromCtx(ctx);

				if (cookieSession) {
					userId = cookieSession.user.id;
				} else {
					const authHeader = ctx.headers?.get("authorization");
					const token = authHeader?.replace(/^Bearer\s+/i, "");
					if (!token || token === authHeader) {
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.UNAUTHORIZED_SESSION,
						);
					}
					const dbSession =
						await ctx.context.internalAdapter.findSession(token);
					if (
						!dbSession ||
						new Date(dbSession.session.expiresAt) <= new Date()
					) {
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.UNAUTHORIZED_SESSION,
						);
					}
					userId = dbSession.user.id;

					try {
						const deviceCodes = await ctx.context.adapter.findMany<{
							scope: string | null;
							status: string;
						}>({
							model: "deviceCode",
							where: [
								{ field: "userId", value: userId },
								{ field: "status", value: "approved" },
							],
							sortBy: { field: "createdAt", direction: "desc" },
							limit: 1,
						});
						const latestCode = deviceCodes[0];
						if (deviceCodes.length > 0 && latestCode?.scope) {
							deviceApprovedScopes = latestCode.scope
								.split(" ")
								.filter(Boolean);
						}
					} catch {
						// device code lookup is best-effort
					}
				}
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

			if (opts.maxAgentsPerUser > 0) {
				const activeCount = await ctx.context.adapter.count({
					model: AGENT_TABLE,
					where: [
						{ field: "userId", value: userId },
						{ field: "status", value: "active" },
					],
				});
				if (activeCount >= opts.maxAgentsPerUser) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.AGENT_LIMIT_REACHED);
				}
			}

			const resolvedRole = role ?? opts.defaultRole ?? null;
			const roleScopes =
				resolvedRole && opts.roles?.[resolvedRole]
					? opts.roles[resolvedRole]
					: [];

			let resolvedScopes: string[];

			if (enrollmentBaseScopes !== null) {
				// §6.2: scopes must be a subset of enrollment's baseScopes.
				// If omitted, the full baseScopes are granted (§6.1).
				if (scopes && scopes.length > 0) {
					if (!isSubsetOf(scopes, enrollmentBaseScopes)) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Requested scopes must be a subset of the enrollment's baseScopes.",
						});
					}
					resolvedScopes = scopes;
				} else {
					resolvedScopes = enrollmentBaseScopes;
				}
			} else {
				resolvedScopes = scopes ?? roleScopes;
			}

			if (resolvedScopes.length > 0 && opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(resolvedScopes, opts.blockedScopes);
				if (blocked.length > 0) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.SCOPE_BLOCKED);
				}
			}

			if (resolvedScopes.length > 0 && opts.validateScopes) {
				if (typeof opts.validateScopes === "function") {
					const valid = await opts.validateScopes(resolvedScopes);
					if (!valid) {
						throw APIError.from("BAD_REQUEST", ERROR_CODES.UNKNOWN_SCOPES);
					}
				} else {
					const knownScopes = new Set(Object.values(opts.roles ?? {}).flat());
					const invalid = resolvedScopes.filter(
						(s: string) => !knownScopes.has(s),
					);
					if (invalid.length > 0) {
						throw new APIError("BAD_REQUEST", {
							message: `${ERROR_CODES.UNKNOWN_SCOPES} Unrecognized: ${invalid.join(", ")}.`,
						});
					}
				}
			}

			if (deviceApprovedScopes !== null && deviceApprovedScopes.length > 0) {
				resolvedScopes = deviceApprovedScopes;
			}

			const now = new Date();
			const kid = (publicKey.kid as string) ?? null;
			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			if (kid) {
				const existing = await ctx.context.adapter.findOne<Agent>({
					model: AGENT_TABLE,
					where: [
						{ field: "kid", value: kid },
						{ field: "userId", value: userId },
					],
				});

				if (existing) {
					const reactivationScopes =
						enrollmentBaseScopes !== null ? resolvedScopes : resolvedScopes;

					await ctx.context.adapter.update({
						model: AGENT_TABLE,
						where: [{ field: "id", value: existing.id }],
						update: {
							name,
							scopes: JSON.stringify(reactivationScopes),
							role: resolvedRole,
							status: "active",
							publicKey: JSON.stringify(publicKey),
							enrollmentId,
							source: source ?? existing.source ?? null,
							activatedAt: now,
							metadata: metadata ? JSON.stringify(metadata) : null,
							expiresAt,
							updatedAt: now,
						},
					});

					return ctx.json({
						agentId: existing.id,
						name,
						scopes: reactivationScopes,
						role: resolvedRole,
						enrollmentId,
					});
				}
			}

			const agent = await ctx.context.adapter.create<
				Record<string, string | Date | null>,
				Agent
			>({
				model: AGENT_TABLE,
				data: {
					name,
					userId,
					enrollmentId,
					orgId: orgId ?? null,
					workgroupId: workgroupId ?? null,
					source: source ?? null,
					scopes: JSON.stringify(resolvedScopes),
					role: resolvedRole,
					status: "active",
					publicKey: JSON.stringify(publicKey),
					kid,
					lastUsedAt: null,
					activatedAt: now,
					expiresAt,
					metadata: metadata ? JSON.stringify(metadata) : null,
					createdAt: now,
					updatedAt: now,
				},
			});

			return ctx.json({
				agentId: agent.id,
				name: agent.name,
				scopes: resolvedScopes,
				role: resolvedRole,
				enrollmentId,
			});
		},
	);
}
