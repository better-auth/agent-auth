import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type { ResolvedAgentAuthOptions } from "../types";

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
			const allCapabilities = opts.capabilities ?? [];
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
