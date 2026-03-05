import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { site, deployment } from "@/lib/db/schema";
import {
	logActivity,
	requireScope,
	resolveAuth,
} from "@/lib/resolve-auth";

export async function POST(
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const authResult = await resolveAuth(req);
	if (!authResult)
		return Response.json({ error: "Unauthorized" }, { status: 401 });

	const denied = requireScope(authResult, "rollback");
	if (denied) return denied;

	const { id } = await params;

	const dep = db
		.select()
		.from(deployment)
		.where(eq(deployment.id, id))
		.get();

	if (!dep)
		return Response.json({ error: "Deployment not found" }, { status: 404 });

	const s = db
		.select()
		.from(site)
		.where(
			and(eq(site.id, dep.siteId), eq(site.userId, authResult.userId)),
		)
		.get();

	if (!s) return Response.json({ error: "Not found" }, { status: 404 });

	db.update(deployment)
		.set({ status: "superseded" })
		.where(
			and(
				eq(deployment.siteId, dep.siteId),
				eq(deployment.status, "live"),
			),
		)
		.run();

	db.update(deployment)
		.set({ status: "live" })
		.where(eq(deployment.id, id))
		.run();

	db.update(site)
		.set({ updatedAt: new Date().toISOString() })
		.where(eq(site.id, dep.siteId))
		.run();

	logActivity(
		authResult,
		"rollback",
		"deployment",
		id,
		`Rolled back ${s.name} to deployment ${id.slice(0, 8)}`,
	);

	return Response.json({
		message: `Rolled back to deployment ${id.slice(0, 8)}`,
		deploymentId: id,
		status: "live",
		url: `/s/${s.slug}`,
	});
}
