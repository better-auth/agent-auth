import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import type {
	AgentCapabilityGrant,
	AgentSession,
	ResolvedAgentAuthOptions,
} from "../types";

/**
 * POST /capabilities/execute (§6.11).
 *
 * Executes a granted capability on behalf of the agent.
 * Validates the agent JWT, checks that the agent has an active grant
 * for the requested capability, calls the onExecute handler,
 * and returns the result.
 */
export function executeCapability(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/capability/execute",
		{
			method: "POST",
			body: z.object({
				capability: z.string(),
				arguments: z.record(z.string(), z.unknown()).optional(),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Execute a granted capability on behalf of the agent (§6.11).",
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as Record<string, unknown>)
				.agentSession as AgentSession | undefined;

			if (!agentSession) {
				throw APIError.from(
					"UNAUTHORIZED",
					ERR.UNAUTHORIZED_SESSION,
				);
			}

			const { capability: capabilityName, arguments: args } = ctx.body;

			const allCapabilities = opts.capabilities ?? [];
			const capabilityDef = allCapabilities.find(
				(c) => c.name === capabilityName,
			);
			if (!capabilityDef) {
				throw new APIError("NOT_FOUND", {
					body: {
						code: ERR.CAPABILITY_NOT_FOUND.code,
						message: `Capability "${capabilityName}" does not exist.`,
					},
				});
			}

			const grants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [
						{ field: "agentId", value: agentSession.agent.id },
						{ field: "capability", value: capabilityName },
					],
				});

			const now = new Date();
			const activeGrant = grants.find(
				(g) =>
					g.status === "active" &&
					(!g.expiresAt || new Date(g.expiresAt) > now),
			);

			if (!activeGrant) {
				throw new APIError("FORBIDDEN", {
					body: {
						code: ERR.CAPABILITY_NOT_GRANTED.code,
						message: `Agent does not have an active grant for capability "${capabilityName}".`,
					},
				});
			}

			if (!opts.onExecute) {
				throw new APIError("NOT_IMPLEMENTED" as any, {
					body: {
						code: ERR.EXECUTE_NOT_CONFIGURED.code,
						message:
							"The server has not configured a capability execution handler.",
					},
					status: 501,
				});
			}

			const startTime = Date.now();
			let result: unknown;
			let execError: string | undefined;

			try {
				result = await opts.onExecute({
					ctx,
					capability: capabilityName,
					capabilityDef,
					arguments: args,
					agentSession,
				});
			} catch (err) {
				execError =
					err instanceof Error ? err.message : String(err);
				const durationMs = Date.now() - startTime;

			emit(
				opts,
				{
					type: "capability.executed",
					capability: capabilityName,
					agentId: agentSession.agent.id,
					hostId: agentSession.agent.hostId,
					userId: agentSession.host?.userId ?? undefined,
					agentName: agentSession.agent.name,
					arguments: args,
					status: "error",
					error: execError,
					durationMs,
				},
				ctx,
			);

				if (err instanceof APIError) throw err;
				throw new APIError("INTERNAL_SERVER_ERROR", {
					body: {
						code: ERR.INTERNAL_ERROR.code,
						message: execError,
					},
				});
			}

			const durationMs = Date.now() - startTime;

			emit(
				opts,
				{
					type: "capability.executed",
					capability: capabilityName,
					agentId: agentSession.agent.id,
					hostId: agentSession.agent.hostId,
					userId: agentSession.host?.userId ?? undefined,
					agentName: agentSession.agent.name,
					arguments: args,
					output: result,
					status: "success",
					durationMs,
				},
				ctx,
			);

			return ctx.json({ data: result });
		},
	);
}
