import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth/auth";
import { agent, agentPermission } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const { permissionId } = body as { permissionId?: string };

	if (!permissionId) {
		return NextResponse.json(
			{ error: "Missing permissionId" },
			{ status: 400 },
		);
	}

	const [perm] = await db
		.select({
			id: agentPermission.id,
			agentId: agentPermission.agentId,
			grantedBy: agentPermission.grantedBy,
		})
		.from(agentPermission)
		.where(eq(agentPermission.id, permissionId))
		.limit(1);

	if (!perm) {
		return NextResponse.json(
			{ error: "Permission not found" },
			{ status: 404 },
		);
	}

	const isGranter = perm.grantedBy === session.user.id;

	if (!isGranter) {
		const [agentRow] = await db
			.select({ userId: agent.userId })
			.from(agent)
			.where(eq(agent.id, perm.agentId))
			.limit(1);

		if (!agentRow || agentRow.userId !== session.user.id) {
			return NextResponse.json(
				{
					error: "You can only remove scopes you granted or on agents you own",
				},
				{ status: 403 },
			);
		}
	}

	try {
		await db
			.delete(agentPermission)
			.where(eq(agentPermission.id, permissionId));
		audit.log({
			eventType: "scope.removed",
			orgId: "",
			actorId: session.user.id,
			agentId: perm.agentId,
			targetId: permissionId,
			targetType: "agentPermission",
		});
		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json(
			{ error: "Failed to remove scope" },
			{ status: 500 },
		);
	}
}
