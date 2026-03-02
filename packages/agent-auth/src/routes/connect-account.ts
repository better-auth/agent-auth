import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, AgentHost, AgentSession } from "../types";

const AGENT_TABLE = "agent";
const HOST_TABLE = "agentHost";

function generateUserCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		if (i === 4) code += "-";
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}

/**
 * POST /agent/connect-account
 *
 * Links an autonomous agent (or its host) to a user account (§2.5).
 * Used when an agent registered autonomously and later needs user association.
 *
 * The link operates on the host, not the individual agent. The approving
 * user becomes the owner of the host, and all agents under it become
 * visible to that user.
 *
 * This endpoint always returns a pending status with an approval URL.
 * The actual linking happens when the user visits the approval URL and
 * explicitly approves the connection. Direct auto-linking is not allowed
 * per §2.5 — the user must consent.
 */
export function connectAccount() {
	return createAuthEndpoint(
		"/agent/connect-account",
		{
			method: "POST",
			body: z.object({
				identifier: z.string().optional().meta({
					description:
						"User identifier (email, phone) for CIBA-style notification",
				}),
				method: z.string().optional().meta({
					description: "Preferred approval method. If omitted, server chooses.",
				}),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Links an autonomous agent's host to a user account (§2.5). Always requires user approval.",
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as Record<string, unknown>)
				.agentSession as AgentSession | undefined;

			if (!agentSession) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentSession.agent.id }],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			if (!agent.hostId) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.HOST_NOT_FOUND);
			}

			const host = await ctx.context.adapter.findOne<AgentHost>({
				model: HOST_TABLE,
				where: [{ field: "id", value: agent.hostId }],
			});

			if (!host) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.HOST_NOT_FOUND);
			}

			if (host.status === "revoked") {
				throw APIError.from("FORBIDDEN", ERROR_CODES.HOST_REVOKED);
			}

			if (host.userId) {
				throw APIError.from("CONFLICT", ERROR_CODES.HOST_ALREADY_LINKED);
			}

			const origin = new URL(ctx.context.baseURL).origin;
			const { identifier } = ctx.body;
			const userCode = generateUserCode();

			return ctx.json({
				agent_id: agent.id,
				host_id: host.id,
				status: "pending",
				approval: {
					method: "device_authorization",
					verification_uri: `${origin}/device/connect`,
					verification_uri_complete: `${origin}/device/connect?host_id=${host.id}&code=${userCode}${identifier ? `&hint=${encodeURIComponent(identifier)}` : ""}`,
					user_code: userCode,
					device_code: host.id,
					expires_in: 600,
					interval: 5,
				},
			});
		},
	);
}
