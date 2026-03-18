import { mcpHandler } from "@better-auth/oauth-provider";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getToolsForUser, jsonSchemaToZod } from "@/lib/mcp";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:4200";

type McpRequestHandler = (req: Request) => Response | Promise<Response>;
const userHandlers = new Map<string, McpRequestHandler>();

function getOrCreateHandler(userId: string): McpRequestHandler {
	const cached = userHandlers.get(userId);
	if (cached) return cached;

	const tools = getToolsForUser(userId);

	const mcpReqHandler = createMcpHandler(
		(server) => {
			for (const tool of tools) {
				const zodShape = jsonSchemaToZod(tool.parameters, z);
				const toolOpts: {
					description: string;
					inputSchema?: z.ZodRawShape;
				} = {
					description: tool.description,
				};
				if (zodShape) {
					toolOpts.inputSchema = zodShape;
				}

				server.registerTool(
					tool.name,
					toolOpts,
					async (
						args: Record<string, unknown>,
						extra?: { signal?: AbortSignal },
					) => {
						const result = await tool.execute(args, {
							signal: extra?.signal,
						});
						return {
							content: [
								{
									type: "text" as const,
									text: JSON.stringify(result, null, 2),
								},
							],
						};
					},
				);
			}
		},
		{
			serverInfo: {
				name: "agent-auth-mcp",
				version: "1.0.0",
			},
		},
		{
			basePath: "/api",
			maxDuration: 60,
		},
	);

	userHandlers.set(userId, mcpReqHandler);
	return mcpReqHandler;
}

const handler = mcpHandler(
	{
		jwksUrl: `${BASE_URL}/api/auth/jwks`,
		verifyOptions: {
			audience: `${BASE_URL}/api`,
			issuer: `${BASE_URL}/api/auth`,
		},
	},
	async (req, jwt) => {
		const userId = jwt.sub;
		if (!userId) {
			return new Response(JSON.stringify({ error: "missing sub claim" }), {
				status: 401,
			});
		}
		return getOrCreateHandler(userId)(req);
	},
);

export { handler as GET, handler as POST, handler as DELETE };
