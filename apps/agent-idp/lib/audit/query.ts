import { getClickHouseClient } from "./client";

export interface UnifiedActivityItem {
	id: string;
	kind: "tool" | "audit";
	timestamp: string;
	tool?: string;
	provider?: string;
	agentId?: string;
	agentName?: string;
	userId?: string;
	status?: string;
	durationMs?: number;
	error?: string;
	eventType?: string;
	actorId?: string;
	actorType?: string;
	hostId?: string;
	targetId?: string;
	targetType?: string;
	metadata?: string;
}

export interface UnifiedActivityFilters {
	limit?: number;
	offset?: number;
	kind?: "tool" | "audit" | "all";
	status?: string;
	eventType?: string;
	agentId?: string;
	agentName?: string;
	provider?: string;
	search?: string;
}

export interface UnifiedActivityResult {
	activities: UnifiedActivityItem[];
	total: number;
	hasMore: boolean;
}

export interface UnifiedFilterOptions {
	agents: string[];
	providers: string[];
	eventTypes: string[];
}

export async function getUnifiedActivity(
	orgId: string,
	opts?: UnifiedActivityFilters,
): Promise<UnifiedActivityResult | null> {
	const ch = getClickHouseClient();
	if (!ch) return null;

	const limit = opts?.limit ?? 50;
	const offset = opts?.offset ?? 0;
	const kind = opts?.kind ?? "all";

	const toolConditions: string[] = ["org_id = {orgId:String}"];
	const auditConditions: string[] = ["org_id = {orgId:String}"];
	const params: Record<string, string | number> = { orgId };

	if (opts?.agentId) {
		toolConditions.push("agent_id = {agentId:String}");
		auditConditions.push("agent_id = {agentId:String}");
		params.agentId = opts.agentId;
	}
	if (opts?.agentName) {
		toolConditions.push("agent_name = {agentName:String}");
		params.agentName = opts.agentName;
	}
	if (opts?.provider) {
		toolConditions.push("provider = {provider:String}");
		params.provider = opts.provider;
	}
	if (opts?.status) {
		toolConditions.push("status = {status:String}");
		params.status = opts.status;
	}
	if (opts?.eventType) {
		auditConditions.push("event_type = {eventType:String}");
		params.eventType = opts.eventType;
	}
	if (opts?.search) {
		const searchPattern = `%${opts.search}%`;
		toolConditions.push(
			"(tool ILIKE {search:String} OR agent_name ILIKE {search:String} OR provider ILIKE {search:String} OR error ILIKE {search:String})",
		);
		auditConditions.push(
			"(event_type ILIKE {search:String} OR metadata ILIKE {search:String})",
		);
		params.search = searchPattern;
	}

	const toolWhere = toolConditions.join(" AND ");
	const auditWhere = auditConditions.join(" AND ");

	let dataQuery: string;
	let countQuery: string;

	if (kind === "tool") {
		dataQuery = `
			SELECT 'tool' AS kind, timestamp, '' AS event_type,
				tool, provider, agent_id, agent_name, user_id,
				status, duration_ms, error,
				'' AS actor_id, '' AS actor_type, '' AS host_id,
				'' AS target_id, '' AS target_type, metadata
			FROM tool_executions
			WHERE ${toolWhere}
			ORDER BY timestamp DESC
			LIMIT {limit:UInt32} OFFSET {offset:UInt32}
		`;
		countQuery = `SELECT count() AS total FROM tool_executions WHERE ${toolWhere}`;
	} else if (kind === "audit") {
		dataQuery = `
			SELECT 'audit' AS kind, timestamp, event_type,
				'' AS tool, '' AS provider, agent_id, '' AS agent_name, '' AS user_id,
				'' AS status, 0 AS duration_ms, '' AS error,
				actor_id, actor_type, host_id,
				target_id, target_type, metadata
			FROM audit_events
			WHERE ${auditWhere}
			ORDER BY timestamp DESC
			LIMIT {limit:UInt32} OFFSET {offset:UInt32}
		`;
		countQuery = `SELECT count() AS total FROM audit_events WHERE ${auditWhere}`;
	} else {
		dataQuery = `
			SELECT * FROM (
				SELECT 'tool' AS kind, timestamp, '' AS event_type,
					tool, provider, agent_id, agent_name, user_id,
					status, duration_ms, error,
					'' AS actor_id, '' AS actor_type, '' AS host_id,
					'' AS target_id, '' AS target_type, metadata
				FROM tool_executions
				WHERE ${toolWhere}
				UNION ALL
				SELECT 'audit' AS kind, timestamp, event_type,
					'' AS tool, '' AS provider, agent_id, '' AS agent_name, '' AS user_id,
					'' AS status, 0 AS duration_ms, '' AS error,
					actor_id, actor_type, host_id,
					target_id, target_type, metadata
				FROM audit_events
				WHERE ${auditWhere}
			)
			ORDER BY timestamp DESC
			LIMIT {limit:UInt32} OFFSET {offset:UInt32}
		`;
		countQuery = `
			SELECT
				(SELECT count() FROM tool_executions WHERE ${toolWhere}) +
				(SELECT count() FROM audit_events WHERE ${auditWhere})
			AS total
		`;
	}

	params.limit = limit;
	params.offset = offset;

	try {
		const [dataResult, countResult] = await Promise.all([
			ch.query({
				query: dataQuery,
				query_params: params,
				format: "JSONEachRow",
			}),
			ch.query({
				query: countQuery,
				query_params: params,
				format: "JSONEachRow",
			}),
		]);

		const rows = (await dataResult.json()) as Record<string, unknown>[];
		const countRows = (await countResult.json()) as { total: string }[];
		const total = Number(countRows[0]?.total ?? 0);

		const activities: UnifiedActivityItem[] = rows.map((r, i) => ({
			id: `${r.kind}-${offset + i}-${r.timestamp}`,
			kind: r.kind as "tool" | "audit",
			timestamp: String(r.timestamp),
			tool: r.tool ? String(r.tool) : undefined,
			provider: r.provider ? String(r.provider) : undefined,
			agentId: r.agent_id ? String(r.agent_id) : undefined,
			agentName: r.agent_name ? String(r.agent_name) : undefined,
			userId: r.user_id ? String(r.user_id) : undefined,
			status: r.status ? String(r.status) : undefined,
			durationMs: r.duration_ms ? Number(r.duration_ms) : undefined,
			error: r.error ? String(r.error) : undefined,
			eventType: r.event_type ? String(r.event_type) : undefined,
			actorId: r.actor_id ? String(r.actor_id) : undefined,
			actorType: r.actor_type ? String(r.actor_type) : undefined,
			hostId: r.host_id ? String(r.host_id) : undefined,
			targetId: r.target_id ? String(r.target_id) : undefined,
			targetType: r.target_type ? String(r.target_type) : undefined,
			metadata:
				r.metadata && r.metadata !== "{}" ? String(r.metadata) : undefined,
		}));

		return { activities, total, hasMore: offset + limit < total };
	} catch (err) {
		console.error("[audit] unified query failed:", err);
		return null;
	}
}

