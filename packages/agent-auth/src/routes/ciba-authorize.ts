import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { emit } from "../emit";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { CibaAuthRequest, ResolvedAgentAuthOptions } from "../types";

const CIBA_TABLE = "cibaAuthRequest";
const DEFAULT_INTERVAL = 5;
const DEFAULT_EXPIRES_IN = 300;

/**
 * POST /agent/ciba/authorize
 *
 * Backchannel Authentication Endpoint (OpenID Connect CIBA Core 1.0).
 * The client sends a login_hint to identify the user, and the server
 * creates a pending auth request that the user can approve in-dashboard.
 */
export function cibaAuthorize(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/ciba/authorize",
		{
			method: "POST",
			body: z.object({
				login_hint: z.string().min(1).meta({
					description:
						"User identifier (email) to send the authentication request to.",
				}),
				scope: z.string().optional().meta({
					description: "Space-separated scopes the client is requesting.",
				}),
				binding_message: z.string().optional().meta({
					description:
						"Human-readable message displayed to the user during approval.",
				}),
				client_id: z.string().optional().meta({
					description: "Client identifier.",
				}),
				client_notification_token: z.string().optional().meta({
					description:
						"Bearer token the server uses when calling the client notification endpoint (ping/push).",
				}),
				client_notification_endpoint: z.string().url().optional().meta({
					description: "URL the server POSTs to for ping/push delivery modes.",
				}),
				backchannel_token_delivery_mode: z
					.enum(["poll", "ping", "push"])
					.optional()
					.meta({
						description: 'Token delivery mode. Default: "poll".',
					}),
				requested_expiry: z.number().positive().optional().meta({
					description: "Requested expiry in seconds for the auth request.",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"CIBA Backchannel Authentication Endpoint. Creates a pending auth request for the identified user.",
				},
			},
		},
		async (ctx) => {
			if (!opts.approvalMethods.includes("ciba")) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.CIBA_NOT_ENABLED);
			}

			const {
				login_hint,
				scope,
				binding_message,
				client_id,
				client_notification_token,
				client_notification_endpoint,
				backchannel_token_delivery_mode,
				requested_expiry,
			} = ctx.body;

			const deliveryMode = backchannel_token_delivery_mode ?? "poll";

			if (
				(deliveryMode === "ping" || deliveryMode === "push") &&
				!client_notification_endpoint
			) {
				throw APIError.from(
					"BAD_REQUEST",
					ERROR_CODES.CIBA_MISSING_NOTIFICATION_ENDPOINT,
				);
			}

			const user =
				await ctx.context.internalAdapter.findUserByEmail(login_hint);
			if (!user) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.CIBA_USER_NOT_FOUND);
			}

			const now = new Date();
			const expiresIn = requested_expiry ?? DEFAULT_EXPIRES_IN;
			const expiresAt = new Date(now.getTime() + expiresIn * 1000);

			const request = await ctx.context.adapter.create<
				Record<string, string | number | Date | null>,
				CibaAuthRequest
			>({
				model: CIBA_TABLE,
				data: {
					clientId: client_id ?? "agent-auth",
					loginHint: login_hint,
					userId: user.user.id,
					scope: scope ?? null,
					bindingMessage: binding_message ?? null,
					clientNotificationToken: client_notification_token ?? null,
					clientNotificationEndpoint: client_notification_endpoint ?? null,
					deliveryMode,
					status: "pending",
					interval: DEFAULT_INTERVAL,
					lastPolledAt: null,
					expiresAt,
					createdAt: now,
					updatedAt: now,
				},
			});

			emit(opts, {
				type: "ciba.authorized",
				actorId: user.user.id,
				targetId: request.id,
				targetType: "cibaAuthRequest",
				metadata: { scope, bindingMessage: binding_message, deliveryMode },
			});

			return ctx.json({
				auth_req_id: request.id,
				expires_in: expiresIn,
				interval: DEFAULT_INTERVAL,
			});
		},
	);
}
