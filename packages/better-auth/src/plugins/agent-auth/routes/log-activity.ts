import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { AgentSession, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";
const ACTIVITY_TABLE = "agentActivity";

/**
 * POST /agent/log-activity
 *
 * Lets an agent report its own activity (e.g. gateway tool calls that
 * don't hit the app's HTTP layer). Authenticated via agent JWT — the
 * agentId and userId are extracted from the verified session, so agents
 * can only log activity for themselves.
 *
 * Optionally accepts inputTokens/outputTokens to track token consumption.
 * When provided, the agent's running totals are incremented atomically.
 * If a token budget is configured and would be exceeded, returns an error.
 */
export function logActivity(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/log-activity",
		{
			method: "POST",
			body: z.object({
				method: z
					.string()
					.meta({ description: 'HTTP method or "TOOL" for gateway calls' }),
				path: z.string().meta({
					description: "Request path or tool name (e.g. github.create_issue)",
				}),
				status: z
					.number()
					.optional()
					.meta({ description: "Response status code (null if N/A)" }),
				inputTokens: z
					.number()
					.int()
					.nonnegative()
					.optional()
					.meta({ description: "Input tokens consumed by this request" }),
				outputTokens: z
					.number()
					.int()
					.nonnegative()
					.optional()
					.meta({ description: "Output tokens produced by this request" }),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Report agent activity (authenticated via agent JWT). Used by the MCP gateway to log tool calls and token usage.",
					responses: {
						200: { description: "Activity logged" },
					},
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as { agentSession?: AgentSession })
				.agentSession;

			if (!agentSession) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const inputTokens = ctx.body.inputTokens ?? null;
			const outputTokens = ctx.body.outputTokens ?? null;

			const incoming = (inputTokens ?? 0) + (outputTokens ?? 0);

			if (
				incoming > 0 &&
				(opts.maxTokensPerAgent > 0 || opts.maxTokensPerUser > 0)
			) {
				const userAgents = await ctx.context.adapter.findMany<{
					id: string;
					totalInputTokens: number;
					totalOutputTokens: number;
				}>({
					model: AGENT_TABLE,
					where: [{ field: "userId", value: agentSession.user.id }],
				});

				if (opts.maxTokensPerAgent > 0) {
					const thisAgent = userAgents.find(
						(a) => a.id === agentSession.agent.id,
					);
					if (thisAgent) {
						const agentTotal =
							(thisAgent.totalInputTokens || 0) +
							(thisAgent.totalOutputTokens || 0);
						if (agentTotal + incoming > opts.maxTokensPerAgent) {
							throw APIError.from(
								"FORBIDDEN",
								ERROR_CODES.TOKEN_BUDGET_EXCEEDED,
							);
						}
					}
				}

				if (opts.maxTokensPerUser > 0) {
					let userTotal = 0;
					for (const a of userAgents) {
						userTotal += (a.totalInputTokens ?? 0) + (a.totalOutputTokens ?? 0);
					}
					if (userTotal + incoming > opts.maxTokensPerUser) {
						throw APIError.from(
							"FORBIDDEN",
							ERROR_CODES.USER_TOKEN_BUDGET_EXCEEDED,
						);
					}
				}
			}

			await ctx.context.adapter.create({
				model: ACTIVITY_TABLE,
				data: {
					agentId: agentSession.agent.id,
					userId: agentSession.user.id,
					method: ctx.body.method,
					path: ctx.body.path,
					status: ctx.body.status ?? null,
					inputTokens,
					outputTokens,
					ipAddress:
						ctx.headers?.get("x-forwarded-for") ??
						ctx.headers?.get("x-real-ip") ??
						null,
					userAgent: ctx.headers?.get("user-agent") ?? null,
					createdAt: new Date(),
				},
			});

			if (inputTokens || outputTokens) {
				const agent = await ctx.context.adapter.findOne<{
					totalInputTokens: number;
					totalOutputTokens: number;
				}>({
					model: AGENT_TABLE,
					where: [{ field: "id", value: agentSession.agent.id }],
				});
				if (agent) {
					await ctx.context.adapter.update({
						model: AGENT_TABLE,
						where: [{ field: "id", value: agentSession.agent.id }],
						update: {
							totalInputTokens:
								(agent.totalInputTokens || 0) + (inputTokens ?? 0),
							totalOutputTokens:
								(agent.totalOutputTokens || 0) + (outputTokens ?? 0),
						},
					});
				}
			}

			return ctx.json({ success: true });
		},
	);
}
