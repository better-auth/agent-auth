import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { findBlockedScopes } from "../scopes";
import type { Agent, Enrollment, ResolvedAgentAuthOptions } from "../types";

const ENROLLMENT_TABLE = "agentEnrollment";
const AGENT_TABLE = "agent";

export function createEnrollment(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/enrollment/create",
		{
			method: "POST",
			body: z.object({
				publicKey: z
					.record(
						z.string(),
						z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
					)
					.meta({
						description:
							"Enrollment Ed25519 public key as JWK. Client retains the private key.",
					}),
				appSource: z.string().optional().meta({
					description:
						'Upstream application identifier (e.g. "cursor", "claude-code")',
				}),
				baseScopes: z.array(z.string()).optional().meta({
					description:
						"Default scopes agents inherit. Reactivated agents reset to these.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Create an enrollment — persistent app-level consent with Ed25519 keypair (§4). No bearer tokens.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { publicKey } = ctx.body;

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

			const baseScopes = ctx.body.baseScopes ?? [];

			if (baseScopes.length > 0 && opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(baseScopes, opts.blockedScopes);
				if (blocked.length > 0) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.SCOPE_BLOCKED);
				}
			}

			if (baseScopes.length > 0 && opts.validateScopes) {
				if (typeof opts.validateScopes === "function") {
					const valid = await opts.validateScopes(baseScopes);
					if (!valid) {
						throw APIError.from("BAD_REQUEST", ERROR_CODES.UNKNOWN_SCOPES);
					}
				} else if (opts.roles) {
					const knownScopes = new Set(Object.values(opts.roles).flat());
					const invalid = baseScopes.filter((s) => !knownScopes.has(s));
					if (invalid.length > 0) {
						throw new APIError("BAD_REQUEST", {
							message: `${ERROR_CODES.UNKNOWN_SCOPES} Unrecognized: ${invalid.join(", ")}.`,
						});
					}
				}
			}

			const now = new Date();
			const kid = (publicKey.kid as string) ?? null;

			const enrollment = await ctx.context.adapter.create<
				Record<string, string | Date | null>,
				Enrollment
			>({
				model: ENROLLMENT_TABLE,
				data: {
					userId: session.user.id,
					appSource: ctx.body.appSource ?? null,
					baseScopes: JSON.stringify(baseScopes),
					publicKey: JSON.stringify(publicKey),
					kid,
					status: "active",
					activatedAt: now,
					expiresAt: null,
					lastUsedAt: null,
					createdAt: now,
					updatedAt: now,
				},
			});

			return ctx.json({
				enrollmentId: enrollment.id,
				appSource: ctx.body.appSource ?? null,
				baseScopes,
				status: "active",
			});
		},
	);
}

export function listEnrollments() {
	return createAuthEndpoint(
		"/agent/enrollment/list",
		{
			method: "GET",
			query: z
				.object({
					status: z.enum(["active", "expired", "revoked"]).optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description: "List enrollments for the current user.",
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

			const enrollments = await ctx.context.adapter.findMany<Enrollment>({
				model: ENROLLMENT_TABLE,
				where,
				sortBy: { field: "createdAt", direction: "desc" },
			});

			return ctx.json({
				enrollments: enrollments.map((e) => ({
					id: e.id,
					appSource: e.appSource,
					baseScopes:
						typeof e.baseScopes === "string"
							? JSON.parse(e.baseScopes)
							: e.baseScopes,
					status: e.status,
					activatedAt: e.activatedAt,
					lastUsedAt: e.lastUsedAt,
					createdAt: e.createdAt,
					updatedAt: e.updatedAt,
				})),
			});
		},
	);
}

export function getEnrollment() {
	return createAuthEndpoint(
		"/agent/enrollment/get",
		{
			method: "GET",
			query: z.object({
				enrollmentId: z.string(),
			}),
			metadata: {
				openapi: {
					description: "Get a specific enrollment by ID.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const enrollment = await ctx.context.adapter.findOne<Enrollment>({
				model: ENROLLMENT_TABLE,
				where: [
					{ field: "id", value: ctx.query.enrollmentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!enrollment) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.ENROLLMENT_NOT_FOUND);
			}

			return ctx.json({
				id: enrollment.id,
				appSource: enrollment.appSource,
				baseScopes:
					typeof enrollment.baseScopes === "string"
						? JSON.parse(enrollment.baseScopes)
						: enrollment.baseScopes,
				status: enrollment.status,
				activatedAt: enrollment.activatedAt,
				lastUsedAt: enrollment.lastUsedAt,
				createdAt: enrollment.createdAt,
				updatedAt: enrollment.updatedAt,
			});
		},
	);
}

export function revokeEnrollment() {
	return createAuthEndpoint(
		"/agent/enrollment/revoke",
		{
			method: "POST",
			body: z.object({
				enrollmentId: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Revoke an enrollment (clears public key) and cascade to all agents under it (§9.3).",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const enrollment = await ctx.context.adapter.findOne<Enrollment>({
				model: ENROLLMENT_TABLE,
				where: [
					{ field: "id", value: ctx.body.enrollmentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!enrollment) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.ENROLLMENT_NOT_FOUND);
			}

			const now = new Date();

			await ctx.context.adapter.update({
				model: ENROLLMENT_TABLE,
				where: [{ field: "id", value: enrollment.id }],
				update: {
					status: "revoked",
					publicKey: "",
					kid: null,
					updatedAt: now,
				},
			});

			const agents = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "enrollmentId", value: enrollment.id },
					{ field: "status", value: "active" },
				],
			});

			const expiredAgents = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "enrollmentId", value: enrollment.id },
					{ field: "status", value: "expired" },
				],
			});

			const allAgents = [...agents, ...expiredAgents];

			for (const agent of allAgents) {
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

			return ctx.json({
				success: true,
				revokedAgentCount: allAgents.length,
			});
		},
	);
}
