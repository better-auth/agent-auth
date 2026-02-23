import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";

const SCOPE_REQUEST_TABLE = "agentScopeRequest";

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
 * GET /agent/scope-request-status
 *
 * Poll the status of a pending scope request. Used by the CLI / MCP
 * server to wait for user approval. No authentication required since
 * the requestId is unguessable.
 */
export function scopeRequestStatus() {
	return createAuthEndpoint(
		"/agent/scope-request-status",
		{
			method: "GET",
			query: z.object({
				requestId: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Check the status of a pending scope request.",
				},
			},
		},
		async (ctx) => {
			const { requestId } = ctx.query;

			const scopeReq =
				await ctx.context.adapter.findOne<ScopeRequestRecord>({
					model: SCOPE_REQUEST_TABLE,
					where: [{ field: "id", value: requestId }],
				});

			if (!scopeReq) {
				throw APIError.from(
					"NOT_FOUND",
					ERROR_CODES.SCOPE_REQUEST_NOT_FOUND,
				);
			}

			if (new Date(scopeReq.expiresAt) <= new Date()) {
				throw APIError.from(
					"NOT_FOUND",
					ERROR_CODES.SCOPE_REQUEST_NOT_FOUND,
				);
			}

			const existing = parseScopes(scopeReq.existingScopes);
			const requested = parseScopes(scopeReq.requestedScopes);

			return ctx.json({
				requestId: scopeReq.id,
				status: scopeReq.status,
				agentId: scopeReq.agentId,
				agentName: scopeReq.agentName,
				newName: scopeReq.newName || undefined,
				existingScopes: existing,
				requestedScopes: requested,
				scopes:
					scopeReq.status === "approved"
						? [...new Set([...existing, ...requested])]
						: undefined,
				added:
					scopeReq.status === "approved" ? requested : undefined,
			});
		},
	);
}
