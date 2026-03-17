import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { emit } from "../emit";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../types";
import { parseCapabilityIds } from "../utils/capabilities";
import {
	buildApprovalInfo,
	createGrantRows,
	formatGrantsResponse,
} from "./_helpers";

/**
 * POST /agent/reactivate (§6.6).
 *
 * Reactivates an expired agent. Auth: Host JWT.
 * Capabilities decay to host defaults; escalated capabilities are lost.
 */
export function reactivateAgent(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/reactivate",
		{
			method: "POST",
			body: z.object({
				agent_id: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Reactivate an expired agent (§6.6). Capabilities decay to host defaults.",
				},
			},
		},
		async (ctx) => {
			const hostSession = (ctx.context as Record<string, unknown>)
				.hostSession as HostSession | undefined;

			if (!hostSession) {
				throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: ctx.body.agent_id }],
			});

			if (!agent) {
				throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (agent.hostId !== hostSession.host.id) {
				throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
			}

			// §6.6 state checks
			if (agent.status === "active") {
				const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>(
					{
						model: TABLE.grant,
						where: [{ field: "agentId", value: agent.id }],
					}
				);
				return ctx.json({
					agent_id: agent.id,
					status: "active" as const,
					agent_capability_grants: formatGrantsResponse(
						grants,
						opts.capabilities
					),
					activated_at: agent.activatedAt,
					expires_at: agent.expiresAt,
				});
			}
			if (agent.status === "revoked") {
				throw agentError("FORBIDDEN", ERR.AGENT_REVOKED);
			}
			if (agent.status === "rejected") {
				throw agentError("FORBIDDEN", ERR.AGENT_REJECTED);
			}
			if (agent.status === "claimed") {
				throw agentError("FORBIDDEN", ERR.AGENT_CLAIMED);
			}
			if (agent.status === "pending") {
				throw agentError("FORBIDDEN", ERR.AGENT_PENDING);
			}

			// Absolute lifetime check (§2.4)
			if (opts.absoluteLifetime > 0 && agent.createdAt) {
				const absoluteExpiry =
					new Date(agent.createdAt).getTime() + opts.absoluteLifetime * 1000;
				if (Date.now() >= absoluteExpiry) {
					const revokedAt = new Date();
					await Promise.all([
						ctx.context.adapter.update({
							model: TABLE.agent,
							where: [{ field: "id", value: agent.id }],
							update: {
								status: "revoked",
								publicKey: "",
								kid: null,
								updatedAt: revokedAt,
							},
						}),
						ctx.context.adapter.update({
							model: TABLE.grant,
							where: [{ field: "agentId", value: agent.id }],
							update: { status: "revoked", updatedAt: revokedAt },
						}),
					]);
					throw agentError("FORBIDDEN", ERR.ABSOLUTE_LIFETIME_EXCEEDED);
				}
			}

			// Resolve host defaults
			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: TABLE.host,
				where: [{ field: "id", value: agent.hostId }],
			});

			if (!host || host.status === "revoked") {
				throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
			}

			const baseCapabilityIds = parseCapabilityIds(host.defaultCapabilities);

			const now = new Date();
			const isHostLinked = !!host.userId;
			const needsApproval = !isHostLinked && baseCapabilityIds.length > 0;

			// Revoke all existing grants and re-grant host defaults
			await createGrantRows(
				ctx.context.adapter,
				agent.id,
				baseCapabilityIds,
				agent.userId,
				{
					clearExisting: true,
					status: needsApproval ? "pending" : "active",
				},
				needsApproval
					? undefined
					: {
							pluginOpts: opts,
							hostId: agent.hostId,
							userId: agent.userId,
						}
			);

			const newStatus = needsApproval ? "pending" : "active";
			const expiresAt =
				!needsApproval && opts.agentSessionTTL > 0
					? new Date(now.getTime() + opts.agentSessionTTL * 1000)
					: null;

			await ctx.context.adapter.update({
				model: TABLE.agent,
				where: [{ field: "id", value: agent.id }],
				update: {
					status: newStatus,
					activatedAt: needsApproval ? null : now,
					expiresAt,
					lastUsedAt: needsApproval ? null : now,
					updatedAt: now,
				},
			});

			const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
				model: TABLE.grant,
				where: [{ field: "agentId", value: agent.id }],
			});

			emit(
				opts,
				{
					type: "agent.reactivated",
					actorType: "agent",
					agentId: agent.id,
					hostId: agent.hostId ?? undefined,
					metadata: {
						capabilities: grants
							.filter((g) => g.status === "active")
							.map((g) => g.capability),
					},
				},
				ctx
			);

			const response: Record<string, unknown> = {
				agent_id: agent.id,
				status: newStatus,
				agent_capability_grants: formatGrantsResponse(
					grants,
					opts.capabilities
				),
				activated_at: needsApproval ? null : now.toISOString(),
				expires_at: expiresAt ? expiresAt.toISOString() : null,
			};

			if (needsApproval) {
				const origin = new URL(ctx.context.baseURL).origin;
				response.approval = await buildApprovalInfo(
					opts,
					ctx.context.adapter,
					ctx.context.internalAdapter,
					{
						origin,
						agentId: agent.id,
						userId: agent.userId,
						agentName: agent.name,
						hostId: agent.hostId,
						capabilities: baseCapabilityIds,
					}
				);
			}

			return ctx.json(response);
		}
	);
}
