import { eq, and } from "drizzle-orm";
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

	const denied = requireScope(authResult, "list_deployments");
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

	logActivity(authResult, "get_deployment", "deployment", id);

	return Response.json({
		...dep,
		html: undefined,
		siteName: s.name,
		siteSlug: s.slug,
	});
}
