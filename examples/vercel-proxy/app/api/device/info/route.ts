import { auth } from "@/lib/auth";
import { db, getSetting } from "@/lib/db";
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

	const agent = db
		.prepare("SELECT * FROM agent WHERE id = ?")
		.get(agentId) as Record<string, unknown> | undefined;

	if (!agent) {
		return NextResponse.json({ error: "Agent not found" }, { status: 404 });
	}

	if (agent.userId && agent.userId !== session.user.id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	// If agent has no userId yet (pending), verify via host ownership
	if (!agent.userId && agent.hostId) {
		const hostOwner = db
			.prepare("SELECT userId FROM agentHost WHERE id = ?")
			.get(agent.hostId as string) as { userId: string | null } | undefined;
		if (hostOwner?.userId && hostOwner.userId !== session.user.id) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}
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
		agent.status === "pending" ||
		(host && host.status === "pending");

	const webauthnEnabled = getSetting("webauthnEnabled") === "true";

	const hasPasskeys = webauthnEnabled
		? (db
				.prepare("SELECT COUNT(*) as count FROM passkey WHERE userId = ?")
				.get(session.user.id) as { count: number } | undefined
			)?.count ?? 0
		: 0;

	const agentIsPending = agent.status === "pending";
	const hostIsPending = host?.status === "pending";
	const pendingGrants = grants.filter((g) => g.status === "pending");

	// Context-aware: determine if this approval will need webauthn
	let approvalContext: "host_approval" | "new_scopes" | "agent_creation" = "agent_creation";
	if (agentIsPending && hostIsPending) {
		approvalContext = "host_approval";
	} else if (!agentIsPending && pendingGrants.length > 0) {
		approvalContext = "new_scopes";
	}

	const willRequireWebAuthn =
		webauthnEnabled &&
		(approvalContext === "host_approval" || approvalContext === "new_scopes");

	return NextResponse.json({
		agent: {
			id: agent.id,
			name: agent.name,
			status: agent.status,
			mode: agent.mode,
			hostId: agent.hostId,
			createdAt: agent.createdAt,
		},
		host: host
			? { id: host.id, name: host.name, status: host.status }
			: null,
		grants: grants.map((g) => {
			let constraints = null;
			if (g.constraints) {
				try {
					constraints = typeof g.constraints === "string"
						? JSON.parse(g.constraints)
						: g.constraints;
				} catch { /* ignore */ }
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
		approvalContext,
		webauthn: {
			enabled: webauthnEnabled,
			hasPasskeys: hasPasskeys > 0,
			required: willRequireWebAuthn,
		},
	});
}
