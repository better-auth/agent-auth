import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";

const updateAgentBodySchema = z.object({
	agentId: z.string(),
	name: z.string().min(1).optional(),
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
					description: "Update an agent's name or metadata",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { agentId, name, metadata } = ctx.body;

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

			const updates: Record<string, string | Date | null> = {
				updatedAt: new Date(),
			};

			if (name !== undefined) updates.name = name;
			if (metadata !== undefined) updates.metadata = JSON.stringify(metadata);

			const updated = await ctx.context.adapter.update<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
				update: updates,
			});

			if (!updated) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			emit(opts, {
				type: "agent.updated",
				actorId: session.user.id,
				agentId: updated.id,
				metadata: { name, metadata },
			});

			return ctx.json({
				id: updated.id,
				name: updated.name,
				status: updated.status,
				metadata:
					typeof updated.metadata === "string"
						? JSON.parse(updated.metadata)
						: updated.metadata,
				updatedAt: updated.updatedAt,
			});
		},
	);
}
