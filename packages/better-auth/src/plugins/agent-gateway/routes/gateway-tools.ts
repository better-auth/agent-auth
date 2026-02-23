import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { AGENT_GATEWAY_ERROR_CODES as ERROR_CODES } from "../error-codes";
import { discoverTools } from "../mcp-bridge";
import type { ResolvedGatewayOptions } from "../types";

type AgentSession = {
	agent: { id: string; name: string; scopes: string[] };
	user: { id: string; name: string; email: string };
};

/**
 * GET /agent/gateway/tools
 *
 * Returns all tools available to the calling agent's user.
 * For each configured provider, resolves credentials via the
 * `resolveCredentials` callback and discovers tools.
 *
 * Requires agent JWT auth (provided by the agentAuth plugin).
 */
export function gatewayTools(opts: ResolvedGatewayOptions) {
	return createAuthEndpoint(
		"/agent/gateway/tools",
		{
			method: "GET",
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Discover available tools for the authenticated agent's user.",
				},
			},
		},
		async (ctx) => {
			const agentSession = (ctx.context as Record<string, unknown>)
				.agentSession as AgentSession | undefined;

			if (!agentSession) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const bridge = opts.resolvedBridge;
			const resolve = opts.resolveCredentials ?? defaultResolveCredentials;
			const providers: Array<{
				name: string;
				tools: Array<{
					name: string;
					description: string;
					inputSchema?: Record<string, unknown>;
				}>;
			}> = [];

			for (const [providerName, config] of Object.entries(bridge)) {
				const token = await resolve({
					providerId: providerName,
					userId: agentSession.user.id,
					adapter: ctx.context.adapter,
				});
				if (!token) continue;

				try {
					const rawTools = await discoverTools(config, token, providerName);
					providers.push({
						name: providerName,
						tools: rawTools.map((t) => ({
							name: `${providerName}.${t.name}`,
							description: `[${providerName}] ${t.description}`,
							inputSchema: t.inputSchema,
						})),
					});
				} catch {
					// Skip providers that fail to discover tools
				}
			}

			return ctx.json({ providers });
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
