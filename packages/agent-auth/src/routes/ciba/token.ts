import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../../constants";
import type { CibaAuthRequest, ResolvedAgentAuthOptions } from "../../types";

const SLOW_DOWN_TOLERANCE_MS = 500;

export function cibaToken(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/ciba/token",
		{
			method: "POST",
			body: z.object({
				authReqId: z.string().meta({
					description:
						"The auth_req_id from the backchannel authorize response.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"CIBA Token Endpoint (§9.2). Poll to check the status of a CIBA auth request.",
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

			const { authReqId } = ctx.body;

			const request = await ctx.context.adapter.findOne<CibaAuthRequest>({
				model: TABLE.ciba,
				where: [{ field: "id", value: authReqId }],
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
						model: TABLE.ciba,
						where: [{ field: "id", value: request.id }],
						update: { status: "expired", updatedAt: new Date() },
					});
				}
				return ctx.json(
					{
						error: "expired_token",
						error_description:
							"The authentication request has expired.",
					},
					{ status: 400 },
				);
			}

			if (request.status === "denied") {
				return ctx.json(
					{
						error: "access_denied",
						error_description:
							"The user denied the authentication request.",
					},
					{ status: 403 },
				);
			}

			if (request.status === "expired") {
				return ctx.json(
					{
						error: "expired_token",
						error_description:
							"The authentication request has expired.",
					},
					{ status: 400 },
				);
			}

			if (request.status === "pending") {
				const now = new Date();
				if (request.lastPolledAt) {
					const elapsed =
						now.getTime() - new Date(request.lastPolledAt).getTime();
					const threshold =
						request.interval * 1000 - SLOW_DOWN_TOLERANCE_MS;
					if (elapsed < threshold) {
						await ctx.context.adapter.update({
							model: TABLE.ciba,
							where: [{ field: "id", value: request.id }],
							update: { lastPolledAt: now, updatedAt: now },
						});
						return ctx.json({ error: "slow_down" }, { status: 400 });
					}
				}

				await ctx.context.adapter.update({
					model: TABLE.ciba,
					where: [{ field: "id", value: request.id }],
					update: { lastPolledAt: now, updatedAt: now },
				});

				return ctx.json(
					{ error: "authorization_pending" },
					{ status: 400 },
				);
			}

			if (request.status === "approved") {
				return ctx.json({
					auth_req_id: request.id,
					status: "approved",
				});
			}

			return ctx.json(
				{ error: "authorization_pending" },
				{ status: 400 },
			);
		},
	);
}
