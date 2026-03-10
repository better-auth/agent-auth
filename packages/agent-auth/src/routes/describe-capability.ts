import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { agentError, agentAuthChallenge, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	AgentSession,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../types";

/**
 * GET /capability/describe
 *
 * Returns the full definition (including input schema) for a single
 * capability by name. Lightweight escape hatch for when the agent
 * needs to look up a schema mid-session.
 */
export function describeCapability(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/capability/describe",
		{
			method: "GET",
			query: z.object({
				name: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Returns the full definition for a single capability by name.",
				},
			},
		},
		async (ctx) => {
			const { name } = ctx.query;

			const agentSession = (ctx.context as Record<string, unknown>)
				.agentSession as AgentSession | undefined;
			const hostSession = (ctx.context as Record<string, unknown>)
				.hostSession as HostSession | undefined;

			if (
				opts.requireAuthForCapabilities &&
				!agentSession &&
				!hostSession
			) {
				throw agentError(
					"UNAUTHORIZED",
					ERR.AUTH_REQUIRED_FOR_CAPABILITIES,
					undefined,
					agentAuthChallenge(ctx.context.baseURL),
				);
			}

			let allCapabilities = opts.capabilities ?? [];

			if (opts.resolveCapabilities) {
				allCapabilities = await opts.resolveCapabilities({
					capabilities: allCapabilities,
					query: null,
					agentSession: agentSession ?? null,
					hostSession: hostSession ?? null,
				});
			}

			const cap = allCapabilities.find((c) => c.name === name);

			if (!cap) {
				throw agentError(
					"NOT_FOUND",
					ERR.CAPABILITY_NOT_FOUND,
					`Capability "${name}" does not exist.`,
				);
			}

			const { grant_status, ...rest } = cap;
			return ctx.json(rest);
		},
	);
}
