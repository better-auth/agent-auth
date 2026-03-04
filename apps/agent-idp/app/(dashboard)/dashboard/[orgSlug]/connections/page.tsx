import { and, eq } from "drizzle-orm";
import {
	listAgentAuthTools,
	parseAgentAuthCredential,
} from "@/lib/agent-auth-proxy";
import { account } from "@/lib/db/better-auth-schema";
import { getCredential, listConnectionsByOrg } from "@/lib/db/connections";
import { db } from "@/lib/db/drizzle";
import { getOrgBySlug, getSession } from "@/lib/db/queries";
import { connectionCredential } from "@/lib/db/schema";
import { listMCPTools } from "@/lib/mcp-client";
import { listOpenAPITools } from "@/lib/openapi-tools";
import { ConnectionsClient } from "./connections-client";

type ToolDef = { name: string; description: string };

const OAUTH_TOOLS: Record<string, ToolDef[]> = {
	github: [
		{
			name: "list_repos",
			description: "List repositories for the authenticated user",
		},
		{ name: "get_repo", description: "Get details of a specific repository" },
		{ name: "list_issues", description: "List issues in a repository" },
		{
			name: "create_issue",
			description: "Create a new issue in a repository",
		},
		{
			name: "list_pull_requests",
			description: "List pull requests in a repository",
		},
		{ name: "create_pull_request", description: "Create a new pull request" },
		{
			name: "get_file_contents",
			description: "Get contents of a file in a repository",
		},
		{
			name: "search_code",
			description: "Search for code across repositories",
		},
		{ name: "list_branches", description: "List branches in a repository" },
		{ name: "list_commits", description: "List commits in a repository" },
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

async function getToolsForConnection(
	conn: {
		id: string;
		type: string;
		builtinId: string | null;
		mcpEndpoint: string | null;
		specUrl: string | null;
		baseUrl: string | null;
	},
	orgId: string,
): Promise<ToolDef[]> {
	if (conn.type === "oauth" && conn.builtinId) {
		return OAUTH_TOOLS[conn.builtinId] ?? [];
	}
	if (conn.type === "mcp" && conn.mcpEndpoint) {
		try {
			return await listMCPTools(conn.mcpEndpoint);
		} catch {
			return [];
		}
	}
	if (conn.type === "openapi" && conn.specUrl) {
		try {
			const tools = await listOpenAPITools(conn.specUrl);
			return tools.map((t) => ({ name: t.name, description: t.description }));
		} catch {
			return [];
		}
	}
	if (conn.type === "agent-auth" && conn.baseUrl) {
		try {
			const [cred] = await db
				.select()
				.from(connectionCredential)
				.where(
					and(
						eq(connectionCredential.connectionId, conn.id),
						eq(connectionCredential.orgId, orgId),
						eq(connectionCredential.status, "active"),
					),
				)
				.limit(1);

			const credential = parseAgentAuthCredential(
				cred?.metadata ?? null,
				conn.baseUrl,
			);
			if (!credential) return [];
			return await listAgentAuthTools(credential);
		} catch {
			return [];
		}
	}
	return [];
}

export default async function ConnectionsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
	]);

	if (!org || !session?.user) {
		return (
			<div className="max-w-5xl mx-auto">
				<ConnectionsClient initialConnections={[]} orgId="" />
			</div>
		);
	}

	const orgId = org.id;
	const userId = session.user.id;
	const connections = await listConnectionsByOrg(orgId);

	const results = await Promise.all(
		connections.map(async (conn) => {
			let connected = false;
			let identifier: string | null = null;

			if (conn.type === "oauth" && conn.builtinId) {
				const cred = await getCredential(userId, conn.id, orgId);
				if (cred) {
					connected = true;
				}
				const [acc] = await db
					.select()
					.from(account)
					.where(
						and(
							eq(account.userId, userId),
							eq(account.providerId, conn.builtinId),
						),
					)
					.limit(1);
				if (acc) {
					connected = true;
					identifier = acc.accountId;
				}
			} else if (conn.type === "mcp") {
				connected = true;
				identifier = conn.mcpEndpoint;
			} else if (conn.type === "openapi") {
				connected = true;
				identifier = conn.specUrl;
			} else if (conn.type === "agent-auth") {
				const [cred] = await db
					.select()
					.from(connectionCredential)
					.where(
						and(
							eq(connectionCredential.connectionId, conn.id),
							eq(connectionCredential.orgId, orgId),
							eq(connectionCredential.status, "active"),
						),
					)
					.limit(1);
				connected = !!cred;
				identifier = conn.baseUrl;
			}

			const tools = await getToolsForConnection(conn, orgId);

			return {
				id: conn.id,
				orgId: conn.orgId,
				name: conn.name,
				displayName: conn.displayName,
				type: conn.type,
				builtinId: conn.builtinId,
				transport: conn.transport,
				mcpEndpoint: conn.mcpEndpoint,
				credentialType: conn.credentialType,
				status: conn.status,
				createdAt:
					conn.createdAt instanceof Date
						? conn.createdAt.toISOString()
						: String(conn.createdAt),
				connected,
				identifier,
				tools,
			};
		}),
	);

	return (
		<div className="max-w-5xl mx-auto">
			<ConnectionsClient initialConnections={results} orgId={orgId} />
		</div>
	);
}
