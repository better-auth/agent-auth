import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import { safeJsonParse } from "@/lib/utils";
import { MyProvidersList } from "./providers-list";

export default async function MyProvidersPage() {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session) {
		redirect("/");
	}

	const rows = await db
		.select()
		.from(provider)
		.where(eq(provider.submittedBy, session.user.id));

	const providers = rows.map((row) => ({
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
	}));

	return (
		<div className="min-h-dvh flex flex-col">
			<Nav />

			<div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto w-full">
				<div className="space-y-2 mb-8">
					<h1 className="text-lg font-semibold text-foreground">
						My Providers
					</h1>
					<p className="text-xs text-foreground/45 leading-relaxed">
						Manage providers you've submitted to the registry.
					</p>
				</div>

				{providers.length === 0 ? (
					<div className="text-center py-16 space-y-3">
						<p className="text-sm text-foreground/40">
							You haven't submitted any providers yet.
						</p>
						<Link
							href="/submit"
							className="inline-flex items-center gap-2 border border-foreground/12 bg-foreground/4 hover:bg-foreground/8 hover:border-foreground/20 px-4 py-2 transition-all text-xs font-mono text-foreground/60"
						>
							Submit your first provider
						</Link>
					</div>
				) : (
					<MyProvidersList initialProviders={providers} />
				)}
			</div>
		</div>
	);
}
