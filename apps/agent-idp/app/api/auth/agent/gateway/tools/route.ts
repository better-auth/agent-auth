import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { connection } from "@/lib/db/schema";
import { listMCPTools } from "@/lib/mcp-client";
import { listOpenAPITools } from "@/lib/openapi-tools";
import { resolveAuth } from "@/lib/resolve-auth";

/**
 * GET /api/auth/agent/gateway/tools
 *
 * Returns tools grouped by provider for the authenticated user's connections.
 * Auth: agent JWT or user session.
 */
export async function GET(request: Request) {
	const resolved = await resolveAuth(request);

	if (!resolved) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { orgId } = resolved;

	const connections = await db
		.select()
		.from(connection)
		.where(and(eq(connection.orgId, orgId), eq(connection.status, "active")));

	const OAUTH_TOOLS: Record<
		string,
		Array<{ name: string; description: string }>
	> = {
		github: [
			{
				name: "list_repos",
				description: "List repositories for the authenticated user",
			},
			{
				name: "get_repo",
				description: "Get details of a specific repository",
			},
			{ name: "list_issues", description: "List issues in a repository" },
			{
				name: "create_issue",
				description: "Create a new issue in a repository",
			},
			{
				name: "list_pull_requests",
				description: "List pull requests in a repository",
			},
			{
				name: "create_pull_request",
				description: "Create a new pull request",
			},
			{
				name: "get_file_contents",
				description: "Get contents of a file in a repository",
			},
			{
				name: "search_code",
				description: "Search for code across repositories",
			},
			{
				name: "list_branches",
				description: "List branches in a repository",
			},
			{
				name: "list_commits",
				description: "List commits in a repository",
			},
		],
		google: [
			{
				name: "list_messages",
				description: "List email messages in the inbox",
			},
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

	const result: Array<{
		name: string;
		tools: Array<{
			name: string;
			description: string;
			inputSchema?: Record<string, unknown>;
		}>;
	}> = [];

	for (const conn of connections) {
		if (conn.type === "oauth" && conn.builtinId) {
			const tools = OAUTH_TOOLS[conn.builtinId] ?? [];
			result.push({
				name: conn.name,
				tools: tools.map((t) => ({
					name: t.name,
					description: t.description,
				})),
			});
			continue;
		}

		if (conn.type === "openapi" && conn.specUrl) {
			try {
				const tools = await listOpenAPITools(conn.specUrl);
				result.push({
					name: conn.name,
					tools: tools.map((t) => ({
						name: t.name,
						description: t.description,
						inputSchema: t.inputSchema,
					})),
				});
			} catch {
				result.push({ name: conn.name, tools: [] });
			}
			continue;
		}

		if (!conn.mcpEndpoint) {
			result.push({ name: conn.name, tools: [] });
			continue;
		}

		try {
			const tools = await listMCPTools(conn.mcpEndpoint);
			result.push({
				name: conn.name,
				tools: tools.map((t) => ({
					name: t.name,
					description: t.description,
					inputSchema: t.inputSchema,
				})),
			});
		} catch {
			result.push({ name: conn.name, tools: [] });
		}
	}

	return Response.json({ providers: result });
}
