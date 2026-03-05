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
	AgentPermission,
	ResolvedAgentAuthOptions,
} from "../types";

const PERMISSION_TABLE = "agentPermission";
const AGENT_TABLE = "agent";

export function approveScope(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/approve-scope",
		{
			method: "POST",
			body: z.object({
				requestId: z.string().meta({
					description:
						"The agent ID whose pending permissions should be resolved.",
				}),
				action: z.enum(["approve", "deny"]),
				scopes: z.array(z.string()).optional().meta({
					description:
						"When approving, the subset of pending scopes the user actually granted. Omit to approve all pending scopes.",
				}),
				ttl: z.number().positive().optional().meta({
					description:
						"Permission TTL in seconds. Overrides the plugin-level resolvePermissionTTL. Omit for no expiry.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Approve or deny pending permission requests for an agent. Requires a fresh session (§15.2).",
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

			const {
				requestId: agentId,
				action,
				scopes: userScopes,
				ttl: explicitTTL,
			} = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.SCOPE_REQUEST_NOT_FOUND);
			}

			if (agent.userId !== session.user.id) {
				throw APIError.from(
					"FORBIDDEN",
					ERROR_CODES.SCOPE_REQUEST_OWNER_MISMATCH,
				);
			}

			const allPerms = await ctx.context.adapter.findMany<AgentPermission>({
				model: PERMISSION_TABLE,
				where: [{ field: "agentId", value: agentId }],
			});

			const pendingPerms = allPerms.filter((p) => p.status === "pending");

			if (pendingPerms.length === 0) {
				throw APIError.from(
					"PRECONDITION_FAILED",
					ERROR_CODES.SCOPE_REQUEST_ALREADY_RESOLVED,
				);
			}

			const now = new Date();

			if (action === "deny") {
				for (const perm of pendingPerms) {
					await ctx.context.adapter.update({
						model: PERMISSION_TABLE,
						where: [{ field: "id", value: perm.id }],
						update: { status: "denied", updatedAt: now },
					});
				}

				emit(opts, {
					type: "scope.denied",
					actorId: session.user.id,
					agentId,
					metadata: { scopes: pendingPerms.map((p) => p.scope) },
				});

				return ctx.json({ status: "denied" });
			}

			const approvedScopes = userScopes
				? new Set(userScopes)
				: new Set(pendingPerms.map((p) => p.scope));

			if (opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(
					[...approvedScopes],
					opts.blockedScopes,
				);
				if (blocked.length > 0) {
					throw new APIError("BAD_REQUEST", {
						message: `${ERROR_CODES.SCOPE_BLOCKED} Blocked: ${blocked.join(", ")}.`,
					});
				}
			}

			const alreadyActive = new Set(
				allPerms.filter((p) => p.status === "active").map((p) => p.scope),
			);
			const added: string[] = [];

			for (const perm of pendingPerms) {
				if (approvedScopes.has(perm.scope)) {
					if (alreadyActive.has(perm.scope)) {
						await ctx.context.adapter.delete({
							model: PERMISSION_TABLE,
							where: [{ field: "id", value: perm.id }],
						});
					} else {
						const expiresAt = await resolvePermissionExpiresAt(
							opts,
							perm.scope,
							{
								agentId,
								hostId: agent.hostId ?? null,
								userId: agent.userId ?? null,
							},
							explicitTTL,
						);
						await ctx.context.adapter.update({
							model: PERMISSION_TABLE,
							where: [{ field: "id", value: perm.id }],
							update: { status: "active", expiresAt, updatedAt: now },
						});
						alreadyActive.add(perm.scope);
						added.push(perm.scope);
					}
				} else {
					await ctx.context.adapter.update({
						model: PERMISSION_TABLE,
						where: [{ field: "id", value: perm.id }],
						update: { status: "denied", updatedAt: now },
					});
				}
			}

			emit(opts, {
				type: "scope.approved",
				actorId: session.user.id,
				agentId,
				metadata: { scopes: added },
			});

			return ctx.json({
				status: "approved",
				agentId,
				added,
			});
		},
	);
}
