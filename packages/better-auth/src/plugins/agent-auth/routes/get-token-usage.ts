import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, ResolvedAgentAuthOptions } from "../types";
import type { AgentActivity } from "./get-agent-activity";

const AGENT_TABLE = "agent";
const ACTIVITY_TABLE = "agentActivity";

/**
 * GET /agent/token-usage
 *
 * Returns token usage summary for an agent or across all agents.
 * Includes running totals, budget info, and recent activity with token data.
 */
export function getTokenUsage(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/token-usage",
		{
			method: "GET",
			query: z.object({
				agentId: z
					.string()
					.meta({
						description:
							"Agent ID to get usage for. Omit for aggregate across all agents.",
					})
					.optional(),
				recentLimit: z
					.string()
					.meta({
						description:
							"Number of recent activities with tokens to include (default 10, max 50)",
					})
					.optional(),
			}),
			metadata: {
				openapi: {
					description:
						"Get token usage summary for a specific agent or all agents owned by the current user.",
					responses: {
						200: { description: "Token usage summary" },
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from(
					"UNAUTHORIZED",
					ERROR_CODES.UNAUTHORIZED_SESSION,
				);
			}

			const { agentId, recentLimit: recentLimitStr } = ctx.query;
			const recentLimit = Math.min(Number(recentLimitStr) || 10, 50);

			if (agentId) {
				const agent = await ctx.context.adapter.findOne<Agent>({
					model: AGENT_TABLE,
					where: [
						{ field: "id", value: agentId },
						{ field: "userId", value: session.user.id },
					],
				});

				if (!agent) {
					throw APIError.from(
						"NOT_FOUND",
						ERROR_CODES.AGENT_NOT_FOUND,
					);
				}

				const recentActivity =
					await ctx.context.adapter.findMany<AgentActivity>({
						model: ACTIVITY_TABLE,
						where: [
							{ field: "agentId", value: agentId },
							{ field: "userId", value: session.user.id },
						],
						limit: recentLimit,
						sortBy: { field: "createdAt", direction: "desc" },
					});

				const inputTokens = agent.totalInputTokens ?? 0;
				const outputTokens = agent.totalOutputTokens ?? 0;
				const total = inputTokens + outputTokens;
				const budget = opts.maxTokensPerAgent > 0 ? opts.maxTokensPerAgent : null;

				return ctx.json({
					agentId: agent.id,
					agentName: agent.name,
					totalInputTokens: inputTokens,
					totalOutputTokens: outputTokens,
					totalTokens: total,
					budget,
					budgetRemaining: budget !== null ? Math.max(0, budget - total) : null,
					recentActivity: recentActivity
						.filter((a) => a.inputTokens || a.outputTokens)
						.map((a) => ({
							method: a.method,
							path: a.path,
							inputTokens: a.inputTokens ?? 0,
							outputTokens: a.outputTokens ?? 0,
							createdAt: a.createdAt,
						})),
				});
			}

			const agents = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "userId", value: session.user.id }],
			});

			let totalInput = 0;
			let totalOutput = 0;
			const budget =
				opts.maxTokensPerAgent > 0 ? opts.maxTokensPerAgent : null;
			const perAgent = agents.map((a) => {
				const inp = a.totalInputTokens ?? 0;
				const out = a.totalOutputTokens ?? 0;
				const agentTotal = inp + out;
				totalInput += inp;
				totalOutput += out;
				return {
					agentId: a.id,
					agentName: a.name,
					status: a.status,
					totalInputTokens: inp,
					totalOutputTokens: out,
					totalTokens: agentTotal,
					budgetRemaining:
						budget !== null ? Math.max(0, budget - agentTotal) : null,
				};
			});

			const allTotal = totalInput + totalOutput;
			const userBudget =
				opts.maxTokensPerUser > 0 ? opts.maxTokensPerUser : null;

			return ctx.json({
				totalInputTokens: totalInput,
				totalOutputTokens: totalOutput,
				totalTokens: allTotal,
				budgetPerAgent: budget,
				budgetPerUser: userBudget,
				userBudgetRemaining:
					userBudget !== null
						? Math.max(0, userBudget - allTotal)
						: null,
				agents: perAgent,
			});
		},
	);
}
