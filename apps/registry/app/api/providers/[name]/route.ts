import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import type { ProviderConfig } from "@/lib/discover";

function toProviderConfig(row: typeof provider.$inferSelect): ProviderConfig {
	return {
		version: row.version,
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

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name: encodedName } = await params;
	const name = decodeURIComponent(encodedName);
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

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name: encodedName } = await params;
	const name = decodeURIComponent(encodedName);
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

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name: encodedName } = await params;
	const name = decodeURIComponent(encodedName);

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
