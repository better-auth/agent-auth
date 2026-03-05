import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { resolvePermissionExpiresAt } from "../permission-ttl";
import { findBlockedScopes, hasScope, parseScopes } from "../scopes";
import type {
	AgentHost,
	AgentPermission,
	AgentSession,
	CibaAuthRequest,
	ResolvedAgentAuthOptions,
} from "../types";

const HOST_TABLE = "agentHost";
const PERMISSION_TABLE = "agentPermission";
const CIBA_TABLE = "cibaAuthRequest";
const CIBA_DEFAULT_INTERVAL = 5;
const CIBA_DEFAULT_EXPIRES_IN = 300;

/**
 * Convention: CIBA requests created for scope approval encode the
 * agent ID in the `scope` field with this prefix so that
 * cibaApprove / cibaDeny can resolve the pending permissions.
 */
export const SCOPE_APPROVAL_PREFIX = "scope_approval:";

function generateUserCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		if (i === 4) code += "-";
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}

async function buildScopeApproval(
	opts: ResolvedAgentAuthOptions,
	ctx: {
		context: {
			adapter: {
				create: <T>(args: {
					model: string;
					data: Record<string, unknown>;
				}) => Promise<T>;
			};
			internalAdapter: {
				findUserById: (
					id: string,
				) => Promise<{ id: string; email: string } | null>;
			};
			baseURL: string;
		};
	},
	agentId: string,
	agentName: string,
	userId: string | null,
	hostId: string | null,
	pendingScopes: string[],
	preferredMethod?: string,
): Promise<Record<string, unknown>> {
	const method = await opts.resolveApprovalMethod({
		userId,
		agentName,
		hostId,
		scopes: pendingScopes,
		preferredMethod,
	});

	const origin = new URL(ctx.context.baseURL).origin;

	if (method === "ciba" && userId) {
		const user = await ctx.context.internalAdapter.findUserById(userId);
		if (user) {
			const now = new Date();
			const expiresAt = new Date(
				now.getTime() + CIBA_DEFAULT_EXPIRES_IN * 1000,
			);
			const cibaRequest = await ctx.context.adapter.create<CibaAuthRequest>({
				model: CIBA_TABLE,
				data: {
					clientId: "agent-auth",
					loginHint: user.email,
					userId,
					scope: `${SCOPE_APPROVAL_PREFIX}${agentId}`,
					bindingMessage: `Agent "${agentName}" requests additional scopes: ${pendingScopes.join(", ")}`,
					clientNotificationToken: null,
					clientNotificationEndpoint: null,
					deliveryMode: "poll",
					status: "pending",
					interval: CIBA_DEFAULT_INTERVAL,
					lastPolledAt: null,
					expiresAt,
					createdAt: now,
					updatedAt: now,
				},
			});
			return {
				method: "ciba",
				auth_req_id: cibaRequest.id,
				expires_in: CIBA_DEFAULT_EXPIRES_IN,
				interval: CIBA_DEFAULT_INTERVAL,
				ciba_token_endpoint: `${origin}/api/auth/agent/ciba/token`,
			};
		}
	}

	const userCode = generateUserCode();
	return {
		method: "device_authorization",
		verification_uri: `${origin}/device/scopes`,
		verification_uri_complete: `${origin}/device/scopes?agent_id=${agentId}&code=${userCode}`,
		user_code: userCode,
		device_code: agentId,
		expires_in: 300,
		interval: 5,
	};
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
				preferredMethod: z
					.enum(["device_authorization", "ciba"])
					.optional()
					.describe(
						"Preferred approval method. The server may honor or override this based on user/org settings.",
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

			const { scopes, reason, preferredMethod } = ctx.body;

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

			const ownerId = agentSession.host?.userId ?? null;

			const activeScopes = existingPerms
				.filter((p) => p.status === "active")
				.map((p) => p.scope);

			// Only consider permissions pending for this user (or unassigned).
			// Permissions pending for a different grantedBy are managed by
			// a cross-user flow and should not trigger owner approval.
			const pendingScopesList = existingPerms
				.filter(
					(p) =>
						p.status === "pending" && (!p.grantedBy || p.grantedBy === ownerId),
				)
				.map((p) => p.scope);

			const alreadyActive = new Set(activeScopes);
			const alreadyPending = new Set(pendingScopesList);
			const alreadyTracked = new Set([...activeScopes, ...pendingScopesList]);
			const newOnly = scopes.filter((s: string) => !alreadyTracked.has(s));

			if (newOnly.length === 0) {
				const allActive = scopes.every((s: string) => alreadyActive.has(s));
				if (allActive) {
					return ctx.json({
						agent_id: agentSession.agent.id,
						status: "granted",
						scopes: activeScopes,
					});
				}
				const stillPending = scopes.filter((s: string) =>
					alreadyPending.has(s),
				);
				const approval = await buildScopeApproval(
					opts,
					ctx,
					agentSession.agent.id,
					agentSession.agent.name,
					agentSession.host?.userId ?? null,
					agentSession.agent.hostId ?? null,
					stillPending,
					preferredMethod,
				);
				return ctx.json({
					agent_id: agentSession.agent.id,
					status: "pending",
					scopes: activeScopes,
					pending_scopes: stillPending,
					approval,
				});
			}

			let hostBudget: string[] = [];
			let hostIsActive = false;
			let hostUserId: string | null = null;
			if (agentSession.agent.hostId) {
				const host = await ctx.context.adapter.findOne<AgentHost>({
					model: HOST_TABLE,
					where: [{ field: "id", value: agentSession.agent.hostId }],
				});
				if (host) {
					hostBudget = parseScopes(host.scopes);
					hostIsActive = host.status === "active";
					hostUserId = host.userId ?? null;
				}
			}

			let autoApprove: string[];
			let needsApproval: string[];

			if (hostIsActive && hostBudget.length > 0) {
				autoApprove = newOnly.filter((s: string) => hasScope(hostBudget, s));
				needsApproval = newOnly.filter((s: string) => !hasScope(hostBudget, s));
			} else if (hostIsActive && hostBudget.length === 0) {
				// Active host with empty budget = no restrictions.
				// Auto-grant all requested scopes. This covers autonomous
				// agents where there's no user to ask for approval.
				autoApprove = newOnly;
				needsApproval = [];
			} else {
				autoApprove = [];
				needsApproval = newOnly;
			}

			if (needsApproval.length > 0 && !hostUserId) {
				throw new APIError("FORBIDDEN", {
					body: {
						code: ERROR_CODES.SCOPE_DENIED,
						message:
							"Requested scopes are not pre-authorized for this autonomous host.",
					},
				});
			}

			const now = new Date();

			for (const scope of autoApprove) {
				const expiresAt = await resolvePermissionExpiresAt(opts, scope, {
					agentId: agentSession.agent.id,
					hostId: agentSession.agent.hostId ?? null,
					userId: agentSession.host?.userId ?? null,
				});
				await ctx.context.adapter.create<AgentPermission>({
					model: PERMISSION_TABLE,
					data: {
						agentId: agentSession.agent.id,
						scope,
						referenceId: null,
						grantedBy: agentSession.host?.userId ?? null,
						expiresAt,
						status: "active",
						reason: null,
						createdAt: now,
						updatedAt: now,
					},
				});
			}

			if (needsApproval.length === 0) {
				if (autoApprove.length > 0) {
					emit(opts, {
						type: "scope.granted",
						actorType: "system",
						agentId: agentSession.agent.id,
						hostId: agentSession.agent.hostId ?? undefined,
						metadata: { scopes: autoApprove, auto: true },
					});
				}
				return ctx.json({
					agent_id: agentSession.agent.id,
					status: "granted",
					scopes: [...activeScopes, ...autoApprove],
				});
			}

			for (const scope of needsApproval) {
				await ctx.context.adapter.create<AgentPermission>({
					model: PERMISSION_TABLE,
					data: {
						agentId: agentSession.agent.id,
						scope,
						referenceId: null,
						grantedBy: agentSession.host?.userId ?? null,
						expiresAt: null,
						status: "pending",
						reason: reason || null,
						createdAt: now,
						updatedAt: now,
					},
				});
			}

			const approval = await buildScopeApproval(
				opts,
				ctx,
				agentSession.agent.id,
				agentSession.agent.name,
				agentSession.host?.userId ?? null,
				agentSession.agent.hostId ?? null,
				needsApproval,
				preferredMethod,
			);

			emit(opts, {
				type: "scope.requested",
				actorType: "agent",
				actorId: agentSession.host?.userId ?? undefined,
				agentId: agentSession.agent.id,
				hostId: agentSession.agent.hostId ?? undefined,
				metadata: {
					autoApproved: autoApprove,
					pending: needsApproval,
					reason,
				},
			});

			return ctx.json({
				agent_id: agentSession.agent.id,
				status: "pending",
				scopes: [...activeScopes, ...autoApprove],
				pending_scopes: needsApproval,
				approval,
			});
		},
	);
}
