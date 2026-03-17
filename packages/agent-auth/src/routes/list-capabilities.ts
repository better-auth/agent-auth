import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, agentAuthChallenge, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	AgentCapabilityGrant,
	AgentSession,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../types";
import { matchQuery } from "../utils/search";

/**
 * GET /capability/list
 *
 * Returns capabilities the server offers (§6.2).
 * Supports three auth modes:
 * - No auth: public capabilities (unless `requireAuthForCapabilities` is set)
 * - Host JWT (via ctx.context.hostSession): capabilities for host's user
 * - Agent JWT (via ctx.context.agentSession): all capabilities with grant_status
 */
export function listCapabilities(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/capability/list",
		{
			method: "GET",
			query: z
				.object({
					query: z.string().optional(),
					cursor: z.string().optional(),
					limit: z.coerce.number().optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description:
						"Returns available capabilities (§6.2). Supports no auth, host JWT, or agent JWT.",
				},
			},
		},
		async (ctx) => {
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
			const query = ctx.query?.query ?? null;

			if (opts.resolveCapabilities) {
				allCapabilities = await opts.resolveCapabilities({
					capabilities: allCapabilities,
					query,
					agentSession: agentSession ?? null,
					hostSession: hostSession ?? null,
				});
			}

			if (allCapabilities.length === 0) {
				return ctx.json({ capabilities: [], has_more: false });
			}

			let filtered = allCapabilities;

			if (query && !opts.resolveCapabilities) {
				if (opts.resolveQuery) {
					filtered = await opts.resolveQuery({
						query,
						capabilities: allCapabilities,
					});
				} else {
					filtered = matchQuery(query, allCapabilities);
				}
			}

			const limit = ctx.query?.limit ?? 100;
			const cursorIdx = ctx.query?.cursor
				? Number.parseInt(ctx.query.cursor, 10)
				: 0;
			const page = filtered.slice(cursorIdx, cursorIdx + limit);
			const hasMore = cursorIdx + limit < filtered.length;

			let grantedCapabilityIds: Set<string> | null = null;

			if (agentSession) {
				const grants =
					await ctx.context.adapter.findMany<AgentCapabilityGrant>({
						model: TABLE.grant,
						where: [{ field: "agentId", value: agentSession.agent.id }],
					});

				grantedCapabilityIds = new Set(
					grants
						.filter(
							(g) =>
								g.status === "active" &&
								(!g.expiresAt || new Date(g.expiresAt) > new Date()),
						)
						.map((g) => g.capability),
				);
			} else if (hostSession) {
				grantedCapabilityIds = new Set(
					hostSession.host.defaultCapabilities ?? [],
				);
			}

			// §10.6: Capability Caching — use private when response varies by auth
			const cacheScope = grantedCapabilityIds ? "private" : "public";
			ctx.setHeader("Cache-Control", `${cacheScope}, max-age=300`);

			return ctx.json({
				capabilities: page.map((c) => {
					const { input, approvalStrength, ...summary } = c;
					const constrainableFields =
						input &&
						typeof input === "object" &&
						input.properties &&
						typeof input.properties === "object"
							? Object.keys(
									input.properties as Record<string, unknown>,
								)
							: undefined;
					return {
						...summary,
						...(constrainableFields && constrainableFields.length > 0
							? { constrainable_fields: constrainableFields }
							: {}),
						...(approvalStrength
							? { approval_strength: approvalStrength }
							: {}),
						...(grantedCapabilityIds
							? {
									grant_status: grantedCapabilityIds.has(c.name)
										? ("granted" as const)
										: ("not_granted" as const),
								}
							: {}),
					};
				}),
				has_more: hasMore,
				...(hasMore
					? { next_cursor: String(cursorIdx + limit) }
					: {}),
			});
		},
	);
}
