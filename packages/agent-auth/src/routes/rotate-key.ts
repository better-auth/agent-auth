import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import type { Agent, AgentSession, ResolvedAgentAuthOptions } from "../types";
import { validateKeyAlgorithm } from "./_helpers";

/**
 * POST /agent/rotate-key (§6.7)
 *
 * Rotate an agent's public key. Auth: Agent JWT (via agentSession on ctx.context).
 * The old key stops working immediately after rotation.
 */
export function rotateKey(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/rotate-key",
		{
			method: "POST",
			body: z.object({
				public_key: z.record(z.string(), z.unknown()),
			}),
			metadata: {
				openapi: {
					description:
						"Rotate an agent's public key via agent JWT (§6.7).",
				},
			},
		},
		async (ctx) => {
			const agentSession = (
				ctx.context as { agentSession?: AgentSession }
			).agentSession;

			if (!agentSession) {
				throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
			}

			const agentId = agentSession.agent.id;
			const { public_key: publicKey } = ctx.body;

			validateKeyAlgorithm(publicKey, opts.allowedKeyAlgorithms);

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			const kid =
				typeof publicKey.kid === "string" ? publicKey.kid : null;

			await ctx.context.adapter.update({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
				update: {
					publicKey: JSON.stringify(publicKey),
					kid,
					updatedAt: new Date(),
				},
			});

			emit(opts, {
				type: "agent.key_rotated",
				agentId,
				actorType: "agent",
			}, ctx);

			return ctx.json({
				agent_id: agentId,
				status: "active" as const,
			});
		},
	);
}
