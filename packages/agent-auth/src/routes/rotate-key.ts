import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import type { Agent, HostSession, ResolvedAgentAuthOptions } from "../types";
import { validateKeyAlgorithm } from "./_helpers";

/**
 * POST /agent/rotate-key (§6.8)
 *
 * Replaces an agent's public key. The old key stops working immediately.
 * Auth: Host JWT — the server MUST verify the agent is registered under this host.
 */
export function rotateKey(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/rotate-key",
		{
			method: "POST",
			body: z.object({
				agent_id: z.string().min(1),
				public_key: z.record(z.string(), z.unknown()),
			}),
			metadata: {
				openapi: {
					description:
						"Rotate an agent's public key via host JWT (§6.8).",
				},
			},
		},
		async (ctx) => {
			const hostSession = (
				ctx.context as { hostSession?: HostSession }
			).hostSession;

			if (!hostSession) {
				throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
			}

			const { agent_id: agentId, public_key: publicKey } = ctx.body;

			validateKeyAlgorithm(publicKey, opts.allowedKeyAlgorithms);

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (agent.hostId !== hostSession.host.id) {
				throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
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
				actorType: "system",
				actorId: hostSession.host.userId ?? undefined,
				hostId: hostSession.host.id,
			}, ctx);

			return ctx.json({
				agent_id: agentId,
				status: "active" as const,
			});
		},
	);
}
