import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth/auth";
import { agent } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import { addAgentPermission } from "@/lib/db/queries";

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const { agentId, scope } = body as { agentId?: string; scope?: string };

	if (!agentId || !scope) {
		return NextResponse.json(
			{ error: "Missing agentId or scope" },
			{ status: 400 },
		);
	}

	const [existing] = await db
		.select({ id: agent.id })
		.from(agent)
		.where(and(eq(agent.id, agentId), eq(agent.userId, session.user.id)))
		.limit(1);

	if (!existing) {
		return NextResponse.json(
			{ error: "Only the agent owner can add scopes" },
			{ status: 403 },
		);
	}

	try {
		const permissionId = await addAgentPermission(
			agentId,
			scope,
			session.user.id,
		);
		audit.log({
			eventType: "scope.added",
			orgId: "",
			actorId: session.user.id,
			agentId,
			metadata: { scope },
		});
		return NextResponse.json({ permissionId });
	} catch {
		return NextResponse.json({ error: "Failed to add scope" }, { status: 500 });
	}
}
