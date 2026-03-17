import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";

async function getSessionAndProvider(request: Request, encodedName: string) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return {
			error: Response.json(
				{ error: "Sign in to manage your providers" },
				{ status: 401 },
			),
		};
	}

	const name = decodeURIComponent(encodedName);
	const [row] = await db
		.select()
		.from(provider)
		.where(
			and(
				eq(provider.name, name),
				eq(provider.submittedBy, session.user.id),
			),
		)
		.limit(1);

	if (!row) {
		return {
			error: Response.json(
				{ error: "Provider not found or you don't own it" },
				{ status: 404 },
			),
		};
	}

	return { session, row, name };
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	try {
		const { name: encodedName } = await params;
		const result = await getSessionAndProvider(request, encodedName);
		if ("error" in result) return result.error;

		const body = (await request.json()) as {
			displayName?: string;
			description?: string;
			categories?: string[];
			logoUrl?: string | null;
			public?: boolean;
		};

		const updates: Record<string, unknown> = {
			updatedAt: new Date().toISOString(),
		};

		if (body.displayName !== undefined)
			updates.displayName = body.displayName;
		if (body.description !== undefined)
			updates.description = body.description;
		if (body.categories !== undefined)
			updates.categories = JSON.stringify(body.categories);
		if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl;
		if (body.public !== undefined) updates.public = body.public;

		await db
			.update(provider)
			.set(updates)
			.where(eq(provider.name, result.name));

		return Response.json({ ok: true });
	} catch (err) {
		console.error("PATCH /api/my-providers/[name] failed:", err);
		return Response.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	try {
		const { name: encodedName } = await params;
		const result = await getSessionAndProvider(request, encodedName);
		if ("error" in result) return result.error;

		await db.delete(provider).where(eq(provider.name, result.name));

		return Response.json({ ok: true });
	} catch (err) {
		console.error("DELETE /api/my-providers/[name] failed:", err);
		return Response.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
