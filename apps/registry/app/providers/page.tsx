import { eq } from "drizzle-orm";
import Link from "next/link";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/lib/db/index";
import { provider } from "@/lib/db/schema";

export default async function ProvidersPage() {
	const providers = await db
		.select()
		.from(provider)
		.where(eq(provider.status, "active"));

	return (
		<div className="flex min-h-dvh flex-col">
			<nav className="flex shrink-0 items-center border-foreground/[0.06] border-b">
				<Link className="flex items-center gap-2.5 px-5 py-3 sm:px-6" href="/">
					<AgentAuthLogo className="h-3.5 w-auto" />
					<p className="select-none font-mono text-foreground/70 text-xs uppercase tracking-wider">
						Agent-Auth
					</p>
				</Link>
				<div className="ml-auto flex items-center gap-2 px-5 sm:px-6">
					<Link
						className="font-mono text-[11px] text-foreground/70 transition-colors"
						href="/providers"
					>
						Browse
					</Link>
					<span className="select-none text-[10px] text-foreground/15">/</span>
					<Link
						className="font-mono text-[11px] text-foreground/45 transition-colors hover:text-foreground/70"
						href="/submit"
					>
						Submit
					</Link>
					<span className="ml-2 select-none text-[10px] text-foreground/15">
						|
					</span>
					<ThemeToggle />
				</div>
			</nav>

			<div className="border-foreground/[0.06] border-b px-5 py-4 sm:px-6">
				<div className="mx-auto max-w-2xl">
					<SearchBar />
				</div>
			</div>

			<div className="flex-1 px-5 py-8 sm:px-6 lg:px-8">
				<div className="mb-6 flex items-center justify-between">
					<h1 className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
						All Providers ({providers.length})
					</h1>
				</div>

				{providers.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{providers.map((p) => (
							<ProviderCard
								categories={JSON.parse(p.categories) as string[]}
								description={p.description}
								displayName={p.displayName}
								key={p.id}
								modes={JSON.parse(p.modes) as string[]}
								name={p.name}
								url={p.url}
								verified={p.verified}
							/>
						))}
					</div>
				) : (
					<div className="space-y-3 py-16 text-center">
						<p className="text-foreground/40 text-sm">
							No providers registered yet.
						</p>
						<Link
							className="inline-flex items-center gap-2 border border-foreground/[0.12] bg-foreground/[0.04] px-4 py-2 font-mono text-foreground/60 text-xs transition-all hover:border-foreground/[0.20] hover:bg-foreground/[0.08]"
							href="/submit"
						>
							Submit the first provider
						</Link>
					</div>
				)}
			</div>
		</div>
	);
}
