import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { CibaAuthRequest, ResolvedAgentAuthOptions } from "../types";

const CIBA_TABLE = "cibaAuthRequest";
const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";

/**
 * POST /agent/ciba/token
 *
 * Token endpoint for the CIBA grant type.
 * Clients poll this to retrieve the access token after the user approves.
 */
export function cibaToken(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/ciba/token",
		{
			method: "POST",
			body: z.object({
				grant_type: z.string().meta({
					description: `Must be "${CIBA_GRANT_TYPE}".`,
				}),
				auth_req_id: z.string().meta({
					description:
						"The auth_req_id from the backchannel authorize response.",
				}),
				client_id: z.string().optional().meta({
					description: "Client identifier.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"CIBA Token Endpoint. Poll to retrieve the access token after user approval.",
				},
			},
		},
		async (ctx) => {
			if (!opts.approvalMethods.includes("ciba")) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.CIBA_NOT_ENABLED);
			}

			const { grant_type, auth_req_id } = ctx.body;

			if (grant_type !== CIBA_GRANT_TYPE) {
				throw new APIError("BAD_REQUEST", {
					message: `Unsupported grant_type. Expected "${CIBA_GRANT_TYPE}".`,
				});
			}

			const request = await ctx.context.adapter.findOne<CibaAuthRequest>({
				model: CIBA_TABLE,
				where: [{ field: "id", value: auth_req_id }],
			});

			if (!request) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.CIBA_REQUEST_NOT_FOUND);
			}

			if (new Date(request.expiresAt) <= new Date()) {
				if (request.status === "pending") {
					await ctx.context.adapter.update({
						model: CIBA_TABLE,
						where: [{ field: "id", value: request.id }],
						update: { status: "expired", updatedAt: new Date() },
					});
				}
				throw APIError.from("FORBIDDEN", ERROR_CODES.CIBA_REQUEST_EXPIRED);
			}

			if (request.status === "denied") {
				return ctx.json({ error: "access_denied" }, { status: 403 });
			}

			if (request.status === "expired") {
				return ctx.json({ error: "expired_token" }, { status: 400 });
			}

			if (request.status === "pending") {
				const now = new Date();
				if (request.lastPolledAt) {
					const elapsed =
						now.getTime() - new Date(request.lastPolledAt).getTime();
					if (elapsed < request.interval * 1000) {
						await ctx.context.adapter.update({
							model: CIBA_TABLE,
							where: [{ field: "id", value: request.id }],
							update: { lastPolledAt: now, updatedAt: now },
						});
						return ctx.json({ error: "slow_down" }, { status: 400 });
					}
				}

				await ctx.context.adapter.update({
					model: CIBA_TABLE,
					where: [{ field: "id", value: request.id }],
					update: { lastPolledAt: now, updatedAt: now },
				});

				return ctx.json({ error: "authorization_pending" }, { status: 400 });
			}

			if (request.status === "approved" && request.accessToken) {
				return ctx.json({
					access_token: request.accessToken,
					token_type: "Bearer",
					expires_in: Math.max(
						0,
						Math.floor(
							(new Date(request.expiresAt).getTime() - Date.now()) / 1000,
						),
					),
				});
			}

			return ctx.json({ error: "authorization_pending" }, { status: 400 });
		},
	);
}
