import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { connection } from "@/lib/db/schema";
import { rankByIntent } from "@/lib/intent-search";
import { listMCPTools } from "@/lib/mcp-client";
import { listOpenAPITools } from "@/lib/openapi-tools";
import { resolveAuth } from "@/lib/resolve-auth";

/**
 * GET /api/auth/agent/capabilities
 *
 * Returns capabilities dynamically from the connection table.
 *
 * Auth modes (per §2.3):
 * - No auth → empty (connections require user context)
 * - Agent JWT → capabilities with grant_status
 * - Host JWT → capabilities for host's linked user
 * - User session → capabilities (for dashboard)
 *
 * Query params:
 * - intent: natural language intent for semantic filtering (§2.3)
 * - limit: max results (default 100)
 * - cursor: pagination offset
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const intent = url.searchParams.get("intent") ?? undefined;
	const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
	const cursor = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);

	const resolved = await resolveAuth(request);
	if (!resolved) {
		return Response.json({ capabilities: [], has_more: false });
	}

	const { orgId, agentSession } = resolved;

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

	const allCapabilities: Array<{
		name: string;
		description: string;
		type: string;
		input_schema?: Record<string, unknown>;
		provider: string;
	}> = [];

	for (const conn of connections) {
		if (conn.type === "oauth" && conn.builtinId) {
			const tools = OAUTH_TOOLS[conn.builtinId] ?? [];
			for (const t of tools) {
				allCapabilities.push({
					name: `${conn.name}.${t.name}`,
					description: t.description,
					type: "http",
					provider: conn.name,
				});
			}
			continue;
		}

		if (conn.type === "openapi" && conn.specUrl) {
			try {
				const tools = await listOpenAPITools(conn.specUrl);
				for (const t of tools) {
					allCapabilities.push({
						name: `${conn.name}.${t.name}`,
						description: t.description,
						type: "http",
						input_schema: t.inputSchema,
						provider: conn.name,
					});
				}
			} catch {
				// Skip failed connections
			}
			continue;
		}

		if (conn.mcpEndpoint) {
			try {
				const tools = await listMCPTools(conn.mcpEndpoint);
				for (const t of tools) {
					allCapabilities.push({
						name: `${conn.name}.${t.name}`,
						description: t.description,
						type: "mcp",
						input_schema: t.inputSchema,
						provider: conn.name,
					});
				}
			} catch {
				// Skip failed connections
			}
		}
	}

	let filtered = allCapabilities;
	if (intent) {
		filtered = await rankByIntent(allCapabilities, intent);
	}

	const page = filtered.slice(cursor, cursor + limit);
	const hasMore = cursor + limit < filtered.length;

	let grantedScopes: Set<string> | null = null;
	if (agentSession) {
		grantedScopes = new Set(
			agentSession.agent.permissions
				.filter((p) => p.status === "active")
				.map((p) => p.scope),
		);
	}

	const capabilities = page.map((c) => {
		const base: Record<string, unknown> = {
			name: c.name,
			description: c.description,
			type: c.type,
			input_schema: c.input_schema,
		};

		if (grantedScopes) {
			const granted =
				grantedScopes.has(c.name) ||
				grantedScopes.has(`${c.provider}.*`) ||
				grantedScopes.has("*");
			base.grant_status = granted ? "granted" : "not_granted";
		}

		return base;
	});

	return Response.json({
		capabilities,
		has_more: hasMore,
		...(hasMore ? { next_cursor: String(cursor + limit) } : {}),
	});
}
