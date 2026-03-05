import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getConnectionById } from "@/lib/db/connections";
import { listMCPTools } from "@/lib/mcp-client";
import { getOAuthAdapter } from "@/lib/oauth-adapters";
import { listOpenAPITools } from "@/lib/openapi-tools";

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const conn = await getConnectionById(id);
	if (!conn) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	if (conn.type === "openapi" && conn.specUrl) {
		try {
			const tools = await listOpenAPITools(conn.specUrl);
			return Response.json({
				tools: tools.map((t) => ({
					name: t.name,
					description: t.description,
				})),
			});
		} catch {
			return Response.json({ tools: [] });
		}
	}

	if (conn.mcpEndpoint) {
		try {
			const tools = await listMCPTools(conn.mcpEndpoint);
			return Response.json({ tools });
		} catch {
			return Response.json({ tools: [] });
		}
	}

	if (conn.type === "oauth" && conn.builtinId) {
		const adapter = getOAuthAdapter(conn.builtinId);
		if (adapter) {
			const grantedScopes =
				conn.oauthScopes?.split(/[\s,]+/).filter(Boolean) ?? undefined;
			const tools = adapter.listTools(grantedScopes);
			return Response.json({ tools });
		}
	}

	return Response.json({ tools: [] });
}
