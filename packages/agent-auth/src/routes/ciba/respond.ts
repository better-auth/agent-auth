import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import { resolveGrantExpiresAt } from "../../utils/grant-ttl";
import { activatePendingAgent } from "../_helpers";
import type {
	Agent,
	AgentCapabilityGrant,
	CibaAuthRequest,
	ResolvedAgentAuthOptions,
} from "../../types";
import { sessionMiddleware } from "better-auth/api";

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

export function cibaApprove(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/ciba/approve",
		{
			method: "POST",
			body: z.object({
				authReqId: z.string().meta({
					description: "The CIBA auth request ID to approve.",
				}),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Approve a pending CIBA authentication request (§9.2).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const request = await ctx.context.adapter.findOne<CibaAuthRequest>({
				model: TABLE.ciba,
				where: [{ field: "id", value: ctx.body.authReqId }],
			});

			if (!request) {
				throw APIError.from("NOT_FOUND", ERR.CIBA_NOT_FOUND);
			}

			if (request.loginHint === "connect-account") {
				throw APIError.from("BAD_REQUEST", ERR.INVALID_REQUEST);
			}

			if (request.userId && request.userId !== session.user.id) {
				throw APIError.from(
					"FORBIDDEN",
					ERR.CAPABILITY_REQUEST_OWNER_MISMATCH,
				);
			}

			if (new Date(request.expiresAt) <= new Date()) {
				await ctx.context.adapter.update({
					model: TABLE.ciba,
					where: [{ field: "id", value: request.id }],
					update: { status: "expired", updatedAt: new Date() },
				});
				throw APIError.from("FORBIDDEN", ERR.CIBA_EXPIRED);
			}

			if (request.status !== "pending") {
				return ctx.json({
					auth_req_id: request.id,
					status: request.status,
				});
			}

			const now = new Date();

			await ctx.context.adapter.update({
				model: TABLE.ciba,
				where: [{ field: "id", value: request.id }],
				update: { status: "approved", updatedAt: now },
			});

			const agentId = request.agentId;
			if (!agentId) {
				return ctx.json({ auth_req_id: request.id, status: "approved" });
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
			});

			const requestedCapabilities = new Set(
				(request.capabilityIds ?? "").split(/\s+/).filter(Boolean),
			);

			const pendingGrants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [
						{ field: "agentId", value: agentId },
						{ field: "status", value: "pending" },
					],
				});

			const matched =
				requestedCapabilities.size > 0
					? pendingGrants.filter((g) =>
							requestedCapabilities.has(g.capabilityId),
						)
					: pendingGrants;

			for (const grant of matched) {
				const expiresAt = await resolveGrantExpiresAt(
					opts,
					grant.capabilityId,
					{
						agentId,
						hostId: agent?.hostId ?? null,
						userId: agent?.userId ?? null,
					},
				);
				await ctx.context.adapter.update({
					model: TABLE.grant,
					where: [{ field: "id", value: grant.id }],
					update: {
						status: "active",
						grantedBy: session.user.id,
						expiresAt,
						updatedAt: now,
					},
				});
			}

			if (agent) {
				await activatePendingAgent(
					ctx.context.adapter,
					opts,
					ctx,
					{
						agentId,
						userId: session.user.id,
						agent,
					},
				);
			}

			if (
				request.deliveryMode === "ping" ||
				request.deliveryMode === "push"
			) {
				void deliverNotification(request, {
					auth_req_id: request.id,
					status: "approved",
				});
			}

			emit(opts, {
				type: "ciba.approved",
				actorId: session.user.id,
				agentId: agentId ?? undefined,
				targetId: request.id,
				targetType: "cibaAuthRequest",
				metadata: { capabilityIds: request.capabilityIds },
			}, ctx);

			return ctx.json({
				auth_req_id: request.id,
				status: "approved",
			});
		},
	);
}

export function cibaDeny(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/ciba/deny",
		{
			method: "POST",
			body: z.object({
				authReqId: z.string().meta({
					description: "The CIBA auth request ID to deny.",
				}),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Deny a pending CIBA authentication request (§9.2).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const request = await ctx.context.adapter.findOne<CibaAuthRequest>({
				model: TABLE.ciba,
				where: [{ field: "id", value: ctx.body.authReqId }],
			});

			if (!request) {
				throw APIError.from("NOT_FOUND", ERR.CIBA_NOT_FOUND);
			}

			if (request.loginHint === "connect-account") {
				throw APIError.from("BAD_REQUEST", ERR.INVALID_REQUEST);
			}

			if (request.userId && request.userId !== session.user.id) {
				throw APIError.from(
					"FORBIDDEN",
					ERR.CAPABILITY_REQUEST_OWNER_MISMATCH,
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
				model: TABLE.ciba,
				where: [{ field: "id", value: request.id }],
				update: { status: "denied", updatedAt: denyNow },
			});

			if (request.agentId) {
				const requestedCapabilities = new Set(
					(request.capabilityIds ?? "").split(/\s+/).filter(Boolean),
				);

				const pendingGrants =
					await ctx.context.adapter.findMany<AgentCapabilityGrant>({
						model: TABLE.grant,
						where: [
							{ field: "agentId", value: request.agentId },
							{ field: "status", value: "pending" },
						],
					});

				const matched =
					requestedCapabilities.size > 0
						? pendingGrants.filter((g) =>
								requestedCapabilities.has(g.capabilityId),
							)
						: pendingGrants;

				for (const grant of matched) {
					await ctx.context.adapter.update({
						model: TABLE.grant,
						where: [{ field: "id", value: grant.id }],
						update: { status: "denied", updatedAt: denyNow },
					});
				}
			}

			if (
				request.deliveryMode === "ping" ||
				request.deliveryMode === "push"
			) {
				void deliverNotification(request, {
					auth_req_id: request.id,
					error: "access_denied",
					error_description:
						"User denied the authentication request.",
				});
			}

			emit(opts, {
				type: "ciba.denied",
				actorId: session.user.id,
				agentId: request.agentId ?? undefined,
				targetId: request.id,
				targetType: "cibaAuthRequest",
				metadata: { capabilityIds: request.capabilityIds },
			}, ctx);

			return ctx.json({
				auth_req_id: request.id,
				status: "denied",
			});
		},
	);
}
