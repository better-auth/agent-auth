import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { findBlockedScopes } from "../scopes";
import type {
	AgentPermission,
	AgentSession,
	ResolvedAgentAuthOptions,
} from "../types";

const PERMISSION_TABLE = "agentPermission";

/**
 * POST /agent/request-scope
 *
 * Called by an agent (authenticated via JWT) to request additional scopes.
 * Creates pending agentPermission rows that the user must approve in
 * their browser. Returns the list of pending permission IDs and a
 * verificationUrl.
 */
export function requestScope(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/request-scope",
		{
			method: "POST",
			body: z.object({
				scopes: z
					.array(z.string())
					.min(1)
					.describe("Scopes the agent wants to add"),
				reason: z
					.string()
					.optional()
					.describe(
						"Human-readable reason for the request (displayed verbatim to user)",
					),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Request additional scopes for an agent. Requires user approval.",
					responses: {
						200: {
							description: "Scope request created, pending user approval",
						},
					},
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as Record<string, unknown>)
				.agentSession as AgentSession | undefined;

			if (!agentSession) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { scopes, reason } = ctx.body;

			if (opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(scopes, opts.blockedScopes);
				if (blocked.length > 0) {
					throw new APIError("BAD_REQUEST", {
						message: `${ERROR_CODES.SCOPE_BLOCKED} Blocked: ${blocked.join(", ")}.`,
					});
				}
			}

			const existingPerms = await ctx.context.adapter.findMany<AgentPermission>(
				{
					model: PERMISSION_TABLE,
					where: [{ field: "agentId", value: agentSession.agent.id }],
				},
			);

			const activeScopes = existingPerms
				.filter((p) => p.status === "active")
				.map((p) => p.scope);

			const newOnly = scopes.filter((s: string) => !activeScopes.includes(s));

			if (newOnly.length === 0) {
				return ctx.json({
					agentId: agentSession.agent.id,
					scopes: activeScopes,
					added: [],
					status: "approved",
					message: "All requested scopes were already present.",
				});
			}

			const now = new Date();
			const pendingIds: string[] = [];

			for (const scope of newOnly) {
				const perm = await ctx.context.adapter.create<AgentPermission>({
					model: PERMISSION_TABLE,
					data: {
						agentId: agentSession.agent.id,
						scope,
						referenceId: null,
						grantedBy: agentSession.user.id,
						expiresAt: null,
						status: "pending",
						reason: reason || null,
						createdAt: now,
						updatedAt: now,
					},
				});
				pendingIds.push(perm.id);
			}

			const origin = new URL(ctx.context.baseURL).origin;
			const requestId = agentSession.agent.id;

			return ctx.json({
				requestId,
				pendingPermissionIds: pendingIds,
				status: "pending",
				verificationUrl: `${origin}/device/scopes?request_id=${pendingIds[0]}`,
				message:
					"Scope escalation requires user approval. Open the verificationUrl in a browser to approve.",
			});
		},
	);
}
