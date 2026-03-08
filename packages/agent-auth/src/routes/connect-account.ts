import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE, DEFAULTS } from "../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import type {
	Agent,
	AgentHost,
	CibaAuthRequest,
	HostSession,
} from "../types";

/**
 * POST /agent/connect-account
 *
 * Create a CIBA request for account linking. Auth: Host JWT (via hostSession on ctx.context).
 * Verify agent belongs to this host.
 */
export function connectAccount() {
	return createAuthEndpoint(
		"/agent/connect-account",
		{
			method: "POST",
			body: z.object({
				agent_id: z.string(),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Creates a CIBA request for account linking (§3.4). Auth: Host JWT.",
				},
			},
		},
		async (ctx) => {
			const hostSession = (
				ctx.context as { hostSession?: HostSession }
			).hostSession;

			if (!hostSession) {
				throw APIError.from("UNAUTHORIZED", ERR.UNAUTHORIZED);
			}

			const { agent_id: agentId } = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (agent.hostId !== hostSession.host.id) {
				throw APIError.from("FORBIDDEN", ERR.UNAUTHORIZED);
			}

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: TABLE.host,
				where: [{ field: "id", value: agent.hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERR.HOST_NOT_FOUND);
			}

			if (host.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERR.HOST_REVOKED);
			}

			if (host.userId) {
				throw APIError.from("CONFLICT", ERR.ACCOUNT_ALREADY_CONNECTED);
			}

			const now = new Date();
			const expiresAt = new Date(
				now.getTime() + DEFAULTS.cibaExpiresIn * 1000,
			);

			const cibaRequest = await ctx.context.adapter.create<
				Record<string, unknown>,
				CibaAuthRequest
			>({
				model: TABLE.ciba,
				data: {
					clientId: host.id,
					loginHint: "connect-account",
					userId: null,
					agentId: agent.id,
					capabilityIds: null,
					bindingMessage: `Host "${host.name ?? host.id}" requesting account link`,
					clientNotificationToken: null,
					clientNotificationEndpoint: null,
					deliveryMode: "poll",
					status: "pending",
					interval: DEFAULTS.cibaInterval,
					lastPolledAt: null,
					expiresAt,
					createdAt: now,
					updatedAt: now,
				},
			});

			return ctx.json({
				auth_req_id: cibaRequest.id,
				expires_in: DEFAULTS.cibaExpiresIn,
				interval: DEFAULTS.cibaInterval,
			});
		},
	);
}
