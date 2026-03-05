import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { resolvePermissionExpiresAt } from "../permission-ttl";
import type {
	Agent,
	AgentPermission,
	CibaAuthRequest,
	ResolvedAgentAuthOptions,
} from "../types";
import { SCOPE_APPROVAL_PREFIX } from "./request-scope";

const AGENT_TABLE = "agent";
const CIBA_TABLE = "cibaAuthRequest";
const PERMISSION_TABLE = "agentPermission";

async function deliverNotification(
	request: CibaAuthRequest,
	payload: Record<string, unknown>,
) {
	if (!request.clientNotificationEndpoint || !request.clientNotificationToken)
		return;
	try {
		await globalThis.fetch(request.clientNotificationEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${request.clientNotificationToken}`,
			},
			body: JSON.stringify(payload),
		});
	} catch {
		// fire-and-forget
	}
}

/**
 * POST /agent/ciba/approve
 *
 * User approves a pending CIBA authentication request.
 * Generates an access token (Better Auth session) and stores it.
 * For Ping/Push modes, delivers the result to the client.
 */
export function cibaApprove(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/ciba/approve",
		{
			method: "POST",
			body: z.object({
				auth_req_id: z.string().meta({
					description: "The CIBA auth request ID to approve.",
				}),
			}),
			metadata: {
				openapi: {
					description: "Approve a pending CIBA authentication request.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const freshWindow =
				typeof opts.freshSessionWindow === "function"
					? await opts.freshSessionWindow(ctx)
					: opts.freshSessionWindow;

			if (freshWindow > 0) {
				const sessionCreated = session.session?.createdAt
					? new Date(session.session.createdAt).getTime()
					: 0;
				const age = (Date.now() - sessionCreated) / 1000;
				if (age > freshWindow) {
					throw APIError.from("FORBIDDEN", ERROR_CODES.FRESH_SESSION_REQUIRED);
				}
			}

			const request = await ctx.context.adapter.findOne<CibaAuthRequest>({
				model: CIBA_TABLE,
				where: [{ field: "id", value: ctx.body.auth_req_id }],
			});

			if (!request) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.CIBA_REQUEST_NOT_FOUND);
			}

			if (request.userId && request.userId !== session.user.id) {
				throw APIError.from(
					"FORBIDDEN",
					ERROR_CODES.SCOPE_REQUEST_OWNER_MISMATCH,
				);
			}

			if (new Date(request.expiresAt) <= new Date()) {
				await ctx.context.adapter.update({
					model: CIBA_TABLE,
					where: [{ field: "id", value: request.id }],
					update: { status: "expired", updatedAt: new Date() },
				});
				throw APIError.from("FORBIDDEN", ERROR_CODES.CIBA_REQUEST_EXPIRED);
			}

			if (request.status !== "pending") {
				return ctx.json({
					auth_req_id: request.id,
					status: request.status,
				});
			}

			const now = new Date();

			await ctx.context.adapter.update({
				model: CIBA_TABLE,
				where: [{ field: "id", value: request.id }],
				update: {
					status: "approved",
					updatedAt: now,
				},
			});

			// If this CIBA request is for scope approval, auto-approve
			// the agent's pending permissions.
			if (request.scope && request.scope.startsWith(SCOPE_APPROVAL_PREFIX)) {
				const agentId = request.scope.slice(SCOPE_APPROVAL_PREFIX.length);
				if (agentId) {
					const agent = await ctx.context.adapter.findOne<Agent>({
						model: AGENT_TABLE,
						where: [{ field: "id", value: agentId }],
					});
					const pendingPerms =
						await ctx.context.adapter.findMany<AgentPermission>({
							model: PERMISSION_TABLE,
							where: [
								{ field: "agentId", value: agentId },
								{ field: "status", value: "pending" },
							],
						});
					for (const perm of pendingPerms) {
						if (perm.grantedBy && perm.grantedBy !== session.user.id) {
							continue;
						}
						const expiresAt = await resolvePermissionExpiresAt(
							opts,
							perm.scope,
							{
								agentId,
								hostId: agent?.hostId ?? null,
								userId: agent?.userId ?? null,
							},
						);
						await ctx.context.adapter.update({
							model: PERMISSION_TABLE,
							where: [{ field: "id", value: perm.id }],
							update: {
								status: "active",
								grantedBy: session.user.id,
								expiresAt,
								updatedAt: now,
							},
						});
					}
				}
			}

			if (request.deliveryMode === "ping" || request.deliveryMode === "push") {
				void deliverNotification(request, {
					auth_req_id: request.id,
					status: "approved",
				});
			}

			emit(opts, {
				type: "ciba.approved",
				actorId: session.user.id,
				targetId: request.id,
				targetType: "cibaAuthRequest",
				metadata: { scope: request.scope },
			});

			return ctx.json({
				auth_req_id: request.id,
				status: "approved",
			});
		},
	);
}

/**
 * POST /agent/ciba/deny
 *
 * User denies a pending CIBA authentication request.
 */
export function cibaDeny(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/ciba/deny",
		{
			method: "POST",
			body: z.object({
				auth_req_id: z.string().meta({
					description: "The CIBA auth request ID to deny.",
				}),
			}),
			metadata: {
				openapi: {
					description: "Deny a pending CIBA authentication request.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const request = await ctx.context.adapter.findOne<CibaAuthRequest>({
				model: CIBA_TABLE,
				where: [{ field: "id", value: ctx.body.auth_req_id }],
			});

			if (!request) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.CIBA_REQUEST_NOT_FOUND);
			}

			if (request.userId && request.userId !== session.user.id) {
				throw APIError.from(
					"FORBIDDEN",
					ERROR_CODES.SCOPE_REQUEST_OWNER_MISMATCH,
				);
			}

			if (request.status !== "pending") {
				return ctx.json({
					auth_req_id: request.id,
					status: request.status,
				});
			}

			const denyNow = new Date();
			await ctx.context.adapter.update({
				model: CIBA_TABLE,
				where: [{ field: "id", value: request.id }],
				update: { status: "denied", updatedAt: denyNow },
			});

			// If this CIBA request is for scope approval, deny the
			// agent's pending permissions as well.
			if (request.scope && request.scope.startsWith(SCOPE_APPROVAL_PREFIX)) {
				const agentId = request.scope.slice(SCOPE_APPROVAL_PREFIX.length);
				if (agentId) {
					const pendingPerms =
						await ctx.context.adapter.findMany<AgentPermission>({
							model: PERMISSION_TABLE,
							where: [
								{ field: "agentId", value: agentId },
								{ field: "status", value: "pending" },
							],
						});
					for (const perm of pendingPerms) {
						if (perm.grantedBy && perm.grantedBy !== session.user.id) {
							continue;
						}
						await ctx.context.adapter.update({
							model: PERMISSION_TABLE,
							where: [{ field: "id", value: perm.id }],
							update: { status: "denied", updatedAt: denyNow },
						});
					}
				}
			}

			if (request.deliveryMode === "ping" || request.deliveryMode === "push") {
				void deliverNotification(request, {
					auth_req_id: request.id,
					error: "access_denied",
					error_description: "User denied the authentication request.",
				});
			}

			emit(opts, {
				type: "ciba.denied",
				actorId: session.user.id,
				targetId: request.id,
				targetType: "cibaAuthRequest",
				metadata: { scope: request.scope },
			});

			return ctx.json({
				auth_req_id: request.id,
				status: "denied",
			});
		},
	);
}
