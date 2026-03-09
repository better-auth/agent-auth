import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../../constants";
import type {
	Agent,
	AgentCapabilityGrant,
	ApprovalRequest,
	ResolvedAgentAuthOptions,
} from "../../types";
import { activeGrants, formatGrantsResponse } from "../_helpers";

const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/**
 * POST /device/token (RFC 8628 §3.4).
 *
 * Token polling endpoint for the device authorization flow.
 * The client polls this with the `device_code` (agent_id) until
 * the user approves, denies, or the code expires.
 */
export function deviceToken(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/device/token",
		{
			method: "POST",
			body: z.object({
				device_code: z.string(),
				grant_type: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Device Access Token Request (RFC 8628 §3.4). Poll for agent approval status.",
				},
			},
		},
		async (ctx) => {
			const { device_code: deviceCode, grant_type: grantType } =
				ctx.body;

			if (grantType !== GRANT_TYPE) {
				return ctx.json(
					{
						error: "unsupported_grant_type",
						error_description: `Expected grant_type "${GRANT_TYPE}".`,
					},
					{ status: 400 },
				);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: deviceCode }],
			});

			if (!agent) {
				return ctx.json(
					{
						error: "invalid_grant",
						error_description:
							"The device_code is invalid or has been removed.",
					},
					{ status: 400 },
				);
			}

			const approvalReqs =
				await ctx.context.adapter.findMany<ApprovalRequest>({
					model: TABLE.approval,
					where: [
						{ field: "agentId", value: agent.id },
						{
							field: "method",
							value: "device_authorization",
						},
					],
				});

			const latestReq = approvalReqs
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() -
						new Date(a.createdAt).getTime(),
				)
				.at(0);

			if (!latestReq) {
				return ctx.json(
					{
						error: "invalid_grant",
						error_description:
							"No device authorization request exists for this agent.",
					},
					{ status: 400 },
				);
			}

			if (new Date(latestReq.expiresAt) <= new Date()) {
				return ctx.json(
					{
						error: "expired_token",
						error_description:
							"The device_code has expired. Call POST /device/code to start a new flow.",
					},
					{ status: 400 },
				);
			}

			// RFC 8628 §3.5: slow_down — enforce polling interval
			const now = new Date();
			if (latestReq.lastPolledAt) {
				const elapsed =
					now.getTime() -
					new Date(latestReq.lastPolledAt).getTime();
				if (elapsed < latestReq.interval * 1000) {
					return ctx.json(
						{
							error: "slow_down",
							error_description:
								"Polling too frequently. Wait at least the interval between requests.",
						},
						{ status: 400 },
					);
				}
			}

			await ctx.context.adapter.update<ApprovalRequest>({
				model: TABLE.approval,
				where: [{ field: "id", value: latestReq.id }],
				update: { lastPolledAt: now },
			});

			if (agent.status === "pending") {
				return ctx.json(
					{
						error: "authorization_pending",
						error_description:
							"The user has not yet completed authorization.",
					},
					{ status: 400 },
				);
			}

			if (
				agent.status === "rejected" ||
				agent.status === "revoked"
			) {
				return ctx.json(
					{
						error: "access_denied",
						error_description:
							"The user denied the authorization request.",
					},
					{ status: 400 },
				);
			}

			if (agent.status === "active") {
				const grants =
					await ctx.context.adapter.findMany<AgentCapabilityGrant>(
						{
							model: TABLE.grant,
							where: [
								{ field: "agentId", value: agent.id },
							],
						},
					);

				return ctx.json({
					agent_id: agent.id,
					host_id: agent.hostId,
					status: agent.status,
					mode: agent.mode,
					agent_capability_grants: formatGrantsResponse(
						activeGrants(grants), opts.capabilities,
					),
					expires_at: agent.expiresAt
						? new Date(agent.expiresAt).toISOString()
						: null,
				});
			}

			return ctx.json(
				{
					error: "authorization_pending",
					error_description:
						"The authorization request is still being processed.",
				},
				{ status: 400 },
			);
		},
	);
}
