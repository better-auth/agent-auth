import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";

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
		.meta({ description: "Scope strings the agent is granted" })
		.optional(),
	role: z.string().meta({ description: "Role name for the agent" }).optional(),
	orgId: z
		.string()
		.meta({ description: "Organization ID (if org-scoped)" })
		.optional(),
	metadata: z
		.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
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
						"Register a new agent with its public key. The agent generates its own keypair — the private key never touches the server.",
					responses: {
						"200": {
							description: "Agent created successfully",
						},
					},
				},
			},
		},
		async (ctx) => {
			// Try cookie-based session first
			const cookieSession = await getSessionFromCtx(ctx);

			// Resolve the user ID — either from cookie session or Bearer token fallback
			let userId: string;

			if (cookieSession) {
				userId = cookieSession.user.id;
			} else {
				// Fallback: check Authorization header for a Bearer session token.
				// This supports the device authorization flow where the agent script
				// receives a session token from /device/token and needs to create itself.
				const authHeader = ctx.headers?.get("authorization");
				const token = authHeader?.replace(/^Bearer\s+/i, "");
				if (!token || token === authHeader) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
				}
				const dbSession = await ctx.context.internalAdapter.findSession(token);
				if (!dbSession || new Date(dbSession.session.expiresAt) <= new Date()) {
					throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
				}
				userId = dbSession.user.id;
			}

			const { name, publicKey, scopes, role, orgId, metadata } = ctx.body;

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			// Enforce allowedKeyAlgorithms — validate kty and crv against the config
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
			const resolvedScopes: string[] = scopes ?? roleScopes;

		if (resolvedScopes.length > 0 && opts.validateScopes) {
			if (typeof opts.validateScopes === "function") {
				const valid = await opts.validateScopes(resolvedScopes);
				if (!valid) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.UNKNOWN_SCOPES);
				}
			} else {
				const knownScopes = new Set(
					Object.values(opts.roles ?? {}).flat(),
				);
				const invalid = resolvedScopes.filter(
					(s: string) => !knownScopes.has(s),
				);
				if (invalid.length > 0) {
					throw APIError.from(
						"BAD_REQUEST",
						`${ERROR_CODES.UNKNOWN_SCOPES} Unrecognized: ${invalid.join(", ")}.`,
					);
				}
			}
		}

			const now = new Date();
			const kid = (publicKey.kid as string) ?? null;
			const expiresAt =
				opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			// Check if an agent with the same kid already exists for this user
			// This makes the endpoint idempotent — reconnecting with the same
			// keypair reuses/reactivates the existing agent instead of creating duplicates
			if (kid) {
				const existing = await ctx.context.adapter.findOne<Agent>({
					model: AGENT_TABLE,
					where: [
						{ field: "kid", value: kid },
						{ field: "userId", value: userId },
					],
				});

				if (existing) {
					// Reactivate and update the existing agent
					await ctx.context.adapter.update({
						model: AGENT_TABLE,
						where: [{ field: "id", value: existing.id }],
						update: {
							name,
							scopes: JSON.stringify(resolvedScopes),
							role: resolvedRole,
							status: "active",
							publicKey: JSON.stringify(publicKey),
							metadata: metadata ? JSON.stringify(metadata) : null,
							expiresAt,
							updatedAt: now,
						},
					});

					return ctx.json({
						agentId: existing.id,
						name,
						scopes: resolvedScopes,
						role: resolvedRole,
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
					orgId: orgId ?? null,
					scopes: JSON.stringify(resolvedScopes),
					role: resolvedRole,
					status: "active",
					publicKey: JSON.stringify(publicKey),
					kid,
					lastUsedAt: null,
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
			});
		},
	);
}
