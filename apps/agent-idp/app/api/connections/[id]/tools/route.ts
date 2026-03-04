import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getConnectionById } from "@/lib/db/connections";
import { listMCPTools } from "@/lib/mcp-client";
import { listOpenAPITools } from "@/lib/openapi-tools";

type ToolDef = { name: string; description: string };

const OAUTH_TOOLS: Record<string, ToolDef[]> = {
	github: [
		{
			name: "list_repos",
			description: "List repositories for the authenticated user",
		},
		{ name: "get_repo", description: "Get details of a specific repository" },
		{ name: "list_issues", description: "List issues in a repository" },
		{ name: "create_issue", description: "Create a new issue in a repository" },
		{
			name: "list_pull_requests",
			description: "List pull requests in a repository",
		},
		{ name: "create_pull_request", description: "Create a new pull request" },
		{
			name: "get_file_contents",
			description: "Get contents of a file in a repository",
		},
		{ name: "search_code", description: "Search for code across repositories" },
		{ name: "list_branches", description: "List branches in a repository" },
		{ name: "list_commits", description: "List commits in a repository" },
	],
	google: [
		{ name: "list_messages", description: "List email messages in the inbox" },
		{
			name: "get_message",
			description: "Get the full content of an email message",
		},
		{ name: "send_email", description: "Send a new email message" },
		{ name: "search_emails", description: "Search emails with a query" },
		{ name: "list_labels", description: "List all email labels" },
		{
			name: "modify_labels",
			description: "Add or remove labels from a message",
		},
		{ name: "create_draft", description: "Create a new email draft" },
		{ name: "list_threads", description: "List email threads" },
	],
};

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

	// OAuth: return static tool definitions for known providers
	if (conn.type === "oauth" && conn.builtinId) {
		const tools = OAUTH_TOOLS[conn.builtinId] ?? [];
		return Response.json({ tools });
	}

	// OpenAPI: discover tools from spec
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

	// MCP: discover tools from endpoint
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
