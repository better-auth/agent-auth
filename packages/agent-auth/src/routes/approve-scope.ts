import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { findBlockedScopes, mergeScopes } from "../scopes";
import type { ResolvedAgentAuthOptions } from "../types";

const SCOPE_REQUEST_TABLE = "agentScopeRequest";
const AGENT_TABLE = "agent";

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

export function approveScope(opts: ResolvedAgentAuthOptions) {
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
					description:
						"Approve or deny a pending scope escalation request. Requires a fresh session (§15.2).",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			if (opts.freshSessionWindow > 0) {
				const sessionCreated = session.session?.createdAt
					? new Date(session.session.createdAt).getTime()
					: 0;
				const age = (Date.now() - sessionCreated) / 1000;
				if (age > opts.freshSessionWindow) {
					throw APIError.from("FORBIDDEN", ERROR_CODES.FRESH_SESSION_REQUIRED);
				}
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

				return ctx.json({ status: "denied" });
			}

			const approved = userScopes ?? requested;

			if (opts.blockedScopes.length > 0) {
				const blocked = findBlockedScopes(approved, opts.blockedScopes);
				if (blocked.length > 0) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.SCOPE_BLOCKED);
				}
			}

			const merged = mergeScopes(existing, approved);

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

			return ctx.json({
				status: "approved",
				agentId: scopeReq.agentId,
				scopes: merged,
				added: approved,
			});
		},
	);
}
