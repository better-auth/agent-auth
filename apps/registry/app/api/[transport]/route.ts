import { createHash } from "crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getToolsForUser, jsonSchemaToZod } from "@/lib/mcp";

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("base64url");
}

async function verifyOpaqueToken(
	token: string,
): Promise<{ userId: string } | null> {
	const hashed = hashToken(token);
	const rows = await sql`
		SELECT "user_id", "expires_at"
		FROM "oauth_access_token"
		WHERE "token" = ${hashed}
		LIMIT 1
	`;
	const row = rows[0];
	if (!row) return null;
	if (row.expires_at && new Date(row.expires_at as string) < new Date())
		return null;
	if (!row.user_id) return null;
	return { userId: row.user_id as string };
}

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

type McpRequestHandler = (req: Request) => Response | Promise<Response>;
const userHandlers = new Map<string, McpRequestHandler>();

function getOrCreateHandler(userId: string): McpRequestHandler {
	const cached = userHandlers.get(userId);
	if (cached) return cached;

	const tools = getToolsForUser(userId);

	const mcpHandler = createMcpHandler(
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
			verboseLogs: true,
		},
	);

	userHandlers.set(userId, mcpHandler);
	return mcpHandler;
}

async function handler(req: Request) {
	try {
		const authorization = req.headers.get("authorization");
		const token = authorization?.startsWith("Bearer ")
			? authorization.slice(7)
			: null;

		if (!token) return unauthorizedResponse(req);

		const verified = await verifyOpaqueToken(token);
		if (!verified) {
			console.error("[mcp] token verification failed");
			return unauthorizedResponse(req);
		}

		console.log("[mcp] authenticated user:", verified.userId, "method:", req.method);
		const { userId } = verified;
		const result = await getOrCreateHandler(userId)(req);
		console.log("[mcp] handler response status:", result.status);
		return result;
	} catch (err) {
		console.error("[mcp] unhandled error:", err);
		return new Response(
			JSON.stringify({ error: "internal_error", message: String(err) }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
}

export { handler as GET, handler as POST, handler as DELETE };
