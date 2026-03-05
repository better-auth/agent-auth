import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { agent } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const { agentId, name } = body as { agentId?: string; name?: string };

	if (!agentId) {
		return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
	}

	const [existing] = await db
		.select()
		.from(agent)
		.where(and(eq(agent.id, agentId), eq(agent.userId, session.user.id)))
		.limit(1);

	if (!existing) {
		return NextResponse.json({ error: "Agent not found" }, { status: 404 });
	}

	const updates: Record<string, unknown> = { updatedAt: new Date() };
	if (name !== undefined && name.trim()) updates.name = name.trim();

	await db.update(agent).set(updates).where(eq(agent.id, agentId));

	return NextResponse.json({
		id: agentId,
		name: name?.trim() ?? existing.name,
		status: existing.status,
	});
}
