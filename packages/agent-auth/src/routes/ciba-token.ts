import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import type { CibaAuthRequest, ResolvedAgentAuthOptions } from "../types";

const CIBA_TABLE = "cibaAuthRequest";
const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";

// Tolerance to avoid spurious slow_down from timing jitter (ms)
const SLOW_DOWN_TOLERANCE_MS = 500;

/**
 * POST /agent/ciba/token
 *
 * Token endpoint for the CIBA grant type.
 * Clients poll this to retrieve the access token after the user approves.
 *
 * All error responses use RFC 8628 / CIBA Core `{ error, error_description }`
 * format — never Better Auth's `{ code, message }` format — so that
 * generic CIBA clients can parse them reliably.
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
				return ctx.json(
					{
						error: "invalid_request",
						error_description: "CIBA is not enabled on this server.",
					},
					{ status: 400 },
				);
			}

			const { grant_type, auth_req_id } = ctx.body;

			if (grant_type !== CIBA_GRANT_TYPE) {
				return ctx.json(
					{
						error: "invalid_grant",
						error_description: `Unsupported grant_type. Expected "${CIBA_GRANT_TYPE}".`,
					},
					{ status: 400 },
				);
			}

			const request = await ctx.context.adapter.findOne<CibaAuthRequest>({
				model: CIBA_TABLE,
				where: [{ field: "id", value: auth_req_id }],
			});

			if (!request) {
				return ctx.json(
					{
						error: "invalid_grant",
						error_description:
							"The auth_req_id is invalid or has been removed.",
					},
					{ status: 400 },
				);
			}

			if (new Date(request.expiresAt) <= new Date()) {
				if (request.status === "pending") {
					await ctx.context.adapter.update({
						model: CIBA_TABLE,
						where: [{ field: "id", value: request.id }],
						update: { status: "expired", updatedAt: new Date() },
					});
				}
				return ctx.json(
					{
						error: "expired_token",
						error_description: "The authentication request has expired.",
					},
					{ status: 400 },
				);
			}

			if (request.status === "denied") {
				return ctx.json(
					{
						error: "access_denied",
						error_description: "The user denied the authentication request.",
					},
					{ status: 403 },
				);
			}

			if (request.status === "expired") {
				return ctx.json(
					{
						error: "expired_token",
						error_description: "The authentication request has expired.",
					},
					{ status: 400 },
				);
			}

			if (request.status === "pending") {
				const now = new Date();
				if (request.lastPolledAt) {
					const elapsed =
						now.getTime() - new Date(request.lastPolledAt).getTime();
					const threshold = request.interval * 1000 - SLOW_DOWN_TOLERANCE_MS;
					if (elapsed < threshold) {
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

			if (request.status === "approved") {
				return ctx.json({
					auth_req_id: request.id,
					status: "approved",
				});
			}

			return ctx.json({ error: "authorization_pending" }, { status: 400 });
		},
	);
}
