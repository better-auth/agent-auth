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

	const denied = requireScope(authResult, "deploy");
	if (denied) return denied;

	const { id } = await params;

	const s = db
		.select()
		.from(site)
		.where(and(eq(site.id, id), eq(site.userId, authResult.userId)))
		.get();

	if (!s) return Response.json({ error: "Site not found" }, { status: 404 });

	const body = (await req.json()) as { html: string; label?: string };

	if (!body.html) {
		return Response.json(
			{ error: "html is required — pass the full HTML document" },
			{ status: 400 },
		);
	}

	db.update(deployment)
		.set({ status: "superseded" })
		.where(
			and(eq(deployment.siteId, id), eq(deployment.status, "live")),
		)
		.run();

	const depId = crypto.randomUUID();
	const size = new TextEncoder().encode(body.html).length;
	const url = `/s/${s.slug}`;

	db.insert(deployment)
		.values({
			id: depId,
			siteId: id,
			html: body.html,
			label: body.label ?? null,
			status: "live",
			url,
			size,
			createdAt: new Date().toISOString(),
		})
		.run();

	db.update(site)
		.set({ updatedAt: new Date().toISOString() })
		.where(eq(site.id, id))
		.run();

	logActivity(
		authResult,
		"deploy",
		"deployment",
		depId,
		`Deployed to ${s.name} (${formatBytes(size)})`,
	);

	return Response.json(
		{
			deploymentId: depId,
			status: "live",
			url,
			size,
			siteSlug: s.slug,
			message: `Deployed! Live at ${url}`,
		},
		{ status: 201 },
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}
