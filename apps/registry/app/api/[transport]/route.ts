import { verifyAccessToken } from "better-auth/oauth2";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getToolsForUser, jsonSchemaToZod } from "@/lib/mcp";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:4200";

function unauthorizedResponse(req: Request) {
	const origin = new URL(req.url).origin;
	return new Response(JSON.stringify({ error: "unauthorized" }), {
		status: 401,
		headers: {
			"Content-Type": "application/json",
			"WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
		},
	});
}

function createHandlerForUser(userId: string) {
	const tools = getToolsForUser(userId);
	return createMcpHandler(
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
		{ serverInfo: { name: "agent-auth-mcp", version: "1.0.0" } },
		{ basePath: "/api", maxDuration: 60 },
	);
}

async function handler(req: Request) {
	const authorization = req.headers.get("authorization");
	const token = authorization?.startsWith("Bearer ")
		? authorization.slice(7)
		: null;

	if (!token) return unauthorizedResponse(req);

	try {
		const payload = await verifyAccessToken(token, {
			jwksUrl: `${BASE_URL}/api/auth/jwks`,
			verifyOptions: {
				audience: `${BASE_URL}/api`,
				issuer: `${BASE_URL}/api/auth`,
			},
		});
		const userId = payload.sub;
		if (!userId) return unauthorizedResponse(req);
		return createHandlerForUser(userId)(req);
	} catch {
		return unauthorizedResponse(req);
	}
}

export { handler as GET, handler as POST, handler as DELETE };
