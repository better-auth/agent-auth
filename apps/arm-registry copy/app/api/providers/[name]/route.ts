import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import type { ProviderConfig } from "@/lib/discover";

function toProviderConfig(row: typeof provider.$inferSelect): ProviderConfig {
	return {
		protocol_version: row.protocolVersion,
		provider_name: row.name,
		description: row.description,
		issuer: row.issuer,
		algorithms: JSON.parse(row.algorithms) as string[],
		modes: JSON.parse(row.modes) as string[],
		approval_methods: JSON.parse(row.approvalMethods) as string[],
		endpoints: JSON.parse(row.endpoints) as Record<string, string>,
		jwks_uri: row.jwksUri ?? undefined,
	};
}

/**
 * GET /api/providers/:name — get a single provider by name
 */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name } = await params;
	const [row] = await db
		.select()
		.from(provider)
		.where(eq(provider.name, name))
		.limit(1);

	if (!row) {
		return Response.json({ error: "Provider not found" }, { status: 404 });
	}

	return Response.json({
		...toProviderConfig(row),
		display_name: row.displayName,
		url: row.url,
		categories: JSON.parse(row.categories) as string[],
		logo_url: row.logoUrl,
		verified: row.verified,
		status: row.status,
		created_at: row.createdAt,
		updated_at: row.updatedAt,
	});
}

/**
 * PATCH /api/providers/:name — update a provider
 */
export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name } = await params;
	const body = (await request.json()) as {
		displayName?: string;
		description?: string;
		categories?: string[];
		logoUrl?: string | null;
		status?: string;
	};

	const [existing] = await db
		.select()
		.from(provider)
		.where(eq(provider.name, name))
		.limit(1);

	if (!existing) {
		return Response.json({ error: "Provider not found" }, { status: 404 });
	}

	const updates: Record<string, unknown> = {
		updatedAt: new Date().toISOString(),
	};

	if (body.displayName !== undefined) updates.displayName = body.displayName;
	if (body.description !== undefined) updates.description = body.description;
	if (body.categories !== undefined)
		updates.categories = JSON.stringify(body.categories);
	if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl;
	if (body.status !== undefined) updates.status = body.status;

	await db.update(provider).set(updates).where(eq(provider.name, name));

	return Response.json({ ok: true });
}

/**
 * DELETE /api/providers/:name — remove a provider
 */
export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name } = await params;

	const [existing] = await db
		.select()
		.from(provider)
		.where(eq(provider.name, name))
		.limit(1);

	if (!existing) {
		return Response.json({ error: "Provider not found" }, { status: 404 });
	}

	await db.delete(provider).where(eq(provider.name, name));

	return Response.json({ ok: true });
}
