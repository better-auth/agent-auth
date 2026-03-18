import { createHash } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getToolsForUser, jsonSchemaToZod } from "@/lib/mcp";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:4200";
const JWKS = createRemoteJWKSet(new URL(`${BASE_URL}/api/auth/jwks`));

async function verifyJwt(token: string): Promise<{ userId: string } | null> {
	try {
		const { payload } = await jwtVerify(token, JWKS, {
			issuer: `${BASE_URL}/api/auth`,
		});
		if (payload.aud) {
			const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
			const valid = new Set([BASE_URL, `${BASE_URL}/`]);
			if (!auds.some((a) => valid.has(a))) return null;
		}
		return payload.sub ? { userId: payload.sub } : null;
	} catch {
		return null;
	}
}

async function verifyOpaque(token: string): Promise<{ userId: string } | null> {
	const hashed = createHash("sha256").update(token).digest("base64url");
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

async function verifyToken(token: string): Promise<{ userId: string } | null> {
	const jwt = await verifyJwt(token);
	if (jwt) return jwt;
	return verifyOpaque(token);
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

	const verified = await verifyToken(token);
	if (!verified) return unauthorizedResponse(req);

	return createHandlerForUser(verified.userId)(req);
}

export { handler as GET, handler as POST, handler as DELETE };
