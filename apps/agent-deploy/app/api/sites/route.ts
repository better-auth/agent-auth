import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deployment, site } from "@/lib/db/schema";
import {
	logActivity,
	requireScope,
	resolveAuth,
} from "@/lib/resolve-auth";

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48);
}

function uniqueSlug(base: string): string {
	let slug = base;
	let attempt = 0;
	while (db.select().from(site).where(eq(site.slug, slug)).get()) {
		attempt++;
		slug = `${base}-${attempt}`;
	}
	return slug;
}

export async function GET(req: Request) {
	const authResult = await resolveAuth(req);
	if (!authResult)
		return Response.json({ error: "Unauthorized" }, { status: 401 });

	const denied = requireScope(authResult, "list_sites");
	if (denied) return denied;

	const sites = db
		.select()
		.from(site)
		.where(eq(site.userId, authResult.userId))
		.orderBy(desc(site.updatedAt))
		.all();

	const enriched = sites.map((s) => {
		const latestDeploy = db
			.select()
			.from(deployment)
			.where(eq(deployment.siteId, s.id))
			.orderBy(desc(deployment.createdAt))
			.limit(1)
			.all()[0];

		const deployCount = db
			.select()
			.from(deployment)
			.where(eq(deployment.siteId, s.id))
			.all().length;

		return {
			...s,
			url: `/s/${s.slug}`,
			latestDeployment: latestDeploy
				? { ...latestDeploy, html: undefined }
				: null,
			deploymentCount: deployCount,
		};
	});

	logActivity(authResult, "list_sites");
	return Response.json(enriched);
}

export async function POST(req: Request) {
	const authResult = await resolveAuth(req);
	if (!authResult)
		return Response.json({ error: "Unauthorized" }, { status: 401 });

	const denied = requireScope(authResult, "create_site");
	if (denied) return denied;

	const body = (await req.json()) as { name: string };

	if (!body.name) {
		return Response.json({ error: "name is required" }, { status: 400 });
	}

	const now = new Date().toISOString();
	const slug = uniqueSlug(slugify(body.name));
	const newSite = {
		id: crypto.randomUUID(),
		name: body.name,
		slug,
		userId: authResult.userId,
		status: "active",
		createdAt: now,
		updatedAt: now,
	};

	db.insert(site).values(newSite).run();

	logActivity(
		authResult,
		"create_site",
		"site",
		newSite.id,
		`Created site: ${body.name}`,
	);

	return Response.json({ ...newSite, url: `/s/${slug}` }, { status: 201 });
}
