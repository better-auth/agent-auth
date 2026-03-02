import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getActivityLog, getActivityLogCount } from "@/lib/activity-log";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const limit = Math.min(
		Number.parseInt(url.searchParams.get("limit") ?? "50", 10),
		100,
	);
	const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);

	const entries = getActivityLog(session.user.id, limit, offset);
	const total = getActivityLogCount(session.user.id);

	return NextResponse.json({
		entries: entries.map((e) => ({
			id: e.id,
			agentId: e.agentId,
			agentName: e.agentName,
			provider: e.provider,
			tool: e.tool,
			args: safeParseJSON(e.args),
			result: safeParseJSON(e.result),
			status: e.status,
			durationMs: e.durationMs,
			inputSchema: safeParseJSON(e.inputSchema),
			createdAt: e.createdAt,
		})),
		total,
		limit,
		offset,
	});
}

function safeParseJSON(str: string): unknown {
	try {
		return JSON.parse(str);
	} catch {
		return str;
	}
}
