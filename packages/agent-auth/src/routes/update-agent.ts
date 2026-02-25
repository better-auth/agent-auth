import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";

const updateAgentBodySchema = z.object({
	agentId: z.string(),
	name: z.string().min(1).optional(),
	scopes: z.array(z.string()).optional(),
	role: z.string().optional(),
	metadata: z
		.record(
			z.string(),
			z.union([z.string(), z.number(), z.boolean(), z.null()]),
		)
		.optional(),
});

export function updateAgent(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/update",
		{
			method: "POST",
			body: updateAgentBodySchema,
			metadata: {
				openapi: {
					description: "Update an agent's name, scopes, role, or metadata",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { agentId, name, scopes, role, metadata } = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "id", value: agentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			let resolvedScopes = scopes;
			const resolvedRole = role;

			if (role !== undefined && opts.roles?.[role]) {
				resolvedScopes = resolvedScopes ?? opts.roles[role];
			}

			if (resolvedScopes && resolvedScopes.length > 0 && opts.validateScopes) {
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

			if (
				resolvedRole !== undefined &&
				opts.roles &&
				!opts.roles[resolvedRole]
			) {
				throw new APIError("BAD_REQUEST", {
					message: `Unknown role "${resolvedRole}". Known roles: ${Object.keys(opts.roles).join(", ")}.`,
				});
			}

			const updates: Record<string, string | Date | null> = {
				updatedAt: new Date(),
			};

			if (name !== undefined) updates.name = name;
			if (resolvedScopes !== undefined)
				updates.scopes = JSON.stringify(resolvedScopes);
			if (resolvedRole !== undefined) updates.role = resolvedRole;
			if (metadata !== undefined) updates.metadata = JSON.stringify(metadata);

			const updated = await ctx.context.adapter.update<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
				update: updates,
			});

			if (!updated) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			const parsedScopes =
				typeof updated.scopes === "string"
					? JSON.parse(updated.scopes)
					: updated.scopes;
			const parsedMetadata =
				typeof updated.metadata === "string"
					? JSON.parse(updated.metadata)
					: updated.metadata;

			return ctx.json({
				id: updated.id,
				name: updated.name,
				scopes: parsedScopes,
				role: updated.role,
				status: updated.status,
				metadata: parsedMetadata,
				updatedAt: updated.updatedAt,
			});
		},
	);
}
