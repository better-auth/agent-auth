import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE, DEFAULTS } from "../../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import type {
	CibaAuthRequest,
	HostSession,
	ResolvedAgentAuthOptions,
} from "../../types";

export function cibaAuthorize(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/ciba/authorize",
		{
			method: "POST",
			body: z.object({
				loginHint: z.string().min(1).meta({
					description:
						"User identifier (email) to send the authentication request to.",
				}),
				capabilityIds: z.array(z.string()).optional().meta({
					description: "Capability IDs the client is requesting.",
				}),
				bindingMessage: z.string().optional().meta({
					description:
						"Human-readable message displayed to the user during approval.",
				}),
				agentId: z.string().optional().meta({
					description: "Agent ID this CIBA request is for.",
				}),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"CIBA Backchannel Authentication Endpoint (§9.2). Creates a pending auth request for the identified user.",
				},
			},
		},
		async (ctx) => {
			if (!opts.approvalMethods.includes("ciba")) {
				throw APIError.from("BAD_REQUEST", ERR.INVALID_REQUEST);
			}

			const hostSession = (ctx.context as { hostSession?: HostSession })
				.hostSession;
			if (!hostSession) {
				throw APIError.from("UNAUTHORIZED", ERR.UNAUTHORIZED);
			}

			const { loginHint, capabilityIds, bindingMessage, agentId } = ctx.body;

			const user =
				await ctx.context.internalAdapter.findUserByEmail(loginHint);
			if (!user) {
				throw APIError.from("NOT_FOUND", ERR.INVALID_REQUEST);
			}

			const now = new Date();
			const expiresAt = new Date(
				now.getTime() + DEFAULTS.cibaExpiresIn * 1000,
			);

			const capabilityIdsStr = capabilityIds
				? capabilityIds.join(" ")
				: null;

			const request = await ctx.context.adapter.create<
				Record<string, unknown>,
				CibaAuthRequest
			>({
				model: TABLE.ciba,
				data: {
					clientId: hostSession.host.id,
					loginHint,
					userId: user.user.id,
					agentId: agentId ?? null,
					capabilityIds: capabilityIdsStr,
					bindingMessage: bindingMessage ?? null,
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

			emit(opts, {
				type: "ciba.authorized",
				actorId: user.user.id,
				hostId: hostSession.host.id,
				targetId: request.id,
				targetType: "cibaAuthRequest",
				metadata: {
					capabilityIds,
					bindingMessage,
					agentId,
				},
			}, ctx);

			return ctx.json({
				auth_req_id: request.id,
				expires_in: DEFAULTS.cibaExpiresIn,
				interval: DEFAULTS.cibaInterval,
			});
		},
	);
}
