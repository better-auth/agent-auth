import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { CibaAuthRequest } from "../types";

const CIBA_TABLE = "cibaAuthRequest";

/**
 * GET /agent/ciba/pending
 *
 * Lists pending CIBA authentication requests for the current user.
 * The dashboard polls this to show real-time notifications.
 */
export function cibaPending() {
	return createAuthEndpoint(
		"/agent/ciba/pending",
		{
			method: "GET",
			metadata: {
				openapi: {
					description:
						"List pending CIBA authentication requests for the current user.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const requests = await ctx.context.adapter.findMany<CibaAuthRequest>({
				model: CIBA_TABLE,
				where: [
					{ field: "userId", value: session.user.id },
					{ field: "status", value: "pending" },
				],
				sortBy: { field: "createdAt", direction: "desc" },
			});

			const now = new Date();
			const active = requests.filter((r) => new Date(r.expiresAt) > now);

			return ctx.json({
				requests: active.map((r) => ({
					auth_req_id: r.id,
					client_id: r.clientId,
					binding_message: r.bindingMessage,
					scope: r.scope,
					delivery_mode: r.deliveryMode,
					expires_in: Math.max(
						0,
						Math.floor(
							(new Date(r.expiresAt).getTime() - now.getTime()) / 1000,
						),
					),
					created_at: r.createdAt,
				})),
			});
		},
	);
}
