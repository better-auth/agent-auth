import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const limit = Math.min(
		parseInt(url.searchParams.get("limit") ?? "50"),
		200,
	);
	const offset = parseInt(url.searchParams.get("offset") ?? "0");
	const type = url.searchParams.get("type");
	const agentId = url.searchParams.get("agent_id");

	let query = "SELECT * FROM event_log";
	const params: (string | number)[] = [];
	const conditions: string[] = [];

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

	if (conditions.length > 0) {
		query += ` WHERE ${conditions.join(" AND ")}`;
	}

	query += " ORDER BY id DESC LIMIT ? OFFSET ?";
	params.push(limit, offset);

	const logs = db.prepare(query).all(...params) as Record<string, unknown>[];

	const countParams: (string | number)[] = [];
	let countQuery = "SELECT COUNT(*) as count FROM event_log";
	const countConditions: string[] = [];
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
	if (countConditions.length > 0) {
		countQuery += ` WHERE ${countConditions.join(" AND ")}`;
	}
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
