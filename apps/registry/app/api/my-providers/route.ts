import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import { safeJsonParse } from "@/lib/utils";

export async function GET(request: Request) {
	try {
		const session = await auth.api.getSession({
			headers: request.headers,
		});

		if (!session) {
			return Response.json(
				{ error: "Sign in to view your providers" },
				{ status: 401 },
			);
		}

		const rows = await db
			.select()
			.from(provider)
			.where(eq(provider.submittedBy, session.user.id));

		return Response.json({
			providers: rows.map((row) => ({
				id: row.id,
				name: row.name,
				displayName: row.displayName,
				description: row.description,
				url: row.url,
				issuer: row.issuer,
				version: row.version,
				modes: safeJsonParse<string[]>(row.modes, []),
				categories: safeJsonParse<string[]>(row.categories, []),
				logoUrl: row.logoUrl,
				public: row.public,
				verified: row.verified,
				status: row.status,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			})),
		});
	} catch (err) {
		console.error("GET /api/my-providers failed:", err);
		return Response.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
