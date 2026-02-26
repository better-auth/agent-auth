import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { findBlockedScopes } from "../scopes";
import type { AgentSession, ResolvedAgentAuthOptions } from "../types";

const SCOPE_REQUEST_TABLE = "agentScopeRequest";
const TTL_MS = 5 * 60 * 1000;

/**
 * POST /agent/request-scope
 *
 * Called by an agent (authenticated via JWT) to request additional scopes
 * or a name change. Creates a pending scope request that the user must
 * approve in their browser. Returns a requestId and verificationUrl.
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
				name: z
					.string()
					.optional()
					.describe("New agent name reflecting expanded role"),
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

			const { scopes, name, reason } = ctx.body;

			if (opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(scopes, opts.blockedScopes);
				if (blocked.length > 0) {
					throw new APIError("BAD_REQUEST", {
						message: `${ERROR_CODES.SCOPE_BLOCKED} Blocked: ${blocked.join(", ")}.`,
					});
				}
			}

			const existingScopes = agentSession.agent.scopes ?? [];
			const newOnly = scopes.filter((s: string) => !existingScopes.includes(s));
			const hasNameChange = !!name && name !== agentSession.agent.name;

			if (newOnly.length === 0 && !hasNameChange) {
				return ctx.json({
					agentId: agentSession.agent.id,
					scopes: existingScopes,
					added: [],
					status: "approved",
					message: "All requested scopes were already present.",
				});
			}

			const now = new Date();
			const expiresAt = new Date(now.getTime() + TTL_MS);

			const scopeRequest = await ctx.context.adapter.create({
				model: SCOPE_REQUEST_TABLE,
				data: {
					agentId: agentSession.agent.id,
					userId: agentSession.user.id,
					agentName: agentSession.agent.name,
					newName: name || null,
					reason: reason || null,
					existingScopes,
					requestedScopes: newOnly,
					status: "pending",
					createdAt: now,
					expiresAt,
				},
			});

			const origin = new URL(ctx.context.baseURL).origin;

			return ctx.json({
				requestId: scopeRequest.id,
				status: "pending",
				verificationUrl: `${origin}/device/scopes?request_id=${scopeRequest.id}`,
				message:
					"Scope escalation requires user approval. Open the verificationUrl in a browser to approve.",
			});
		},
	);
}
