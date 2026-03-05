import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "../auth/auth";
import { resolveInputScopePolicies } from "../auth/input-scope-policy";
import { listMCPTools } from "../mcp-client";
import { getOAuthAdapter } from "../oauth-adapters";
import { listOpenAPITools } from "../openapi-tools";
import {
	agent,
	agentHost,
	agentPermission,
	member,
	organization,
	session as sessionTable,
	user,
} from "./better-auth-schema";
import { db } from "./drizzle";
import {
	agentActivity,
	approvalHistory,
	connection,
	connectionCredential,
	mcpHostKeypair,
} from "./schema";

export const getSession = cache(async () => {
	return auth.api.getSession({ headers: await headers() });
});

export const getDeviceSessions = cache(async () => {
	try {
		return await auth.api.listDeviceSessions({ headers: await headers() });
	} catch {
		return [];
	}
});

export async function ensureActiveOrg(sessionToken: string, orgId: string) {
	await db
		.update(sessionTable)
		.set({ activeOrganizationId: orgId })
		.where(and(eq(sessionTable.token, sessionToken)));
}

export async function getUserOrg(userId: string) {
	const [row] = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(eq(member.userId, userId))
		.limit(1);
	return row ?? null;
}

export async function getOrgBySlug(slug: string) {
	const [row] = await db
		.select()
		.from(organization)
		.where(eq(organization.slug, slug))
		.limit(1);
	return row ?? null;
}

export type OrgType = "personal" | "organization";

export function getOrgType(metadata: string | null): OrgType {
	if (!metadata) return "organization";
	try {
		const meta = JSON.parse(metadata) as Record<string, unknown>;
		return meta.orgType === "personal" ? "personal" : "organization";
	} catch {
		return "organization";
	}
}

export function isPersonalOrg(metadata: string | null): boolean {
	return getOrgType(metadata) === "personal";
}

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

export async function getOverviewData(orgId: string, userId?: string) {
	const orgMembers = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));

	const userIds = userId ? [userId] : orgMembers.map((m) => m.userId);

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

	const activityConditions = [eq(agentActivity.orgId, orgId)];
	if (userId) {
		activityConditions.push(eq(agentActivity.userId, userId));
	}
	const activityWhere = and(...activityConditions);

	const activities = await db
		.select({
			id: agentActivity.id,
			tool: agentActivity.tool,
			provider: agentActivity.provider,
			agentName: agentActivity.agentName,
			status: agentActivity.status,
			durationMs: agentActivity.durationMs,
			error: agentActivity.error,
			createdAt: agentActivity.createdAt,
		})
		.from(agentActivity)
		.where(activityWhere)
		.orderBy(desc(agentActivity.createdAt))
		.limit(8);

	const totalCalls = await db
		.select({ count: count() })
		.from(agentActivity)
		.where(activityWhere);

	const last24hConditions = [
		...activityConditions,
		sql`${agentActivity.createdAt} > now() - interval '24 hours'`,
	];

	const last24h = await db
		.select({ count: count() })
		.from(agentActivity)
		.where(and(...last24hConditions));

	const recentErrors = await db
		.select({ count: count() })
		.from(agentActivity)
		.where(and(...last24hConditions, eq(agentActivity.status, "error")));

	const byProvider = await db
		.select({
			provider: agentActivity.provider,
			count: count(),
			errorCount: sql<number>`count(*) filter (where ${agentActivity.status} = 'error')`,
		})
		.from(agentActivity)
		.where(activityWhere)
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

export type ActivityFilters = {
	limit?: number;
	offset?: number;
	status?: string;
	agentId?: string;
	agentName?: string;
	provider?: string;
	search?: string;
	userId?: string;
};

