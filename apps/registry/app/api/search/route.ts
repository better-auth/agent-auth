import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { provider } from "@/lib/db/schema";
import type { ProviderConfig } from "@/lib/discover";
import { rankByIntent } from "@/lib/intent-search";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const intent = searchParams.get("intent")?.trim();
	const limit = Math.min(
		50,
		Math.max(1, Number(searchParams.get("limit") ?? "10"))
	);

	if (!intent) {
		return Response.json(
			{ error: "intent query parameter is required" },
			{ status: 400 }
		);
	}

	const rows = await db
		.select()
		.from(provider)
		.where(eq(provider.status, "active"));

	const searchable = rows.map((row) => ({
		...row,
		displayName: row.displayName,
		categories: JSON.parse(row.categories) as string[],
	}));

	const ranked = await rankByIntent(searchable, intent);
	const limited = ranked.slice(0, limit);

	const providers: (ProviderConfig & {
		display_name: string;
		url: string;
		categories: string[];
		verified: boolean;
	})[] = limited.map((row) => ({
		version: row.version,
		provider_name: row.name,
		description: row.description,
		issuer: row.issuer,
		algorithms: JSON.parse(row.algorithms) as string[],
		modes: JSON.parse(row.modes) as string[],
		approval_methods: JSON.parse(row.approvalMethods) as string[],
		endpoints: JSON.parse(row.endpoints) as Record<string, string>,
		jwks_uri: row.jwksUri ?? undefined,
		display_name: row.displayName,
		url: row.url,
		categories: row.categories,
		verified: row.verified,
	}));

	return Response.json({ providers, intent, count: providers.length });
}
