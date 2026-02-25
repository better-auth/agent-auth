import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent } from "../types";

const AGENT_TABLE = "agent";

/**
 * Batch-revoke agents whose expiresAt has passed.
 * Requires an authenticated user session — only cleans up
 * agents belonging to the calling user.
 */
export function cleanupAgents() {
	return createAuthEndpoint(
		"/agent/cleanup",
		{
			method: "POST",
			metadata: {
				openapi: {
					description:
						"Revoke all expired agents for the current user. Returns the count of agents revoked.",
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
							status: "revoked",
							publicKey: "",
							kid: null,
							updatedAt: now,
						},
					}),
				),
			);

			return ctx.json({ revoked: expired.length });
		},
	);
}
