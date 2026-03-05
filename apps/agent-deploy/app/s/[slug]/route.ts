import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { site, deployment } from "@/lib/db/schema";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const { slug } = await params;

	const s = db.select().from(site).where(eq(site.slug, slug)).get();

	if (!s) {
		return new Response(
			`<!DOCTYPE html><html><head><title>Not Found</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}h1{font-weight:400;font-size:1.25rem;color:#a1a1aa}</style></head><body><h1>Site not found</h1></body></html>`,
			{
				status: 404,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			},
		);
	}

	const liveDeploy = db
		.select()
		.from(deployment)
		.where(
			and(eq(deployment.siteId, s.id), eq(deployment.status, "live")),
		)
		.get();

	if (!liveDeploy) {
		return new Response(
			`<!DOCTYPE html><html><head><title>${s.name}</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa;flex-direction:column;gap:1rem}h1{font-weight:600;font-size:1.5rem}p{color:#a1a1aa}</style></head><body><h1>${s.name}</h1><p>No deployment yet. Deploy some HTML to see it here.</p></body></html>`,
			{
				status: 200,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			},
		);
	}

	return new Response(liveDeploy.html, {
		status: 200,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "public, max-age=0, must-revalidate",
		},
	});
}
