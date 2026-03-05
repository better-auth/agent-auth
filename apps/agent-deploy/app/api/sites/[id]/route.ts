import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { site, deployment } from "@/lib/db/schema";
import {
	logActivity,
	requireScope,
	resolveAuth,
} from "@/lib/resolve-auth";

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const authResult = await resolveAuth(req);
	if (!authResult)
		return Response.json({ error: "Unauthorized" }, { status: 401 });

	const denied = requireScope(authResult, "get_site");
	if (denied) return denied;

	const { id } = await params;

	const s = db
		.select()
		.from(site)
		.where(and(eq(site.id, id), eq(site.userId, authResult.userId)))
		.get();

	if (!s) return Response.json({ error: "Not found" }, { status: 404 });

	const deployments = db
		.select({
			id: deployment.id,
			siteId: deployment.siteId,
			label: deployment.label,
			status: deployment.status,
			url: deployment.url,
			size: deployment.size,
			createdAt: deployment.createdAt,
		})
		.from(deployment)
		.where(eq(deployment.siteId, id))
		.orderBy(desc(deployment.createdAt))
		.all();

	logActivity(authResult, "get_site", "site", id);

	return Response.json({
		...s,
		url: `/s/${s.slug}`,
		deployments,
	});
}

export async function DELETE(
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const authResult = await resolveAuth(req);
	if (!authResult)
		return Response.json({ error: "Unauthorized" }, { status: 401 });

	const denied = requireScope(authResult, "delete_site");
	if (denied) return denied;

	const { id } = await params;

	const s = db
		.select()
		.from(site)
		.where(and(eq(site.id, id), eq(site.userId, authResult.userId)))
		.get();

	if (!s) return Response.json({ error: "Not found" }, { status: 404 });

	db.delete(site).where(eq(site.id, id)).run();

	logActivity(
		authResult,
		"delete_site",
		"site",
		id,
		`Deleted site: ${s.name}`,
	);

	return Response.json({ deleted: true });
}
