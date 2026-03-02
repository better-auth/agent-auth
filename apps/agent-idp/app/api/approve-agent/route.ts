import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * POST /api/approve-agent
 *
 * Approves a pending behalf_of agent. Optionally trusts the host
 * with default scopes so future agents through it auto-approve (§2.2).
 *
 * Body: { agentId: string, hostScopes?: string[] }
 */
export async function POST(request: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as {
		agentId: string;
		hostScopes?: string[];
	};
	if (!body.agentId) {
		return NextResponse.json({ error: "agentId is required" }, { status: 400 });
	}

	const ctx = await (auth as any).$context;
	const adapter = ctx.adapter;

	const agent = await adapter.findOne({
		model: "agent",
		where: [{ field: "id", value: body.agentId }],
	});

	if (!agent) {
		return NextResponse.json({ error: "Agent not found" }, { status: 404 });
	}

	if (agent.status !== "pending") {
		return NextResponse.json(
			{ error: `Agent is already ${agent.status}` },
			{ status: 400 },
		);
	}

	if (agent.userId && agent.userId !== session.user.id) {
		return NextResponse.json(
			{ error: "Agent does not belong to this user" },
			{ status: 403 },
		);
	}

	const now = new Date();

	if (agent.hostId) {
		const host = await adapter.findOne({
			model: "agentHost",
			where: [{ field: "id", value: agent.hostId }],
		});

		if (host && (host.status === "pending" || host.status === "active")) {
			const hostUpdate: Record<string, unknown> = {
				userId: session.user.id,
				status: "active",
				activatedAt: host.status === "pending" ? now : host.activatedAt,
				updatedAt: now,
			};

			if (body.hostScopes && body.hostScopes.length > 0) {
				hostUpdate.scopes = JSON.stringify(body.hostScopes);
			}

			await adapter.update({
				model: "agentHost",
				where: [{ field: "id", value: host.id }],
				update: hostUpdate,
			});
		}
	}

	await adapter.update({
		model: "agent",
		where: [{ field: "id", value: agent.id }],
		update: {
			userId: session.user.id,
			status: "active",
			activatedAt: now,
			updatedAt: now,
		},
	});

	const permissions = await adapter.findMany({
		model: "agentPermission",
		where: [
			{ field: "agentId", value: agent.id },
			{ field: "status", value: "pending" },
		],
	});

	for (const perm of permissions) {
		await adapter.update({
			model: "agentPermission",
			where: [{ field: "id", value: perm.id }],
			update: { status: "active", updatedAt: now },
		});
	}

	return NextResponse.json({
		success: true,
		agentId: agent.id,
		status: "active",
	});
}
