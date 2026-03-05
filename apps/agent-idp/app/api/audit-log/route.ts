import { headers } from "next/headers";
import { getClickHouseClient } from "@/lib/audit/client";
import { auth } from "@/lib/auth/auth";
import { getUserOrg } from "@/lib/db/queries";

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const ch = getClickHouseClient();
	if (!ch) {
		return Response.json(
			{ error: "Audit logging is not configured" },
			{ status: 503 },
		);
	}

	const org = await getUserOrg(session.user.id);
	if (!org) {
		return Response.json({ error: "No organization found" }, { status: 404 });
	}

	const url = new URL(req.url);
	const eventType = url.searchParams.get("event_type");
	const actorId = url.searchParams.get("actor_id");
	const agentId = url.searchParams.get("agent_id");
	const hostId = url.searchParams.get("host_id");
	const from = url.searchParams.get("from");
	const to = url.searchParams.get("to");
	const limitParam = url.searchParams.get("limit");
	const offsetParam = url.searchParams.get("offset");
	const table =
		url.searchParams.get("table") === "tools"
			? "tool_executions"
			: "audit_events";

	const limit = Math.min(Number(limitParam) || 100, 1000);
	const offset = Math.max(Number(offsetParam) || 0, 0);

	const conditions: string[] = [];
	const params: Record<string, string | number> = {};

	if (table === "audit_events") {
		conditions.push("org_id = {orgId:String}");
		params.orgId = org.id;

		if (eventType) {
			conditions.push("event_type = {eventType:String}");
			params.eventType = eventType;
		}
		if (actorId) {
			conditions.push("actor_id = {actorId:String}");
			params.actorId = actorId;
		}
		if (agentId) {
			conditions.push("agent_id = {agentId:String}");
			params.agentId = agentId;
		}
		if (hostId) {
			conditions.push("host_id = {hostId:String}");
			params.hostId = hostId;
		}
	} else {
		conditions.push("org_id = {orgId:String}");
		params.orgId = org.id;

		if (agentId) {
			conditions.push("agent_id = {agentId:String}");
			params.agentId = agentId;
		}
	}

	if (from) {
		conditions.push("timestamp >= {from:DateTime64(3)}");
		params.from = from;
	}
	if (to) {
		conditions.push("timestamp <= {to:DateTime64(3)}");
		params.to = to;
	}

	const where =
		conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

	const query = `SELECT * FROM ${table} ${where} ORDER BY timestamp DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}`;
	params.limit = limit;
	params.offset = offset;

	try {
		const result = await ch.query({
			query,
			query_params: params,
			format: "JSONEachRow",
		});
		const rows = await result.json();

		const countQuery = `SELECT count() as total FROM ${table} ${where}`;
		const countResult = await ch.query({
			query: countQuery,
			query_params: params,
			format: "JSONEachRow",
		});
		const countRows = (await countResult.json()) as { total: string }[];
		const total = Number(countRows[0]?.total ?? 0);

		return Response.json({ data: rows, total, limit, offset });
	} catch (err) {
		console.error("[audit-log] query failed:", err);
		return Response.json(
			{ error: "Failed to query audit log" },
			{ status: 500 },
		);
	}
}
