import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, count, desc, eq, like, or, sql, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const userId = session.user.id;
	const url = new URL(req.url);
	const limit = Math.min(
		parseInt(url.searchParams.get("limit") ?? "50"),
		200,
	);
	const offset = parseInt(url.searchParams.get("offset") ?? "0");
	const type = url.searchParams.get("type");
	const agentIdParam = url.searchParams.get("agent_id");

	const userAgentIds = db
		.select({ id: schema.agent.id })
		.from(schema.agent)
		.where(eq(schema.agent.userId, userId));

	const userHostIds = db
		.select({ id: schema.agentHost.id })
		.from(schema.agentHost)
		.where(eq(schema.agentHost.userId, userId));

	const scopeCondition = or(
		eq(schema.eventLog.actorId, userId),
		inArray(schema.eventLog.agentId, userAgentIds),
		inArray(schema.eventLog.hostId, userHostIds),
	)!;

	const conditions = [scopeCondition];

	if (type) {
		if (type.endsWith(".")) {
			conditions.push(like(schema.eventLog.type, `${type}%`));
		} else {
			conditions.push(eq(schema.eventLog.type, type));
		}
	}

	if (agentIdParam) {
		conditions.push(eq(schema.eventLog.agentId, agentIdParam));
	}

	const whereClause = and(...conditions);

	const [logs, totalResult] = await Promise.all([
		db
			.select()
			.from(schema.eventLog)
			.where(whereClause)
			.orderBy(desc(schema.eventLog.id))
			.limit(limit)
			.offset(offset),
		db
			.select({ count: count() })
			.from(schema.eventLog)
			.where(whereClause),
	]);

	return NextResponse.json({
		logs: logs.map((l) => ({
			id: l.id,
			type: l.type,
			actorId: l.actorId,
			actorType: l.actorType,
			agentId: l.agentId,
			hostId: l.hostId,
			data: l.data ? JSON.parse(l.data) : null,
			createdAt: l.createdAt,
		})),
		total: totalResult[0]?.count ?? 0,
	});
}
