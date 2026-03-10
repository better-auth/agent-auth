import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { generateUserCode, hashToken } from "../../utils/approval";
import { resolveDeviceAuthPage } from "../_helpers";
import type {
	Agent,
	ApprovalRequest,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../../types";

/**
 * POST /device/code (RFC 8628 §3.1–3.2).
 *
 * Issues a device code and user code for a pending agent.
 * Auth: Host JWT — the host must own the agent.
 */
export function deviceCode(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/device/code",
		{
			method: "POST",
			body: z.object({
				agent_id: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Device Authorization Request (RFC 8628). Issues a device code for a pending agent.",
				},
			},
		},
		async (ctx) => {
			const hostSession = (ctx.context as Record<string, unknown>)
				.hostSession as HostSession | undefined;

			if (!hostSession) {
				throw APIError.from(
					"UNAUTHORIZED",
					ERR.UNAUTHORIZED_SESSION,
				);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: ctx.body.agent_id }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (agent.hostId !== hostSession.host.id) {
				throw APIError.from("FORBIDDEN", ERR.UNAUTHORIZED);
			}

			if (agent.status !== "pending") {
				if (agent.status === "active") {
					return ctx.json(
						{
							error: "invalid_request",
							error_description:
								"Agent is already active. No approval needed.",
						},
						{ status: 400 },
					);
				}
				if (agent.status === "revoked") {
					throw APIError.from("FORBIDDEN", ERR.AGENT_REVOKED);
				}
				if (agent.status === "rejected") {
					throw APIError.from("FORBIDDEN", ERR.AGENT_REJECTED);
				}
				if (agent.status === "expired") {
					throw APIError.from("FORBIDDEN", ERR.AGENT_EXPIRED);
				}
				throw APIError.from("BAD_REQUEST", ERR.INVALID_REQUEST);
			}

			const expiresIn = 300;
			const interval = 5;
			const userCode = generateUserCode();
			const codeHash = await hashToken(userCode);
			const now = new Date();
			const expiresAt = new Date(now.getTime() + expiresIn * 1000);

			await ctx.context.adapter.create<
				Record<string, unknown>,
				ApprovalRequest
			>({
				model: TABLE.approval,
				data: {
					method: "device_authorization",
					agentId: agent.id,
					hostId: agent.hostId,
					userId: agent.userId,
					capabilities: null,
					status: "pending",
					userCodeHash: codeHash,
					loginHint: null,
					bindingMessage: null,
					clientNotificationToken: null,
					clientNotificationEndpoint: null,
					deliveryMode: null,
					interval,
					lastPolledAt: null,
					expiresAt,
					createdAt: now,
					updatedAt: now,
				},
			});

			const origin = new URL(ctx.context.baseURL).origin;
			const pageBase = resolveDeviceAuthPage(opts, origin);

			return ctx.json({
				device_code: agent.id,
				user_code: userCode,
				verification_uri: pageBase,
				verification_uri_complete: `${pageBase}?agent_id=${agent.id}&code=${userCode}`,
				expires_in: expiresIn,
				interval,
			});
		},
	);
}
