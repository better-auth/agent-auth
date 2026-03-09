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

	let query = "SELECT * FROM event_log";
	const params: (string | number)[] = [];

	const isPrefix = type?.endsWith(".");
	if (type) {
		if (isPrefix) {
			query += " WHERE type LIKE ?";
			params.push(`${type}%`);
		} else {
			query += " WHERE type = ?";
			params.push(type);
		}
	}

	query += " ORDER BY id DESC LIMIT ? OFFSET ?";
	params.push(limit, offset);

	const logs = db.prepare(query).all(...params) as Record<string, unknown>[];

	const countParams: (string | number)[] = [];
	let countQuery = "SELECT COUNT(*) as count FROM event_log";
	if (type) {
		if (isPrefix) {
			countQuery += " WHERE type LIKE ?";
			countParams.push(`${type}%`);
		} else {
			countQuery += " WHERE type = ?";
			countParams.push(type);
		}
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