export async function getOrgActivity(orgId: string, opts?: ActivityFilters) {
	const limit = opts?.limit ?? 50;
	const offset = opts?.offset ?? 0;

	const conditions = [eq(agentActivity.orgId, orgId)];
	if (opts?.userId) {
		conditions.push(eq(agentActivity.userId, opts.userId));
	}
	if (opts?.status) {
		conditions.push(eq(agentActivity.status, opts.status));
	}
	if (opts?.agentId) {
		conditions.push(eq(agentActivity.agentId, opts.agentId));
	}
	if (opts?.agentName) {
		conditions.push(eq(agentActivity.agentName, opts.agentName));
	}
	if (opts?.provider) {
		conditions.push(eq(agentActivity.provider, opts.provider));
	}
	if (opts?.search) {
		conditions.push(
			sql`(${agentActivity.tool} ilike ${"%" + opts.search + "%"} or ${agentActivity.agentName} ilike ${"%" + opts.search + "%"} or ${agentActivity.provider} ilike ${"%" + opts.search + "%"} or ${agentActivity.error} ilike ${"%" + opts.search + "%"})`,
		);
	}

	const where = and(...conditions);

	const [totalResult, activities] = await Promise.all([
		db.select({ count: count() }).from(agentActivity).where(where),
		db
			.select({
				id: agentActivity.id,
				agentId: agentActivity.agentId,
				tool: agentActivity.tool,
				provider: agentActivity.provider,
				agentName: agentActivity.agentName,
				status: agentActivity.status,
				durationMs: agentActivity.durationMs,
				error: agentActivity.error,
				createdAt: agentActivity.createdAt,
			})
			.from(agentActivity)
			.where(where)
			.orderBy(desc(agentActivity.createdAt))
			.limit(limit)
			.offset(offset),
	]);

	const total = totalResult[0]?.count ?? 0;

	return {
		activities: activities.map((a) => ({
			id: a.id,
			agentId: a.agentId,
			tool: a.tool,
			provider: a.provider,
			agentName: a.agentName,
			status: a.status,
			durationMs: a.durationMs,
			error: a.error,
			createdAt: a.createdAt.toISOString(),
		})),
		total,
		hasMore: offset + limit < total,
	};
}

export async function getActivityFilterOptions(orgId: string) {
	const [agents, providers] = await Promise.all([
		db
			.select({ agentName: agentActivity.agentName })
			.from(agentActivity)
			.where(
				and(
					eq(agentActivity.orgId, orgId),
					sql`${agentActivity.agentName} is not null`,
				),
			)
			.groupBy(agentActivity.agentName),
		db
			.select({ provider: agentActivity.provider })
			.from(agentActivity)
			.where(
				and(
					eq(agentActivity.orgId, orgId),
					sql`${agentActivity.provider} is not null`,
				),
			)
			.groupBy(agentActivity.provider),
	]);

	return {
		agents: agents.map((a) => a.agentName).filter(Boolean) as string[],
		providers: providers.map((p) => p.provider).filter(Boolean) as string[],
	};
}

