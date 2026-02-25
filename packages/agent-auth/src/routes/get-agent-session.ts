import { createAuthEndpoint } from "@better-auth/core/api";
import type { AgentSession } from "../types";

/**
 * GET /agent/get-session
 *
 * Agent calls this to resolve its own identity.
 * The actual authentication happens in the `before` hook —
 * if the agent is valid, `ctx.context.agentSession` is already set.
 * This endpoint just returns it.
 */
export function getAgentSession() {
	return createAuthEndpoint(
		"/agent/get-session",
		{
			method: "GET",
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Resolve the agent's own session from its bearer token or JWT.",
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as { agentSession?: AgentSession })
				.agentSession;

			if (!agentSession) {
				return ctx.json(null);
			}

			return ctx.json(agentSession);
		},
	);
}
