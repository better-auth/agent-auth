import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";

const SCOPE_REQUEST_TABLE = "agentScopeRequest";
const AGENT_TABLE = "agent";
const ACTIVITY_TABLE = "agentActivity";

interface ScopeRequestRecord {
	id: string;
	agentId: string;
	userId: string;
	agentName: string;
	newName: string | null;
	existingScopes: string[] | string;
	requestedScopes: string[] | string;
	status: string;
	createdAt: Date;
	expiresAt: Date;
}

function parseScopes(val: unknown): string[] {
	if (Array.isArray(val)) return val;
	if (typeof val === "string") {
		try {
			return JSON.parse(val);
		} catch {
			return [];
		}
	}
	return [];
}

/**
 * POST /agent/approve-scope
 *
 * Called by the user (authenticated via session cookie) to approve or
 * deny a pending scope request. On approval, merges the requested
 * scopes into the agent and optionally renames it.
 */
export function approveScope() {
	return createAuthEndpoint(
		"/agent/approve-scope",
		{
			method: "POST",
			body: z.object({
				requestId: z.string(),
				action: z.enum(["approve", "deny"]),
				scopes: z.array(z.string()).optional().meta({
					description:
						"When approving, the subset of requested scopes the user actually granted. Omit to approve all requested scopes.",
				}),
			}),
			metadata: {
				openapi: {
					description: "Approve or deny a pending scope escalation request.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { requestId, action, scopes: userScopes } = ctx.body;

			const scopeReq = await ctx.context.adapter.findOne<ScopeRequestRecord>({
				model: SCOPE_REQUEST_TABLE,
				where: [{ field: "id", value: requestId }],
			});

			if (!scopeReq) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.SCOPE_REQUEST_NOT_FOUND);
			}

			if (new Date(scopeReq.expiresAt) <= new Date()) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.SCOPE_REQUEST_NOT_FOUND);
			}

			if (scopeReq.userId !== session.user.id) {
				throw APIError.from(
					"FORBIDDEN",
					ERROR_CODES.SCOPE_REQUEST_OWNER_MISMATCH,
				);
			}

			if (scopeReq.status !== "pending") {
				throw APIError.from(
					"PRECONDITION_FAILED",
					ERROR_CODES.SCOPE_REQUEST_ALREADY_RESOLVED,
				);
			}

			const existing = parseScopes(scopeReq.existingScopes);
			const requested = parseScopes(scopeReq.requestedScopes);

			if (action === "deny") {
				await ctx.context.adapter.update({
					model: SCOPE_REQUEST_TABLE,
					where: [{ field: "id", value: requestId }],
					update: { status: "denied" },
				});

				ctx.context.runInBackground(
					ctx.context.adapter
						.create({
							model: ACTIVITY_TABLE,
							data: {
								agentId: scopeReq.agentId,
								userId: scopeReq.userId,
								method: "SCOPE",
								path: `scope_denied:${requested.join(",")}`,
								status: 403,
								createdAt: new Date(),
							},
						})
						.catch(() => {}),
				);

				return ctx.json({ status: "denied" });
			}

			const approved = userScopes ?? requested;
			const merged = [...new Set([...existing, ...approved])];

			const agentUpdate: Record<string, unknown> = {
				scopes: merged,
				updatedAt: new Date(),
			};
			if (scopeReq.newName) {
				agentUpdate.name = scopeReq.newName;
			}

			await ctx.context.adapter.update({
				model: AGENT_TABLE,
				where: [{ field: "id", value: scopeReq.agentId }],
				update: agentUpdate,
			});

			await ctx.context.adapter.update({
				model: SCOPE_REQUEST_TABLE,
				where: [{ field: "id", value: requestId }],
				update: { status: "approved" },
			});

			ctx.context.runInBackground(
				ctx.context.adapter
					.create({
						model: ACTIVITY_TABLE,
						data: {
							agentId: scopeReq.agentId,
							userId: scopeReq.userId,
							method: "SCOPE",
							path: `scope_approved:${approved.join(",")}${scopeReq.newName ? `:renamed=${scopeReq.newName}` : ""}`,
							status: 200,
							createdAt: new Date(),
						},
					})
					.catch(() => {}),
			);

			return ctx.json({
				status: "approved",
				agentId: scopeReq.agentId,
				scopes: merged,
				added: approved,
			});
		},
	);
}
