import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getConnectionById } from "@/lib/db/connections";
import { listMCPTools } from "@/lib/mcp-client";

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

	if (!conn.mcpEndpoint) {
		return Response.json({ tools: [] });
	}

	try {
		const tools = await listMCPTools(conn.mcpEndpoint);
		return Response.json({ tools });
	} catch {
		return Response.json({ tools: [] });
	}
}
