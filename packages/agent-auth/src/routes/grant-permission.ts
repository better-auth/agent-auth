import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { resolvePermissionExpiresAt } from "../permission-ttl";
import { findBlockedScopes } from "../scopes";
import type {
	Agent,
	AgentHost,
	AgentPermission,
	ResolvedAgentAuthOptions,
} from "../types";

const AGENT_TABLE = "agent";
const HOST_TABLE = "agentHost";
const PERMISSION_TABLE = "agentPermission";

/**
 * POST /agent/grant-permission
 *
 * Grant additional scopes to an agent. Requires user session (agent owner).
 * Scopes are validated against blocked scopes and optionally against known scopes.
 */
export function grantPermission(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/grant-permission",
		{
			method: "POST",
			body: z.object({
				agentId: z.string().meta({ description: "Agent to grant scopes to" }),
				scopes: z
					.array(z.string())
					.min(1)
					.meta({ description: "Scopes to grant" }),
				referenceId: z.string().optional().meta({
					description: "Optional resource ID this permission applies to.",
				}),
				ttl: z.number().positive().optional().meta({
					description:
						"Permission TTL in seconds. Overrides the plugin-level resolvePermissionTTL. Omit for no expiry.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Grant additional scopes to an agent. Requires user session.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { agentId, scopes, referenceId, ttl: explicitTTL } = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			if (agent.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERROR_CODES.AGENT_REVOKED);
			}

			// §2.6: Verify the caller is the user linked to the agent's host
			if (agent.userId && agent.userId !== session.user.id) {
				if (agent.hostId) {
					const host = await ctx.context.adapter.findOne<AgentHost>({
						model: HOST_TABLE,
						where: [{ field: "id", value: agent.hostId }],
					});
					if (!host || host.userId !== session.user.id) {
						throw APIError.from("FORBIDDEN", ERROR_CODES.UNAUTHORIZED);
					}
				} else {
					throw APIError.from("FORBIDDEN", ERROR_CODES.UNAUTHORIZED);
				}
			}

			if (opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(scopes, opts.blockedScopes);
				if (blocked.length > 0) {
					throw new APIError("BAD_REQUEST", {
						message: `${ERROR_CODES.SCOPE_BLOCKED} Blocked: ${blocked.join(", ")}.`,
					});
				}
			}

			if (opts.validateScopes) {
				const valid = await opts.validateScopes(scopes);
				if (!valid) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.UNKNOWN_SCOPES);
				}
			}

			const existing = await ctx.context.adapter.findMany<AgentPermission>({
				model: PERMISSION_TABLE,
				where: [{ field: "agentId", value: agentId }],
			});

			const now = new Date();
			const permissionIds: string[] = [];
			const added: string[] = [];

			for (const scope of scopes) {
				const pendingPerm = existing.find(
					(p) => p.scope === scope && p.status === "pending",
				);

				const expiresAt = await resolvePermissionExpiresAt(
					opts,
					scope,
					{ agentId, hostId: agent.hostId, userId: agent.userId },
					explicitTTL,
				);

				if (pendingPerm) {
					await ctx.context.adapter.update({
						model: PERMISSION_TABLE,
						where: [{ field: "id", value: pendingPerm.id }],
						update: {
							status: "active",
							referenceId: referenceId ?? pendingPerm.referenceId,
							expiresAt,
							updatedAt: now,
						},
					});
					permissionIds.push(pendingPerm.id);
				} else {
					const alreadyActive = existing.find(
						(p) =>
							p.scope === scope &&
							p.status === "active" &&
							p.referenceId === (referenceId ?? null),
					);
					if (alreadyActive) continue;

					const perm = await ctx.context.adapter.create<
						Record<string, unknown>,
						AgentPermission
					>({
						model: PERMISSION_TABLE,
						data: {
							agentId,
							scope,
							referenceId: referenceId ?? null,
							grantedBy: session.user.id,
							expiresAt,
							status: "active",
							reason: null,
							createdAt: now,
							updatedAt: now,
						},
					});
					permissionIds.push(perm.id);
				}
				added.push(scope);
			}

			emit(opts, {
				type: "scope.granted",
				actorId: session.user.id,
				agentId,
				metadata: { scopes: added, referenceId },
			});

			return ctx.json({ agentId, permissionIds, added });
		},
	);
}