export async function getOrgAgents(orgId: string, userId?: string) {
	let userIds: string[];

	if (userId) {
		userIds = [userId];
	} else {
		const orgMembers = await db
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, orgId));
		userIds = orgMembers.map((m) => m.userId);
	}

	if (userIds.length === 0) return [];

	const ownAgents = await db
		.select()
		.from(agent)
		.where(inArray(agent.userId, userIds))
		.orderBy(desc(agent.createdAt));

	// Include agents where this user has granted cross-user permissions
	let crossUserAgentIds: string[] = [];
	if (userId) {
		const crossPerms = await db
			.select({ agentId: agentPermission.agentId })
			.from(agentPermission)
			.where(
				and(
					eq(agentPermission.grantedBy, userId),
					eq(agentPermission.status, "active"),
				),
			);
		const ownIds = new Set(ownAgents.map((a) => a.id));
		crossUserAgentIds = [...new Set(crossPerms.map((p) => p.agentId))].filter(
			(id) => !ownIds.has(id),
		);
	}

	const crossAgents =
		crossUserAgentIds.length > 0
			? await db
					.select()
					.from(agent)
					.where(inArray(agent.id, crossUserAgentIds))
					.orderBy(desc(agent.createdAt))
			: [];

	const agents = [...ownAgents, ...crossAgents];

	const hostIds = [
		...new Set(agents.map((a) => a.hostId).filter(Boolean)),
	] as string[];
	const hosts =
		hostIds.length > 0
			? await db.select().from(agentHost).where(inArray(agentHost.id, hostIds))
			: [];
	const hostMap = new Map(hosts.map((h) => [h.id, h]));

	const ownerIds = [
		...new Set(agents.map((a) => a.userId).filter(Boolean)),
	] as string[];
	const owners =
		ownerIds.length > 0
			? await db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, ownerIds))
			: [];
	const ownerMap = new Map(owners.map((o) => [o.id, o.name]));

	return Promise.all(
		agents.map(async (a) => {
			const perms = await db
				.select({
					id: agentPermission.id,
					scope: agentPermission.scope,
					status: agentPermission.status,
					grantedBy: agentPermission.grantedBy,
					granterName: user.name,
				})
				.from(agentPermission)
				.leftJoin(user, eq(user.id, agentPermission.grantedBy))
				.where(eq(agentPermission.agentId, a.id));

			const host = a.hostId ? hostMap.get(a.hostId) : null;
			const activePerms = perms.filter((p) => p.status === "active");

			const seenScopes = new Set<string>();
			const dedupedPerms = activePerms.filter((p) => {
				if (seenScopes.has(p.scope)) return false;
				seenScopes.add(p.scope);
				return true;
			});

			return {
				...a,
				ownerName: a.userId ? (ownerMap.get(a.userId) ?? null) : null,
				scopes: dedupedPerms.map((p) => p.scope),
				scopeDetails: dedupedPerms.map((p) => ({
					id: p.id,
					scope: p.scope,
					grantedBy: p.grantedBy,
					granterName: p.granterName ?? null,
				})),
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

export async function removeAgentPermission(permissionId: string) {
	await db.delete(agentPermission).where(eq(agentPermission.id, permissionId));
}

export async function addAgentPermission(
	agentId: string,
	scope: string,
	grantedBy: string,
) {
	const existing = await db
		.select({ id: agentPermission.id })
		.from(agentPermission)
		.where(
			and(
				eq(agentPermission.agentId, agentId),
				eq(agentPermission.scope, scope),
				eq(agentPermission.status, "active"),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		return existing[0]!.id;
	}

	const id = crypto.randomUUID();
	const now = new Date();
	await db.insert(agentPermission).values({
		id,
		agentId,
		scope,
		referenceId: null,
		grantedBy,
		expiresAt: null,
		status: "active",
		reason: null,
		createdAt: now,
		updatedAt: now,
	});
	return id;
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

	const remoteHostIds = new Set(
		(
			await db
				.select({ hostId: mcpHostKeypair.hostId })
				.from(mcpHostKeypair)
				.where(
					inArray(
						mcpHostKeypair.hostId,
						hosts.map((h) => h.id),
					),
				)
		).map((r) => r.hostId),
	);

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
				isRemote: remoteHostIds.has(host.id),
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

type ReAuthPolicy = "none" | "fresh_session" | "always";
type ApprovalMethod = "auto" | "ciba" | "device_authorization";

export interface CrossUserCallsConfig {
	enabled: boolean;
	disabledScopes: string[];
}

export interface OrgSecuritySettings {
	allowDynamicHostRegistration: boolean;
	allowMemberHostCreation: boolean;
	dynamicHostDefaultScopes: string[];
	disabledScopes: string[];
	inputScopePolicies: {
		id: string;
		parentScope: string;
		scope: string;
		description?: string;
		hidden?: boolean;
		constraints: {
			type: "number_range";
			path: string;
			min?: number;
			max?: number;
		}[];
	}[];
	defaultApprovalMethod: ApprovalMethod;
	reAuthPolicy: ReAuthPolicy;
	freshSessionWindow: number;
	allowedReAuthMethods: ("password" | "passkey" | "email_otp")[];
	crossUserCalls: CrossUserCallsConfig;
	/** Per-scope permission TTL in seconds. Key = scope name, value = TTL. */
	scopeTTLs: Record<string, number>;
	/** Per-scope max uses. Key = scope name, value = max invocations before the permission is revoked. */
	scopeMaxUses: Record<string, number>;
}

const SECURITY_DEFAULTS: OrgSecuritySettings = {
	allowDynamicHostRegistration: true,
	allowMemberHostCreation: true,
	dynamicHostDefaultScopes: [],
	disabledScopes: [],
	inputScopePolicies: [],
	defaultApprovalMethod: "auto",
	reAuthPolicy: "fresh_session",
	freshSessionWindow: 300,
	allowedReAuthMethods: ["password", "passkey"],
	crossUserCalls: { enabled: true, disabledScopes: [] },
	scopeTTLs: {},
	scopeMaxUses: {},
};

function parseOrgMeta(raw: string | null): Record<string, unknown> {
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

function resolveCrossUserCalls(
	meta: Record<string, unknown>,
): CrossUserCallsConfig {
	const raw = meta.crossUserCalls;
	if (typeof raw !== "object" || raw === null) {
		return SECURITY_DEFAULTS.crossUserCalls;
	}
	const obj = raw as Record<string, unknown>;
	return {
		enabled:
			typeof obj.enabled === "boolean"
				? obj.enabled
				: SECURITY_DEFAULTS.crossUserCalls.enabled,
		disabledScopes: Array.isArray(obj.disabledScopes)
			? (obj.disabledScopes as string[])
			: SECURITY_DEFAULTS.crossUserCalls.disabledScopes,
	};
}

export function resolveSecuritySettings(
	meta: Record<string, unknown>,
): OrgSecuritySettings {
	return {
		allowDynamicHostRegistration:
			typeof meta.allowDynamicHostRegistration === "boolean"
				? meta.allowDynamicHostRegistration
				: SECURITY_DEFAULTS.allowDynamicHostRegistration,
		allowMemberHostCreation:
			typeof meta.allowMemberHostCreation === "boolean"
				? meta.allowMemberHostCreation
				: SECURITY_DEFAULTS.allowMemberHostCreation,
		dynamicHostDefaultScopes: Array.isArray(meta.dynamicHostDefaultScopes)
			? meta.dynamicHostDefaultScopes
			: SECURITY_DEFAULTS.dynamicHostDefaultScopes,
		disabledScopes: Array.isArray(meta.disabledScopes)
			? (meta.disabledScopes as string[]).filter((s) => typeof s === "string")
			: SECURITY_DEFAULTS.disabledScopes,
		inputScopePolicies: resolveInputScopePolicies(meta),
		defaultApprovalMethod:
			meta.defaultApprovalMethod === "ciba" ||
			meta.defaultApprovalMethod === "device_authorization" ||
			meta.defaultApprovalMethod === "auto"
				? meta.defaultApprovalMethod
				: SECURITY_DEFAULTS.defaultApprovalMethod,
		reAuthPolicy:
			meta.reAuthPolicy === "none" ||
			meta.reAuthPolicy === "fresh_session" ||
			meta.reAuthPolicy === "always"
				? meta.reAuthPolicy
				: SECURITY_DEFAULTS.reAuthPolicy,
		freshSessionWindow:
			typeof meta.freshSessionWindow === "number"
				? meta.freshSessionWindow
				: SECURITY_DEFAULTS.freshSessionWindow,
		allowedReAuthMethods: Array.isArray(meta.allowedReAuthMethods)
			? meta.allowedReAuthMethods.filter((m: unknown) =>
					["password", "passkey", "email_otp"].includes(m as string),
				)
			: SECURITY_DEFAULTS.allowedReAuthMethods,
		crossUserCalls: resolveCrossUserCalls(meta),
		scopeTTLs: resolveScopeTTLs(meta),
		scopeMaxUses: resolvePositiveIntMap(meta.scopeMaxUses),
	};
}

function resolvePositiveIntMap(raw: unknown): Record<string, number> {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
	const result: Record<string, number> = {};
	for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof val === "number" && val > 0) {
			result[key] = val;
		}
	}
	return result;
}

function resolveScopeTTLs(
	meta: Record<string, unknown>,
): Record<string, number> {
	return resolvePositiveIntMap(meta.scopeTTLs);
}

export async function getOrgSecuritySettings(
	orgId: string,
): Promise<OrgSecuritySettings> {
	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);

	if (!org) return SECURITY_DEFAULTS;
	return resolveSecuritySettings(parseOrgMeta(org.metadata));
}

export async function getOrgAvailableScopes(
	orgId: string,
): Promise<AvailableScope[]> {
	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	const orgMeta = parseOrgMeta(org?.metadata ?? null);
	const inputPolicies = resolveInputScopePolicies(orgMeta);

	const connections = await db
		.select()
		.from(connection)
		.where(and(eq(connection.orgId, orgId), eq(connection.status, "active")));

	const replacedBySubScopes = new Set(inputPolicies.map((p) => p.parentScope));

	const scopes: AvailableScope[] = [];
	const seen = new Set<string>();
	const pushScope = (scope: AvailableScope) => {
		if (seen.has(scope.name)) return;
		seen.add(scope.name);
		scopes.push(scope);
	};

	for (const conn of connections) {
		if (conn.type === "openapi" && conn.specUrl) {
			try {
				const tools = await listOpenAPITools(conn.specUrl);
				for (const t of tools) {
					const scopeName = `${conn.name}.${t.name}`;
					if (replacedBySubScopes.has(scopeName)) continue;
					pushScope({
						name: scopeName,
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
					const scopeName = `${conn.name}.${t.name}`;
					if (replacedBySubScopes.has(scopeName)) continue;
					pushScope({
						name: scopeName,
						description: t.description,
						provider: conn.name,
					});
				}
			} catch {
				// Skip failed connections
			}
			continue;
		}

		if (conn.type === "oauth" && conn.builtinId) {
			const adapter = getOAuthAdapter(conn.builtinId);
			if (adapter) {
				const grantedScopes =
					conn.oauthScopes?.split(/[\s,]+/).filter(Boolean) ?? undefined;
				const tools = adapter.listTools(grantedScopes);
				for (const t of tools) {
					const scopeName = `${conn.name}.${t.name}`;
					if (replacedBySubScopes.has(scopeName)) continue;
					pushScope({
						name: scopeName,
						description: t.description,
						provider: conn.name,
					});
				}
			}
			continue;
		}
	}

	for (const policy of inputPolicies) {
		if (policy.hidden) continue;
		pushScope({
			name: policy.scope,
			description:
				policy.description ??
				`Derived from ${policy.parentScope} with input constraints`,
			provider: policy.parentScope.split(".")[0] ?? "custom",
		});
	}

	return scopes;
}

export type ScopeWithSchema = {
	name: string;
	description: string;
	provider: string;
	connectionId: string;
	connectionType: string;
	inputSchema: Record<string, unknown> | null;
	hasInput: boolean;
};

export type ConnectionScopes = {
	connectionId: string;
	connectionName: string;
	connectionDisplayName: string;
	connectionType: string;
	scopes: ScopeWithSchema[];
};

export async function getOrgScopesWithSchema(
	orgId: string,
	userId?: string,
): Promise<ConnectionScopes[]> {
	const connections = await db
		.select()
		.from(connection)
		.where(and(eq(connection.orgId, orgId), eq(connection.status, "active")));

	const result: ConnectionScopes[] = [];

	for (const conn of connections) {
		const entry: ConnectionScopes = {
			connectionId: conn.id,
			connectionName: conn.name,
			connectionDisplayName: conn.displayName,
			connectionType: conn.type,
			scopes: [],
		};

		if (conn.type === "openapi" && conn.specUrl) {
			try {
				const tools = await listOpenAPITools(conn.specUrl);
				for (const t of tools) {
					const props = (t.inputSchema?.properties ?? {}) as Record<
						string,
						unknown
					>;
					entry.scopes.push({
						name: `${conn.name}.${t.name}`,
						description: t.description,
						provider: conn.name,
						connectionId: conn.id,
						connectionType: conn.type,
						inputSchema: t.inputSchema,
						hasInput: Object.keys(props).length > 0,
					});
				}
			} catch {
				// skip
			}
		} else if (conn.mcpEndpoint) {
			let authHeaders: Record<string, string> | undefined;
			if (conn.type === "oauth" && userId) {
				const [cred] = await db
					.select()
					.from(connectionCredential)
					.where(
						and(
							eq(connectionCredential.connectionId, conn.id),
							eq(connectionCredential.orgId, orgId),
							eq(connectionCredential.userId, userId),
							eq(connectionCredential.status, "active"),
						),
					)
					.limit(1);
				if (cred?.accessToken) {
					authHeaders = { Authorization: `Bearer ${cred.accessToken}` };
				}
			}
			try {
				const tools = await listMCPTools(conn.mcpEndpoint, authHeaders);
				for (const t of tools) {
					const props = (t.inputSchema?.properties ?? {}) as Record<
						string,
						unknown
					>;
					entry.scopes.push({
						name: `${conn.name}.${t.name}`,
						description: t.description,
						provider: conn.name,
						connectionId: conn.id,
						connectionType: conn.type,
						inputSchema: t.inputSchema,
						hasInput: Object.keys(props).length > 0,
					});
				}
			} catch {
				// skip
			}
		} else if (conn.type === "oauth" && conn.builtinId) {
			const adapter = getOAuthAdapter(conn.builtinId);
			if (adapter) {
				const grantedScopes =
					conn.oauthScopes?.split(/[\s,]+/).filter(Boolean) ?? undefined;
				const tools = adapter.listTools(grantedScopes);
				for (const t of tools) {
					const props = (t.inputSchema?.properties ?? {}) as Record<
						string,
						unknown
					>;
					entry.scopes.push({
						name: `${conn.name}.${t.name}`,
						description: t.description,
						provider: conn.name,
						connectionId: conn.id,
						connectionType: conn.type,
						inputSchema: t.inputSchema,
						hasInput: Object.keys(props).length > 0,
					});
				}
			}
		}

		if (entry.scopes.length > 0) {
			result.push(entry);
		}
	}

	return result;
}

export type ApprovalHistoryEntry = {
	id: string;
	action: string;
	requestType: string;
	requestId: string | null;
	agentId: string | null;
	agentName: string | null;
	clientId: string | null;
	scopes: string | null;
	bindingMessage: string | null;
	userId: string | null;
	createdAt: string;
};

export async function recordApproval(entry: {
	orgId: string;
	userId: string;
	action: string;
	requestType: string;
	requestId?: string;
	agentId?: string;
	agentName?: string;
	clientId?: string;
	scopes?: string;
	bindingMessage?: string;
}) {
	const id = crypto.randomUUID();
	await db.insert(approvalHistory).values({
		id,
		orgId: entry.orgId,
		userId: entry.userId,
		action: entry.action,
		requestType: entry.requestType,
		requestId: entry.requestId ?? null,
		agentId: entry.agentId ?? null,
		agentName: entry.agentName ?? null,
		clientId: entry.clientId ?? null,
		scopes: entry.scopes ?? null,
		bindingMessage: entry.bindingMessage ?? null,
	});
	return id;
}

export async function getApprovalHistory(
	orgId: string,
	opts?: { limit?: number; offset?: number },
): Promise<{ entries: ApprovalHistoryEntry[]; total: number }> {
	const limit = opts?.limit ?? 50;
	const offset = opts?.offset ?? 0;
	const where = eq(approvalHistory.orgId, orgId);

	const [totalResult, entries] = await Promise.all([
		db.select({ count: count() }).from(approvalHistory).where(where),
		db
			.select()
			.from(approvalHistory)
			.where(where)
			.orderBy(desc(approvalHistory.createdAt))
			.limit(limit)
			.offset(offset),
	]);

	return {
		entries: entries.map((e) => ({
			id: e.id,
			action: e.action,
			requestType: e.requestType,
			requestId: e.requestId,
			agentId: e.agentId,
			agentName: e.agentName,
			clientId: e.clientId,
			scopes: e.scopes,
			bindingMessage: e.bindingMessage,
			userId: e.userId,
			createdAt: e.createdAt.toISOString(),
		})),
		total: totalResult[0]?.count ?? 0,
	};
}
