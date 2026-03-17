import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const SCOPE_CLAUSE = `(
  actorId = ?
  OR agentId IN (SELECT id FROM agent WHERE userId = ?)
  OR hostId IN (SELECT id FROM agentHost WHERE userId = ?)
)`;

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
	const agentId = url.searchParams.get("agent_id");

	const conditions: string[] = [SCOPE_CLAUSE];
	const params: (string | number)[] = [userId, userId, userId];

	const isPrefix = type?.endsWith(".");
	if (type) {
		if (isPrefix) {
			conditions.push("type LIKE ?");
			params.push(`${type}%`);
		} else {
			conditions.push("type = ?");
			params.push(type);
		}
	}

	if (agentId) {
		conditions.push("agentId = ?");
		params.push(agentId);
	}

	const where = ` WHERE ${conditions.join(" AND ")}`;

	const query = `SELECT * FROM event_log${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
	params.push(limit, offset);

	const logs = db.prepare(query).all(...params) as Record<string, unknown>[];

	const countParams: (string | number)[] = [userId, userId, userId];
	const countConditions: string[] = [SCOPE_CLAUSE];
	if (type) {
		if (isPrefix) {
			countConditions.push("type LIKE ?");
			countParams.push(`${type}%`);
		} else {
			countConditions.push("type = ?");
			countParams.push(type);
		}
	}
	if (agentId) {
		countConditions.push("agentId = ?");
		countParams.push(agentId);
	}
	const countQuery = `SELECT COUNT(*) as count FROM event_log WHERE ${countConditions.join(" AND ")}`;
	const total = db
		.prepare(countQuery)
		.get(...countParams) as { count: number };

	return NextResponse.json({
		logs: logs.map((l) => ({
			id: l.id,
			type: l.type,
			actorId: l.actorId,
			actorType: l.actorType,
			agentId: l.agentId,
			hostId: l.hostId,
			data: l.data ? JSON.parse(l.data as string) : null,
			createdAt: l.createdAt,
		})),
		total: total.count,
	});
}
