import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
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
	const agentId = url.searchParams.get("agent_id");
	if (!agentId) {
		return NextResponse.json(
			{ error: "agent_id required" },
			{ status: 400 },
		);
	}

	const [agentRow] = await db
		.select()
		.from(schema.agent)
		.where(eq(schema.agent.id, agentId))
		.limit(1);

	if (!agentRow) {
		return NextResponse.json({ error: "Agent not found" }, { status: 404 });
	}

	if (agentRow.userId && agentRow.userId !== session.user.id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const grants = await db
		.select()
		.from(schema.agentCapabilityGrant)
		.where(eq(schema.agentCapabilityGrant.agentId, agentId));

	const host = agentRow.hostId
		? (
				await db
					.select()
					.from(schema.agentHost)
					.where(eq(schema.agentHost.id, agentRow.hostId))
					.limit(1)
			)[0] ?? null
		: null;

	const needsActivation =
		agentRow.status === "pending" ||
		(host && host.status === "pending");

	return NextResponse.json({
		agent: {
			id: agentRow.id,
			name: agentRow.name,
			status: agentRow.status,
			mode: agentRow.mode,
			hostId: agentRow.hostId,
			createdAt: agentRow.createdAt,
		},
		host: host
			? { id: host.id, name: host.name, status: host.status }
			: null,
		grants: grants.map((g) => {
			let constraints = null;
			if (g.constraints) {
				try {
					constraints =
						typeof g.constraints === "string"
							? JSON.parse(g.constraints)
							: g.constraints;
				} catch {
					/* ignore */
				}
			}
			return {
				id: g.id,
				capability: g.capability,
				status: g.status,
				reason: g.reason,
				constraints,
			};
		}),
		needsActivation,
	});
}
