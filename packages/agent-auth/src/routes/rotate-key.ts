import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, ResolvedAgentAuthOptions } from "../types";

const AGENT_TABLE = "agent";

export function rotateKey(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/rotate-key",
		{
			method: "POST",
			body: z.object({
				agentId: z.string(),
				publicKey: z.record(
					z.string(),
					z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
				),
			}),
			metadata: {
				openapi: {
					description:
						"Accept a new public key for an agent. Old key stops working immediately.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { agentId, publicKey } = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "id", value: agentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const kty = publicKey.kty as string;
			const crv = (publicKey.crv as string) ?? null;
			const keyAlg = crv ?? kty;
			if (!opts.allowedKeyAlgorithms.includes(keyAlg)) {
				throw new APIError("BAD_REQUEST", {
					message: `Key algorithm "${keyAlg}" is not allowed. Accepted: ${opts.allowedKeyAlgorithms.join(", ")}`,
				});
			}

			const kid = (publicKey.kid as string) ?? null;

			await ctx.context.adapter.update<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
				update: {
					publicKey: JSON.stringify(publicKey),
					kid,
					updatedAt: new Date(),
				},
			});

			return ctx.json({ success: true });
		},
	);
}
