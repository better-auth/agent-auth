import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { resolveGrantExpiresAt } from "../utils/grant-ttl";
import {
	findBlockedCapabilities,
	hasCapability,
	parseCapabilityIds,
} from "../utils/capabilities";
import type {
	AgentCapabilityGrant,
	AgentHost,
	AgentSession,
	ApprovalRequest,
	ResolvedAgentAuthOptions,
} from "../types";
import {
	buildApprovalInfo,
	formatGrantsResponse,
	validateCapabilitiesExist,
} from "./_helpers";

/**
 * POST /agent/request-capability (§6.4).
 *
 * Requests additional capabilities for an existing agent.
 * Auto-approves capabilities within the host's default set;
 * creates pending grants for capabilities outside the budget.
 */
export function requestCapability(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/request-capability",
		{
			method: "POST",
			body: z.object({
				capabilities: z.array(z.string()).min(1),
				reason: z.string().optional(),
				preferred_method: z
					.enum(["device_authorization", "ciba"])
					.optional(),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Request additional capabilities for an agent (§6.4).",
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as Record<string, unknown>)
				.agentSession as AgentSession | undefined;

			if (!agentSession) {
				throw agentError(
					"UNAUTHORIZED",
					ERR.UNAUTHORIZED_SESSION,
				);
			}

			const { capabilities: capabilityIds, reason, preferred_method: preferredMethod } = ctx.body;

			// Validate blocked (§10.6)
			if (opts.blockedCapabilities.length > 0) {
				const blocked = findBlockedCapabilities(
					capabilityIds,
					opts.blockedCapabilities,
				);
				if (blocked.length > 0) {
					throw agentError(
						"BAD_REQUEST",
						ERR.INVALID_CAPABILITIES,
					);
				}
			}

			// Validate existence (§10.6)
			await validateCapabilitiesExist(capabilityIds, opts);

			const existingGrants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [
						{ field: "agentId", value: agentSession.agent.id },
					],
				});

			const ownerId = agentSession.host?.userId ?? null;
			const now = new Date();

			const activeCapIds = existingGrants
				.filter(
					(g) =>
						g.status === "active" &&
						(!g.expiresAt || new Date(g.expiresAt) > now),
				)
				.map((g) => g.capability);

			const pendingCapIds = existingGrants
				.filter(
					(g) =>
						g.status === "pending" &&
						(!g.grantedBy || g.grantedBy === ownerId),
				)
				.map((g) => g.capability);

			const alreadyActive = new Set(activeCapIds);
			const alreadyPending = new Set(pendingCapIds);
			const alreadyTracked = new Set([
				...activeCapIds,
				...pendingCapIds,
			]);
			const newOnly = capabilityIds.filter(
				(c) => !alreadyTracked.has(c),
			);

			if (newOnly.length === 0) {
				const allActive = capabilityIds.every((c) =>
					alreadyActive.has(c),
				);
				if (allActive) {
					throw agentError(
						"CONFLICT",
						ERR.ALREADY_GRANTED,
					);
				}

				// Some still pending — return pending with approval info
				const stillPending = capabilityIds.filter((c) =>
					alreadyPending.has(c),
				);

				const existingApproval =
					await ctx.context.adapter.findOne<ApprovalRequest>({
						model: TABLE.approval,
						where: [
							{
								field: "agentId",
								value: agentSession.agent.id,
							},
							{ field: "status", value: "pending" },
						],
					});

				if (
					existingApproval &&
					new Date(existingApproval.expiresAt) > now
				) {
					return ctx.json({
						agent_id: agentSession.agent.id,
						status: "pending",
						agent_capability_grants:
						formatGrantsResponse(existingGrants, opts.capabilities),
					approval: {
						method: existingApproval.method,
							expires_in: Math.floor(
								(new Date(
									existingApproval.expiresAt,
								).getTime() -
									now.getTime()) /
									1000,
							),
							interval: existingApproval.interval,
						},
					});
				}

				const approval = await buildApprovalInfo(
					opts,
					ctx.context.adapter,
					ctx.context.internalAdapter,
					{
						origin: new URL(ctx.context.baseURL).origin,
						agentId: agentSession.agent.id,
						agentName: agentSession.agent.name,
						userId: agentSession.host?.userId ?? null,
						hostId: agentSession.agent.hostId,
						capabilities: stillPending,
						preferredMethod,
					},
				);

				return ctx.json({
					agent_id: agentSession.agent.id,
					status: "pending",
					agent_capability_grants:
						formatGrantsResponse(existingGrants, opts.capabilities),
					approval,
				});
			}

			// Resolve host budget
			let hostBudget: string[] = [];
			let hostIsActive = false;
			let hostUserId: string | null = null;
			if (agentSession.agent.hostId) {
				const host =
					await ctx.context.adapter.findOne<AgentHost>({
						model: TABLE.host,
						where: [
							{
								field: "id",
								value: agentSession.agent.hostId,
							},
						],
					});
				if (host) {
					hostBudget = parseCapabilityIds(
						host.defaultCapabilities,
					);
					hostIsActive = host.status === "active";
					hostUserId = host.userId ?? null;
				}
			}

			let autoApprove: string[];
			let needsApproval: string[];

			if (hostIsActive && hostBudget.length > 0) {
				autoApprove = newOnly.filter((c) =>
					hasCapability(hostBudget, c),
				);
				needsApproval = newOnly.filter(
					(c) => !hasCapability(hostBudget, c),
				);
			} else {
				autoApprove = [];
				needsApproval = newOnly;
			}

			if (needsApproval.length > 0 && !hostUserId && agentSession.agent.mode === "autonomous") {
				throw agentError(
					"FORBIDDEN",
					ERR.CAPABILITY_DENIED,
					"Requested capabilities are not pre-authorized for this autonomous host.",
				);
			}

			// Auto-approve
			for (const capId of autoApprove) {
				const expiresAt = await resolveGrantExpiresAt(
					opts,
					capId,
					{
						agentId: agentSession.agent.id,
						hostId: agentSession.agent.hostId,
						userId: agentSession.host?.userId ?? null,
					},
				);
				await ctx.context.adapter.create({
					model: TABLE.grant,
					data: {
						agentId: agentSession.agent.id,
						capability: capId,
						grantedBy: agentSession.host?.userId ?? null,
						expiresAt,
						status: "active",
						reason: reason ?? null,
						createdAt: now,
						updatedAt: now,
					},
				});
			}

			if (needsApproval.length === 0) {
				if (autoApprove.length > 0) {
					emit(opts, {
						type: "capability.granted",
						actorType: "system",
						agentId: agentSession.agent.id,
						hostId: agentSession.agent.hostId,
						metadata: {
							capabilities: autoApprove,
							auto: true,
						},
					}, ctx);
				}

				const updatedGrants =
					await ctx.context.adapter.findMany<AgentCapabilityGrant>({
						model: TABLE.grant,
						where: [
							{
								field: "agentId",
								value: agentSession.agent.id,
							},
						],
					});

				return ctx.json({
					agent_id: agentSession.agent.id,
					status: "granted",
					agent_capability_grants:
						formatGrantsResponse(updatedGrants, opts.capabilities),
				});
			}

			// Create pending grants
			for (const capId of needsApproval) {
				await ctx.context.adapter.create({
					model: TABLE.grant,
					data: {
						agentId: agentSession.agent.id,
						capability: capId,
						grantedBy: agentSession.host?.userId ?? null,
						expiresAt: null,
						status: "pending",
						reason: reason ?? null,
						createdAt: now,
						updatedAt: now,
					},
				});
			}

			const approval = await buildApprovalInfo(
				opts,
				ctx.context.adapter,
				ctx.context.internalAdapter,
				{
					origin: new URL(ctx.context.baseURL).origin,
					agentId: agentSession.agent.id,
					agentName: agentSession.agent.name,
					userId: agentSession.host?.userId ?? null,
					hostId: agentSession.agent.hostId,
					capabilities: needsApproval,
					preferredMethod,
				},
			);

			emit(opts, {
				type: "capability.requested",
				actorType: "agent",
				actorId: agentSession.host?.userId ?? undefined,
				agentId: agentSession.agent.id,
				hostId: agentSession.agent.hostId,
				metadata: {
					autoApproved: autoApprove,
					pending: needsApproval,
					reason,
				},
			}, ctx);

			const allGrants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [
						{ field: "agentId", value: agentSession.agent.id },
					],
				});

			return ctx.json({
				agent_id: agentSession.agent.id,
				status: "pending",
				agent_capability_grants: formatGrantsResponse(allGrants, opts.capabilities),
				approval,
			});
		},
	);
}
