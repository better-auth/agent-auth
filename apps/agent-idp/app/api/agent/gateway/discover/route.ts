import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { connection } from "@/lib/db/schema";
import { listMCPTools } from "@/lib/mcp-client";
import { resolveAuth } from "@/lib/resolve-auth";

/**
 * GET /api/agent/gateway/discover
 *
 * Returns the providers (connections) available to the authenticated user.
 * Auth: agent JWT or user session.
 *
 * This replaces the old orgId-based approach — user identity is resolved
 * from the trusted host (via agent session's user) or session cookie.
 */
export async function GET(request: Request) {
	const resolved = await resolveAuth(request);

	if (!resolved) {
		return Response.json({ error: "Authentication required" }, { status: 401 });
	}

	const { orgId } = resolved;

	const connections = await db
		.select()
		.from(connection)
		.where(and(eq(connection.orgId, orgId), eq(connection.status, "active")));

	const result: Array<{
		name: string;
		displayName: string;
		type: string;
		tools: Array<{ name: string; description: string }>;
	}> = [];

	for (const conn of connections) {
		if (conn.type === "mcp" && conn.mcpEndpoint) {
			try {
				const tools = await listMCPTools(conn.mcpEndpoint);
				result.push({
					name: conn.name,
					displayName: conn.displayName,
					type: conn.type,
					tools: tools.map((t) => ({
						name: t.name,
						description: t.description,
					})),
				});
			} catch {
				result.push({
					name: conn.name,
					displayName: conn.displayName,
					type: conn.type,
					tools: [],
				});
			}
		} else {
			result.push({
				name: conn.name,
				displayName: conn.displayName,
				type: conn.type,
				tools: [],
			});
		}
	}

	return Response.json({ providers: result });
}
