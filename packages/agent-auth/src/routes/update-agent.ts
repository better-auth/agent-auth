import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { emit } from "../emit";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type { Agent, ResolvedAgentAuthOptions } from "../types";

/**
 * POST /agent/update
 *
 * Update an agent's name and/or metadata. Auth: user session.
 */
export function updateAgent(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/update",
		{
			method: "POST",
			body: z.object({
				agent_id: z.string(),
				name: z.string().optional(),
				metadata: z
					.record(
						z.string(),
						z.union([z.string(), z.number(), z.boolean(), z.null()])
					)
					.optional(),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Update an agent's name or metadata (§8).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const { agent_id: agentId, name, metadata } = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [
					{ field: "id", value: agentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!agent) {
				throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			const update: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (name !== undefined) {
				update.name = name;
			}
			if (metadata !== undefined) {
				update.metadata = metadata;
			}

			await ctx.context.adapter.update({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
				update,
			});

			const updatedAt = new Date();

			emit(
				opts,
				{
					type: "agent.updated",
					actorId: session.user.id,
					agentId,
					metadata: { name, metadata },
				},
				ctx
			);

			const resolvedMetadata = metadata ?? agent.metadata;
			const resolvedName = name ?? agent.name;

			return ctx.json({
				agent_id: agent.id,
				name: resolvedName,
				metadata: resolvedMetadata,
				updated_at: updatedAt,
			});
		}
	);
}
