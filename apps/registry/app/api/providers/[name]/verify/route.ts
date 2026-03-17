import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { provider } from "@/lib/db/schema";
import { discoverProvider } from "@/lib/discover";

export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ name: string }> }
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

	const config = await discoverProvider(existing.url);
	const now = new Date().toISOString();

	if (!config) {
		await db
			.update(provider)
			.set({
				verified: false,
				lastCheckedAt: now,
				updatedAt: now,
			})
			.where(eq(provider.name, name));

		return Response.json({
			verified: false,
			error: "Could not reach the discovery endpoint",
		});
	}

	await db
		.update(provider)
		.set({
			description: config.description ?? existing.description,
			issuer: config.issuer,
			version: config.version,
			modes: JSON.stringify(config.modes),
			approvalMethods: JSON.stringify(config.approval_methods),
			algorithms: JSON.stringify(config.algorithms),
			endpoints: JSON.stringify(config.endpoints),
			jwksUri: config.jwks_uri ?? null,
			verified: true,
			lastCheckedAt: now,
			updatedAt: now,
		})
		.where(eq(provider.name, name));

	return Response.json({ verified: true, config });
}