export async function getUnifiedFilterOptions(
	orgId: string,
): Promise<UnifiedFilterOptions | null> {
	const ch = getClickHouseClient();
	if (!ch) return null;

	const params = { orgId };

	try {
		const [agentsResult, providersResult, eventTypesResult] = await Promise.all(
			[
				ch.query({
					query:
						"SELECT DISTINCT agent_name FROM tool_executions WHERE org_id = {orgId:String} AND agent_name != '' ORDER BY agent_name",
					query_params: params,
					format: "JSONEachRow",
				}),
				ch.query({
					query:
						"SELECT DISTINCT provider FROM tool_executions WHERE org_id = {orgId:String} AND provider != '' ORDER BY provider",
					query_params: params,
					format: "JSONEachRow",
				}),
				ch.query({
					query:
						"SELECT DISTINCT event_type FROM audit_events WHERE org_id = {orgId:String} ORDER BY event_type",
					query_params: params,
					format: "JSONEachRow",
				}),
			],
		);

		const agents = (
			(await agentsResult.json()) as { agent_name: string }[]
		).map((r) => r.agent_name);
		const providers = (
			(await providersResult.json()) as { provider: string }[]
		).map((r) => r.provider);
		const eventTypes = (
			(await eventTypesResult.json()) as { event_type: string }[]
		).map((r) => r.event_type);

		return { agents, providers, eventTypes };
	} catch (err) {
		console.error("[audit] filter options query failed:", err);
		return null;
	}
}
