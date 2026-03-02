import { createAuthEndpoint } from "@better-auth/core/api";
import { decodeJwt } from "jose";
import * as z from "zod";
import type { AgentJWK } from "../crypto";
import { verifyAgentJWT } from "../crypto";
import type { JtiReplayCache } from "../jti-cache";
import type {
	Agent,
	AgentPermission,
	ResolvedAgentAuthOptions,
} from "../types";

const AGENT_TABLE = "agent";
const PERMISSION_TABLE = "agentPermission";

/**
 * POST /agent/introspect
 *
 * Token introspection endpoint (§2.12). Validates an agent JWT and
 * returns the agent's current status and scopes. Enables resource servers
 * to verify agent JWTs without direct database access.
 *
 * Inspired by RFC 7662 (OAuth 2.0 Token Introspection).
 */
export function introspect(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return createAuthEndpoint(
		"/agent/introspect",
		{
			method: "POST",
			body: z.object({
				token: z.string().meta({ description: "The agent JWT to validate" }),
			}),
			metadata: {
				openapi: {
					description:
						"Validates an agent JWT and returns the agent's status and scopes (§2.12).",
				},
			},
		},
		async (ctx) => {
			const { token } = ctx.body;
			const inactive = { active: false };

			let agentId: string;
			try {
				const decoded = decodeJwt(token);
				if (!decoded.sub) return ctx.json(inactive);
				agentId = decoded.sub;
			} catch {
				return ctx.json(inactive);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) return ctx.json(inactive);

			if (agent.status !== "active") return ctx.json(inactive);

			if (!agent.publicKey) return ctx.json(inactive);

			let publicKey: AgentJWK;
			try {
				publicKey = JSON.parse(agent.publicKey);
			} catch {
				return ctx.json(inactive);
			}

			const payload = await verifyAgentJWT({
				jwt: token,
				publicKey,
				maxAge: opts.jwtMaxAge,
			});

			if (!payload) return ctx.json(inactive);

			if (jtiCache && payload.jti) {
				if (jtiCache.has(payload.jti)) {
					return ctx.json(inactive);
				}
			}

			if (agent.expiresAt && new Date(agent.expiresAt) <= new Date()) {
				return ctx.json(inactive);
			}

			const permissions = await ctx.context.adapter.findMany<AgentPermission>({
				model: PERMISSION_TABLE,
				where: [{ field: "agentId", value: agent.id }],
			});

			let scopes = permissions
				.filter(
					(p) =>
						p.status === "active" &&
						(!p.expiresAt || new Date(p.expiresAt) > new Date()),
				)
				.map((p) => p.scope);

			if (payload.scopes && Array.isArray(payload.scopes)) {
				const jwtScopes = new Set(payload.scopes as string[]);
				scopes = scopes.filter((s) => jwtScopes.has(s));
			}

			return ctx.json({
				active: true,
				agent_id: agent.id,
				host_id: agent.hostId,
				user_id: agent.userId || null,
				scopes,
				mode: agent.mode,
				expires_at: agent.expiresAt
					? new Date(agent.expiresAt).toISOString()
					: null,
			});
		},
	);
}
