import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import { discoverProvider } from "@/lib/discover";

const SEED_PROVIDERS = [
	{
		url: "http://localhost:4100",
		displayName: "Agent Deploy",
		categories: ["deployment", "hosting", "static-sites"],
	},
	{
		url: "http://localhost:3000",
		displayName: "Agent Auth IDP",
		categories: ["identity", "authentication", "gateway"],
	},
];

/**
 * GET /api/seed — Seed the database with local development providers.
 * Attempts to discover each provider's .well-known endpoint.
 * Skips providers that are already registered.
 */
export async function GET() {
	const results: Array<{
		url: string;
		status: "created" | "exists" | "unreachable";
		name?: string;
	}> = [];

	for (const entry of SEED_PROVIDERS) {
		const normalized = entry.url.replace(/\/+$/, "");

		const [existing] = await db
			.select()
			.from(provider)
			.where(eq(provider.url, normalized))
			.limit(1);

		if (existing) {
			results.push({
				url: entry.url,
				status: "exists",
				name: existing.name,
			});
			continue;
		}

		const config = await discoverProvider(normalized);

		if (!config) {
			results.push({ url: entry.url, status: "unreachable" });
			continue;
		}

		const now = new Date().toISOString();
		const id = crypto.randomUUID();

		await db.insert(provider).values({
			id,
			name: config.provider_name,
			displayName: entry.displayName,
			description: config.description ?? "",
			issuer: config.issuer,
			url: normalized,
			protocolVersion: config.protocol_version,
			modes: JSON.stringify(config.modes),
			approvalMethods: JSON.stringify(config.approval_methods),
			algorithms: JSON.stringify(config.algorithms),
			endpoints: JSON.stringify(config.endpoints),
			jwksUri: config.jwks_uri ?? null,
			categories: JSON.stringify(entry.categories),
			logoUrl: null,
			verified: true,
			lastCheckedAt: now,
			status: "active",
			createdAt: now,
			updatedAt: now,
		});

		results.push({
			url: entry.url,
			status: "created",
			name: config.provider_name,
		});
	}

	return Response.json({ seeded: results });
}
