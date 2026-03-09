import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { resolveGrantExpiresAt } from "../utils/grant-ttl";
import { findBlockedCapabilities } from "../utils/capabilities";
import {
	activatePendingAgent,
	resolvePendingCibaRequests,
} from "./_helpers";
import type {
	Agent,
	AgentCapabilityGrant,
	ResolvedAgentAuthOptions,
} from "../types";

/**
 * POST /agent/approve-capability
 *
 * Browser-based (device authorization) approval path (§9.1).
 * Optionally requires a fresh session (configurable via `freshSessionWindow`).
 */
export function approveCapability(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/approve-capability",
		{
			method: "POST",
			body: z.object({
				agent_id: z.string(),
				action: z.enum(["approve", "deny"]),
				capabilities: z.array(z.string()).optional(),
				ttl: z.number().positive().optional(),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Approve or deny pending capability requests via device authorization (§9.1).",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const {
				agent_id: agentId,
				action,
				capabilities: userCapIds,
				ttl: explicitTTL,
			} = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw APIError.from(
					"NOT_FOUND",
					ERR.CAPABILITY_REQUEST_NOT_FOUND,
				);
			}

			if (agent.userId && agent.userId !== session.user.id) {
				throw APIError.from(
					"FORBIDDEN",
					ERR.CAPABILITY_REQUEST_OWNER_MISMATCH,
				);
			}

			const allGrants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [{ field: "agentId", value: agentId }],
				});

			const pendingGrants = allGrants.filter(
				(g) => g.status === "pending",
			);

			const agentIsPending = agent.status === "pending";

			if (pendingGrants.length === 0 && !agentIsPending) {
				throw APIError.from(
					"PRECONDITION_FAILED",
					ERR.CAPABILITY_REQUEST_ALREADY_RESOLVED,
				);
			}

			const now = new Date();

			if (action === "deny") {
				for (const grant of pendingGrants) {
					await ctx.context.adapter.update({
						model: TABLE.grant,
						where: [{ field: "id", value: grant.id }],
						update: { status: "denied", updatedAt: now },
					});
				}

				if (agentIsPending) {
					await ctx.context.adapter.update({
						model: TABLE.agent,
						where: [{ field: "id", value: agentId }],
						update: { status: "rejected", updatedAt: now },
					});
				}

				await resolvePendingCibaRequests(ctx.context.adapter, {
					agentId,
					status: "denied",
				});

				emit(opts, {
					type: "capability.denied",
					actorId: session.user.id,
					agentId,
					metadata: {
						capabilities: pendingGrants.map(
							(g) => g.capability,
						),
					},
				}, ctx);

				return ctx.json({ status: "denied" });
			}

			// Approve
			const approvedCapIds = userCapIds
				? new Set(userCapIds)
				: new Set(pendingGrants.map((g) => g.capability));

			// Fresh session enforcement (§10.11)
			const capabilities = [...approvedCapIds];
			const freshWindow =
				typeof opts.freshSessionWindow === "function"
					? await opts.freshSessionWindow({ ctx, capabilities })
					: opts.freshSessionWindow;

			if (freshWindow > 0) {
				const sessionCreated = session.session?.createdAt
					? new Date(session.session.createdAt).getTime()
					: 0;
				const age = (Date.now() - sessionCreated) / 1000;
				if (age > freshWindow) {
					throw APIError.from(
						"FORBIDDEN",
						ERR.FRESH_SESSION_REQUIRED,
					);
				}
			}

			if (opts.blockedCapabilities.length > 0) {
				const blocked = findBlockedCapabilities(
					[...approvedCapIds],
					opts.blockedCapabilities,
				);
				if (blocked.length > 0) {
					throw new APIError("BAD_REQUEST", {
						message: `Blocked capabilities: ${blocked.join(", ")}`,
					});
				}
			}

			const alreadyActive = new Set(
				allGrants
					.filter((g) => g.status === "active")
					.map((g) => g.capability),
			);
			const added: string[] = [];

			for (const grant of pendingGrants) {
				if (approvedCapIds.has(grant.capability)) {
					if (alreadyActive.has(grant.capability)) {
						await ctx.context.adapter.delete({
							model: TABLE.grant,
							where: [{ field: "id", value: grant.id }],
						});
					} else {
						const expiresAt = await resolveGrantExpiresAt(
							opts,
							grant.capability,
							{
								agentId,
								hostId: agent.hostId,
								userId: agent.userId,
							},
							explicitTTL,
						);
						await ctx.context.adapter.update({
							model: TABLE.grant,
							where: [{ field: "id", value: grant.id }],
							update: {
								status: "active",
								expiresAt,
								grantedBy: session.user.id,
								updatedAt: now,
							},
						});
						alreadyActive.add(grant.capability);
						added.push(grant.capability);
					}
				} else {
					await ctx.context.adapter.update({
						model: TABLE.grant,
						where: [{ field: "id", value: grant.id }],
						update: { status: "denied", updatedAt: now },
					});
				}
			}

			await resolvePendingCibaRequests(ctx.context.adapter, {
				agentId,
				status: added.length > 0 ? "approved" : "denied",
			});

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

			emit(opts, {
				type: "capability.approved",
				actorId: session.user.id,
				agentId,
				metadata: { capabilities: added },
			}, ctx);

			return ctx.json({
				status: "approved",
				agentId,
				added,
			});
		},
	);
}

	