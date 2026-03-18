import { createHash } from "crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getToolsForUser, jsonSchemaToZod } from "@/lib/mcp";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:4200";

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

function unauthorizedResponse() {
	return new Response(JSON.stringify({ error: "unauthorized" }), {
		status: 401,
		headers: {
			"Content-Type": "application/json",
			"WWW-Authenticate": `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`,
		},
	});
}

async function handler(req: Request) {
	const authorization = req.headers.get("authorization");
	const token = authorization?.startsWith("Bearer ")
		? authorization.slice(7)
		: null;

	if (!token) return unauthorizedResponse();

	const verified = await verifyOpaqueToken(token);
	if (!verified) return unauthorizedResponse();

	const { userId } = verified;
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
	)(req);
}

export { handler as GET, handler as POST, handler as DELETE };
