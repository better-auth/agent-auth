import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { listMCPTools } from "../mcp-client";
import { listOpenAPITools } from "../openapi-tools";
import {
	agent,
	agentHost,
	agentPermission,
	member,
} from "./better-auth-schema";
import { db } from "./drizzle";
import { agentActivity, connection } from "./schema";

function parseDbScopes(value: unknown): string[] {
	if (Array.isArray(value)) return value;
	if (typeof value !== "string" || !value) return [];
	try {
		let parsed: unknown = JSON.parse(value);
		if (typeof parsed === "string") parsed = JSON.parse(parsed);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export async function getOverviewData(orgId: string) {
	// Get agents for this org via member → user → agent
	const orgMembers = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));

	const userIds = orgMembers.map((m) => m.userId);

	if (userIds.length === 0) {
		return {
			agents: { active: 0, total: 0 },
			toolCalls: { total: 0 },
			last24hCalls: 0,
			members: { count: 0 },
			activeAgents: [],
			recentActivity: [],
			recentErrors: 0,
			toolCallsByProvider: [],
		};
	}

	// Active and total agents
	const allAgents = await db
		.select()
		.from(agent)
		.where(inArray(agent.userId, userIds));

	const activeAgents = allAgents.filter((a) => a.status === "active");

	// Get permissions for active agents
	const activeAgentData = await Promise.all(
		activeAgents.slice(0, 10).map(async (a) => {
			const perms = await db
				.select({ scope: agentPermission.scope })
				.from(agentPermission)
				.where(
					and(
						eq(agentPermission.agentId, a.id),
						eq(agentPermission.status, "active"),
					),
				);
			return {
				id: a.id,
				name: a.name,
				scopes: perms.map((p) => p.scope),
				lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
			};
		}),
	);

	// Activity (limited for overview; full listing uses getOrgActivity)
	const activities = await db
		.select()
		.from(agentActivity)
		.where(eq(agentActivity.orgId, orgId))
		.orderBy(desc(agentActivity.createdAt))
		.limit(8);

	const totalCalls = await db
		.select({ count: count() })
		.from(agentActivity)
		.where(eq(agentActivity.orgId, orgId));

	const last24h = await db
		.select({ count: count() })
		.from(agentActivity)
		.where(
			and(
				eq(agentActivity.orgId, orgId),
				sql`${agentActivity.createdAt} > now() - interval '24 hours'`,
			),
		);

	const recentErrors = await db
		.select({ count: count() })
		.from(agentActivity)
		.where(
			and(
				eq(agentActivity.orgId, orgId),
				eq(agentActivity.status, "error"),
				sql`${agentActivity.createdAt} > now() - interval '24 hours'`,
			),
		);

	// Tool calls by provider
	const byProvider = await db
		.select({
			provider: agentActivity.provider,
			count: count(),
			errorCount: sql<number>`count(*) filter (where ${agentActivity.status} = 'error')`,
		})
		.from(agentActivity)
		.where(eq(agentActivity.orgId, orgId))
		.groupBy(agentActivity.provider);

	return {
		agents: { active: activeAgents.length, total: allAgents.length },
		toolCalls: { total: totalCalls[0]?.count ?? 0 },
		last24hCalls: last24h[0]?.count ?? 0,
		members: { count: orgMembers.length },
		activeAgents: activeAgentData,
		recentActivity: activities.map((a) => ({
			id: a.id,
			tool: a.tool,
			provider: a.provider,
			agentName: a.agentName,
			status: a.status,
			durationMs: a.durationMs,
			error: a.error,
			createdAt: a.createdAt.toISOString(),
		})),
		recentErrors: recentErrors[0]?.count ?? 0,
		toolCallsByProvider: byProvider.map((p) => ({
			provider: p.provider ?? "unknown",
			count: p.count,
			errorCount: Number(p.errorCount),
		})),
	};
}

