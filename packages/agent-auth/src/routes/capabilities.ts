import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import type {
	AgentPermission,
	AgentSession,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../types";

const PERMISSION_TABLE = "agentPermission";

/**
 * GET /agent/capabilities
 *
 * Returns capabilities the server offers (§2.3).
 * Supports three auth modes:
 * - No auth: public capabilities
 * - Host JWT: capabilities for the host's linked user
 * - Agent JWT: all capabilities with per-agent grant_status
 */
export function capabilities(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/capabilities",
		{
			method: "GET",
			query: z
				.object({
					intent: z.string().optional().meta({
						description: "Natural language intent for server-side filtering",
					}),
					cursor: z.string().optional().meta({
						description: "Opaque pagination cursor",
					}),
					limit: z.coerce
						.number()
						.optional()
						.meta({ description: "Maximum capabilities to return" }),
				})
				.optional(),
			metadata: {
				openapi: {
					description:
						"Returns available capabilities (§2.3). Supports no auth, host JWT, or agent JWT.",
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
				return ctx.json({
					capabilities: [],
					has_more: false,
				});
			}

			const intent = ctx.query?.intent?.toLowerCase();
			let filtered = allCapabilities;

			if (intent) {
				filtered = allCapabilities.filter(
					(c) =>
						c.name.toLowerCase().includes(intent) ||
						c.description.toLowerCase().includes(intent),
				);
			}

			const limit = ctx.query?.limit ?? 100;
			const cursorIdx = ctx.query?.cursor
				? Number.parseInt(ctx.query.cursor, 10)
				: 0;
			const page = filtered.slice(cursorIdx, cursorIdx + limit);
			const hasMore = cursorIdx + limit < filtered.length;

			let grantedScopes: Set<string> | null = null;
			if (agentSession) {
				const perms = await ctx.context.adapter.findMany<AgentPermission>({
					model: PERMISSION_TABLE,
					where: [{ field: "agentId", value: agentSession.agent.id }],
				});
				grantedScopes = new Set(
					perms
						.filter(
							(p) =>
								p.status === "active" &&
								(!p.expiresAt || new Date(p.expiresAt) > new Date()),
						)
						.map((p) => p.scope),
				);
			} else if (hostSession) {
				grantedScopes = new Set(hostSession.host.scopes);
			}

			return ctx.json({
				capabilities: page.map((c) => ({
					...c,
					...(grantedScopes
						? {
								grant_status: grantedScopes.has(c.name)
									? "granted"
									: "not_granted",
							}
						: {}),
				})),
				has_more: hasMore,
				...(hasMore ? { next_cursor: String(cursorIdx + limit) } : {}),
			});
		},
	);
}
