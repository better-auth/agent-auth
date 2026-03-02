import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { findBlockedScopes, hasScope } from "../scopes";
import type {
	AgentHost,
	AgentPermission,
	AgentSession,
	ResolvedAgentAuthOptions,
} from "../types";

const HOST_TABLE = "agentHost";
const PERMISSION_TABLE = "agentPermission";

function generateUserCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		if (i === 4) code += "-";
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}

/**
 * POST /agent/request-scope
 *
 * Called by an agent (authenticated via JWT) to request additional scopes (§2.4).
 * Auto-approves scopes within the host's pre-authorized set; creates pending
 * permission rows for scopes outside the budget.
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
						"Request additional scopes for an agent (§2.4). Auto-approves within host pre-auth.",
					responses: {
						200: {
							description:
								"Scopes granted immediately or pending user approval",
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

			const pendingScopes = existingPerms
				.filter((p) => p.status === "pending")
				.map((p) => p.scope);

			const alreadyTracked = new Set([...activeScopes, ...pendingScopes]);
			const newOnly = scopes.filter((s: string) => !alreadyTracked.has(s));

			if (newOnly.length === 0) {
				throw APIError.from("CONFLICT", ERROR_CODES.ALREADY_GRANTED);
			}

			// §2.4: Check host pre-auth budget for auto-approval
			let hostBudget: string[] = [];
			if (agentSession.agent.hostId) {
				const host = await ctx.context.adapter.findOne<AgentHost>({
					model: HOST_TABLE,
					where: [{ field: "id", value: agentSession.agent.hostId }],
				});
				if (host) {
					hostBudget =
						typeof host.scopes === "string"
							? JSON.parse(host.scopes)
							: host.scopes;
				}
			}

			const autoApprove = newOnly.filter((s: string) =>
				hasScope(hostBudget, s),
			);
			const needsApproval = newOnly.filter(
				(s: string) => !hasScope(hostBudget, s),
			);

			const now = new Date();

			for (const scope of autoApprove) {
				await ctx.context.adapter.create<AgentPermission>({
					model: PERMISSION_TABLE,
					data: {
						agentId: agentSession.agent.id,
						scope,
						referenceId: null,
						grantedBy: agentSession.user?.id ?? null,
						expiresAt: null,
						status: "active",
						reason: null,
						createdAt: now,
						updatedAt: now,
					},
				});
			}

			if (needsApproval.length === 0) {
				return ctx.json({
					agent_id: agentSession.agent.id,
					status: "granted",
					scopes: [...activeScopes, ...autoApprove],
				});
			}

			const pendingIds: string[] = [];
			for (const scope of needsApproval) {
				const perm = await ctx.context.adapter.create<AgentPermission>({
					model: PERMISSION_TABLE,
					data: {
						agentId: agentSession.agent.id,
						scope,
						referenceId: null,
						grantedBy: agentSession.user?.id ?? null,
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
			const userCode = generateUserCode();

			return ctx.json({
				agent_id: agentSession.agent.id,
				status: "pending",
				scopes: [...activeScopes, ...autoApprove],
				pending_scopes: needsApproval,
				approval: {
					method: "device_authorization",
					verification_uri: `${origin}/device/scopes`,
					verification_uri_complete: `${origin}/device/scopes?agent_id=${agentSession.agent.id}&code=${userCode}`,
					user_code: userCode,
					device_code: agentSession.agent.id,
					expires_in: 300,
					interval: 5,
				},
			});
		},
	);
}
