import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { provider } from "@/lib/db/schema";
import type { ProviderConfig } from "@/lib/discover";
import { discoverProvider } from "@/lib/discover";

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

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
	const limit = Math.min(
		100,
		Math.max(1, Number(searchParams.get("limit") ?? "50"))
	);
	const offset = (page - 1) * limit;

	const rows = await db
		.select()
		.from(provider)
		.where(eq(provider.status, "active"))
		.limit(limit)
		.offset(offset);

	return Response.json({
		providers: rows.map((row) => ({
			...toProviderConfig(row),
			display_name: row.displayName,
			url: row.url,
			categories: JSON.parse(row.categories) as string[],
			logo_url: row.logoUrl,
			verified: row.verified,
			status: row.status,
		})),
		page,
		limit,
	});
}

export async function POST(request: Request) {
	const body = (await request.json()) as {
		url?: string;
		categories?: string[];
		logoUrl?: string;
		displayName?: string;
	};

	if (!body.url) {
		return Response.json({ error: "url is required" }, { status: 400 });
	}

	const normalized = body.url.replace(/\/+$/, "");

	const existing = await db
		.select()
		.from(provider)
		.where(eq(provider.url, normalized))
		.limit(1);

	if (existing.length > 0) {
		return Response.json(
			{
				error: "A provider with this URL is already registered",
				provider: existing[0]?.name,
			},
			{ status: 409 }
		);
	}

	const config = await discoverProvider(normalized);

	if (!config) {
		return Response.json(
			{ error: "Could not discover Agent Auth configuration at this URL" },
			{ status: 422 }
		);
	}

	const now = new Date().toISOString();
	const id = crypto.randomUUID();

	const row = {
		id,
		name: config.provider_name,
		displayName: body.displayName ?? config.provider_name,
		description: config.description ?? "",
		issuer: config.issuer,
		url: normalized,
		version: config.version,
		modes: JSON.stringify(config.modes),
		approvalMethods: JSON.stringify(config.approval_methods),
		algorithms: JSON.stringify(config.algorithms),
		endpoints: JSON.stringify(config.endpoints),
		jwksUri: config.jwks_uri ?? null,
		categories: JSON.stringify(body.categories ?? []),
		logoUrl: body.logoUrl ?? null,
		verified: true,
		lastCheckedAt: now,
		status: "active" as const,
		createdAt: now,
		updatedAt: now,
	};

	await db.insert(provider).values(row);

	return Response.json(
		{
			id,
			name: config.provider_name,
			config: toProviderConfig({ ...row, jwksUri: row.jwksUri }),
		},
		{ status: 201 }
	);
}
