import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const agentId = url.searchParams.get("agent_id");
	if (!agentId) {
		return NextResponse.json({ error: "agent_id required" }, { status: 400 });
	}

	const agent = db.prepare("SELECT * FROM agent WHERE id = ?").get(agentId) as
		| Record<string, unknown>
		| undefined;

	if (!agent) {
		return NextResponse.json({ error: "Agent not found" }, { status: 404 });
	}

	if (agent.userId && agent.userId !== session.user.id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const grants = db
		.prepare("SELECT * FROM agentCapabilityGrant WHERE agentId = ?")
		.all(agentId) as Record<string, unknown>[];

	const host = agent.hostId
		? (db
				.prepare("SELECT * FROM agentHost WHERE id = ?")
				.get(agent.hostId as string) as Record<string, unknown> | undefined)
		: null;

	const needsActivation =
		agent.status === "pending" || (host && host.status === "pending");

	return NextResponse.json({
		agent: {
			id: agent.id,
			name: agent.name,
			status: agent.status,
			mode: agent.mode,
			hostId: agent.hostId,
			createdAt: agent.createdAt,
		},
		host: host ? { id: host.id, name: host.name, status: host.status } : null,
		grants: grants.map((g) => ({
			id: g.id,
			capability: g.capability,
			status: g.status,
			reason: g.reason,
		})),
		needsActivation,
	});
}
