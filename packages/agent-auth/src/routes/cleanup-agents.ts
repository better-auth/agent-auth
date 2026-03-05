import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";

/**
 * Batch-transition agents whose expiresAt has passed to "expired" state.
 * Per §9.1, expired agents retain their public key and can be reactivated
 * via proof-of-possession. Use the revoke endpoint to permanently revoke.
 */
export function cleanupAgents(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/cleanup",
		{
			method: "POST",
			metadata: {
				openapi: {
					description:
						"Expire all overdue agents for the current user. Returns the count of agents expired.",
					responses: {
						"200": { description: "Cleanup result" },
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const now = new Date();

			const expired = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "userId", value: session.user.id },
					{ field: "status", value: "active" },
					{ field: "expiresAt", value: now, operator: "lt" },
				],
			});

			await Promise.all(
				expired.map((agent) =>
					ctx.context.adapter.update({
						model: AGENT_TABLE,
						where: [{ field: "id", value: agent.id }],
						update: {
							status: "expired",
							updatedAt: now,
						},
					}),
				),
			);

			if (expired.length > 0) {
				emit(opts, {
					type: "agent.cleanup",
					actorId: session.user.id,
					metadata: {
						count: expired.length,
						agentIds: expired.map((a) => a.id),
					},
				});
			}

			return ctx.json({ expired: expired.length });
		},
	);
}