export async function getOrgActivity(
	orgId: string,
	opts?: { limit?: number; offset?: number },
) {
	const limit = opts?.limit ?? 50;
	const offset = opts?.offset ?? 0;

	const activities = await db
		.select()
		.from(agentActivity)
		.where(eq(agentActivity.orgId, orgId))
		.orderBy(desc(agentActivity.createdAt))
		.limit(limit + 1)
		.offset(offset);

	const hasMore = activities.length > limit;
	const items = hasMore ? activities.slice(0, limit) : activities;

	return {
		activities: items.map((a) => ({
			id: a.id,
			tool: a.tool,
			provider: a.provider,
			agentName: a.agentName,
			status: a.status,
			durationMs: a.durationMs,
			error: a.error,
			createdAt: a.createdAt.toISOString(),
		})),
		hasMore,
	};
}

export async function getOrgAgents(orgId: string) {
	const orgMembers = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));

	const userIds = orgMembers.map((m) => m.userId);
	if (userIds.length === 0) return [];

	const agents = await db
		.select()
		.from(agent)
		.where(inArray(agent.userId, userIds))
		.orderBy(desc(agent.createdAt));

	const hostIds = [
		...new Set(agents.map((a) => a.hostId).filter(Boolean)),
	] as string[];
	const hosts =
		hostIds.length > 0
			? await db.select().from(agentHost).where(inArray(agentHost.id, hostIds))
			: [];
	const hostMap = new Map(hosts.map((h) => [h.id, h]));

	return Promise.all(
		agents.map(async (a) => {
			const perms = await db
				.select({
					scope: agentPermission.scope,
					status: agentPermission.status,
				})
				.from(agentPermission)
				.where(eq(agentPermission.agentId, a.id));

			const host = a.hostId ? hostMap.get(a.hostId) : null;

			return {
				...a,
				scopes: perms.filter((p) => p.status === "active").map((p) => p.scope),
				host: host
					? { id: host.id, name: host.name ?? null, status: host.status }
					: null,
				createdAt: a.createdAt.toISOString(),
				updatedAt: a.updatedAt.toISOString(),
				lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
				activatedAt: a.activatedAt?.toISOString() ?? null,
			};
		}),
	);
}

export async function getOrgHosts(orgId: string) {
	const orgMembers = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));

	const userIds = orgMembers.map((m) => m.userId);
	if (userIds.length === 0) return [];

	const hosts = await db
		.select()
		.from(agentHost)
		.where(inArray(agentHost.userId, userIds));

	return Promise.all(
		hosts.map(async (host) => {
			const [agentCount] = await db
				.select({ count: count() })
				.from(agent)
				.where(and(eq(agent.hostId, host.id), eq(agent.status, "active")));

			const scopes = parseDbScopes(host.scopes);

			return {
				id: host.id,
				name: host.name ?? null,
				userId: host.userId,
				status: host.status,
				scopes,
				activeAgents: agentCount?.count ?? 0,
				createdAt: host.createdAt?.toISOString() ?? null,
				lastUsedAt: host.lastUsedAt?.toISOString() ?? null,
			};
		}),
	);
}

export async function getOrgMembers(orgId: string) {
	const members = await db
		.select({
			id: member.id,
			role: member.role,
			createdAt: member.createdAt,
			userId: member.userId,
		})
		.from(member)
		.where(eq(member.organizationId, orgId));

	// This would normally join with user table, simplified here
	return members.map((m) => ({
		...m,
		createdAt: m.createdAt.toISOString(),
	}));
}

export type AvailableScope = {
	name: string;
	description: string;
	provider: string;
};

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

export async function getOrgAvailableScopes(
	orgId: string,
): Promise<AvailableScope[]> {
	const connections = await db
		.select()
		.from(connection)
		.where(and(eq(connection.orgId, orgId), eq(connection.status, "active")));

	const scopes: AvailableScope[] = [];

	for (const conn of connections) {
		if (conn.type === "oauth" && conn.builtinId) {
			const tools = OAUTH_TOOLS[conn.builtinId] ?? [];
			for (const t of tools) {
				scopes.push({
					name: `${conn.name}.${t.name}`,
					description: t.description,
					provider: conn.name,
				});
			}
			continue;
		}

		if (conn.type === "openapi" && conn.specUrl) {
			try {
				const tools = await listOpenAPITools(conn.specUrl);
				for (const t of tools) {
					scopes.push({
						name: `${conn.name}.${t.name}`,
						description: t.description,
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
					scopes.push({
						name: `${conn.name}.${t.name}`,
						description: t.description,
						provider: conn.name,
					});
				}
			} catch {
				// Skip failed connections
			}
		}
	}

	return scopes;
}
