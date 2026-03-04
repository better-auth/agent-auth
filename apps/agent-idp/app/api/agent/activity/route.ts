import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/drizzle";
import { agentActivity } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const agentId = request.nextUrl.searchParams.get("agentId");
	const orgId = request.nextUrl.searchParams.get("orgId");
	const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50", 10);
	const offset = parseInt(
		request.nextUrl.searchParams.get("offset") || "0",
		10,
	);

	if (!agentId && !orgId) {
		return NextResponse.json(
			{ error: "Missing agentId or orgId" },
			{ status: 400 },
		);
	}

	const where = agentId
		? eq(agentActivity.agentId, agentId)
		: eq(agentActivity.orgId, orgId!);

	const activities = await db
		.select()
		.from(agentActivity)
		.where(where)
		.orderBy(desc(agentActivity.createdAt))
		.limit(limit + 1)
		.offset(offset);

	const hasMore = activities.length > limit;
	const items = hasMore ? activities.slice(0, limit) : activities;

	return NextResponse.json({
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
	});
}
