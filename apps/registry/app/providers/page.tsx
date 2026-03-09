import { eq } from "drizzle-orm";
import Link from "next/link";
import { BetterAuthLogo } from "@/components/icons/logo";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";

export default async function ProvidersPage() {
	const providers = await db
		.select()
		.from(provider)
		.where(eq(provider.status, "active"));

	return (
		<div className="min-h-dvh flex flex-col">
			<nav className="shrink-0 flex items-center border-b border-foreground/[0.06]">
				<Link href="/" className="flex items-center gap-2 px-5 sm:px-6 py-3">
					<BetterAuthLogo className="h-4 w-4" />
					<p className="select-none font-mono text-xs uppercase tracking-wider text-foreground/70">
						Better Auth
					</p>
				</Link>
				<div className="ml-auto flex items-center gap-2 px-5 sm:px-6">
					<Link
						href="/providers"
						className="text-[11px] font-mono text-foreground/70 transition-colors"
					>
						Browse
					</Link>
					<span className="text-foreground/15 text-[10px] select-none">/</span>
					<Link
						href="/submit"
						className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
					>
						Submit
					</Link>
					<span className="text-foreground/15 text-[10px] select-none ml-2">
						|
					</span>
					<ThemeToggle />
				</div>
			</nav>

			<div className="border-b border-foreground/[0.06] px-5 sm:px-6 py-4">
				<div className="max-w-2xl mx-auto">
					<SearchBar />
				</div>
			</div>

			<div className="flex-1 px-5 sm:px-6 lg:px-8 py-8">
				<div className="flex items-center justify-between mb-6">
					<h1 className="text-[11px] font-mono uppercase tracking-wider text-foreground/40">
						All Providers ({providers.length})
					</h1>
				</div>

				{providers.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{providers.map((p) => (
							<ProviderCard
								key={p.id}
								name={p.name}
								displayName={p.displayName}
								description={p.description}
								categories={JSON.parse(p.categories) as string[]}
								verified={p.verified}
								modes={JSON.parse(p.modes) as string[]}
								url={p.url}
							/>
						))}
					</div>
				) : (
					<div className="text-center py-16 space-y-3">
						<p className="text-sm text-foreground/40">
							No providers registered yet.
						</p>
						<Link
							href="/submit"
							className="inline-flex items-center gap-2 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2 transition-all text-xs font-mono text-foreground/60"
						>
							Submit the first provider
						</Link>
					</div>
				)}
			</div>
		</div>
	);
}
