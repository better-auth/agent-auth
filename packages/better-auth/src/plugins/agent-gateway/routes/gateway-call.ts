import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_GATEWAY_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { callTool } from "../mcp-bridge";
import type { ResolvedGatewayOptions } from "../types";

type AgentSession = {
	agent: { id: string; name: string; scopes: string[] };
	user: { id: string; name: string; email: string };
};

function isScopeAllowed(
	scopes: string[],
	provider: string,
	tool: string,
): boolean {
	for (const s of scopes) {
		if (s === "*") return true;
		if (s === `${provider}.*`) return true;
		if (s === `${provider}.${tool}`) return true;
	}
	return false;
}

/**
 * POST /agent/gateway/call
 *
 * Executes a tool call on behalf of the authenticated agent's user.
 * Enforces scope checks and resolves credentials via the
 * `resolveCredentials` callback.
 *
 * Requires agent JWT auth (provided by the agentAuth plugin).
 */
export function gatewayCall(opts: ResolvedGatewayOptions) {
	return createAuthEndpoint(
		"/agent/gateway/call",
		{
			method: "POST",
			body: z.object({
				tool: z.string().min(1).meta({
					description:
						'Tool to call in provider.tool format (e.g. "github.list_issues")',
				}),
				args: z
					.record(z.string(), z.any())
					.optional()
					.meta({ description: "Arguments for the tool" }),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Call a tool through the gateway on behalf of the agent's user.",
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as Record<string, unknown>)
				.agentSession as AgentSession | undefined;

			if (!agentSession) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { tool, args } = ctx.body;
			const dotIdx = tool.indexOf(".");
			if (dotIdx === -1) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_TOOL_NAME);
			}

			const providerName = tool.slice(0, dotIdx);
			const toolName = tool.slice(dotIdx + 1);

			if (!isScopeAllowed(agentSession.agent.scopes, providerName, toolName)) {
				throw new APIError("FORBIDDEN", {
					message: `Scope denied: agent does not have access to "${tool}". Scopes: ${agentSession.agent.scopes.join(", ") || "none"}`,
				});
			}

			const config = opts.resolvedBridge[providerName];
			if (!config) {
				throw new APIError("NOT_FOUND", {
					message: `Provider "${providerName}" is not configured in the gateway.`,
				});
			}

			const resolve = opts.resolveCredentials ?? defaultResolveCredentials;
			const token = await resolve({
				providerId: providerName,
				userId: agentSession.user.id,
				adapter: ctx.context.adapter,
			});

			if (!token) {
				throw new APIError("NOT_FOUND", {
					message: `No credentials found for provider "${providerName}" for this user.`,
				});
			}

			try {
				const result = await callTool(config, token, toolName, args ?? {});
				return ctx.json(result);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return ctx.json(
					{
						content: [{ type: "text", text: message }],
						isError: true,
					},
					{ status: 502 },
				);
			}
		},
	);
}

async function defaultResolveCredentials(ctx: {
	providerId: string;
	userId: string;
	adapter: unknown;
}): Promise<string | null> {
	const adapter = ctx.adapter as {
		findOne: <T>(opts: {
			model: string;
			where: Array<{ field: string; value: string }>;
		}) => Promise<T | null>;
	};
	const account = await adapter.findOne<{ accessToken: string | null }>({
		model: "account",
		where: [
			{ field: "userId", value: ctx.userId },
			{ field: "providerId", value: ctx.providerId },
		],
	});
	return account?.accessToken ?? null;
}
