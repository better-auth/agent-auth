import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
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
 * - No auth: public capabilities
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

			const allCapabilities = opts.capabilities ?? [];

			if (allCapabilities.length === 0) {
				return ctx.json({ capabilities: [], has_more: false });
			}

			const query = ctx.query?.query;
			let filtered = allCapabilities;

			if (query) {
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
					hostSession.host.defaultCapabilities,
				);
			}

			const isSearch = !!query;

			return ctx.json({
				capabilities: page.map((c) => {
					const { input, ...summary } = c;
					const base = isSearch ? summary : c;
					return {
						...base,
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
