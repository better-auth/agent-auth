import Link from "next/link";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";

interface SearchResult {
	protocol_version: string;
	provider_name: string;
	description?: string;
	issuer: string;
	algorithms: string[];
	modes: string[];
	approval_methods: string[];
	endpoints: Record<string, string>;
	display_name?: string;
	url?: string;
	categories?: string[];
	verified?: boolean;
}

async function searchProviders(intent: string) {
	const base = process.env.NEXT_PUBLIC_REGISTRY_URL ?? "https://agent-auth.directory";
	const res = await fetch(
		`${base}/api/search?intent=${encodeURIComponent(intent)}&limit=20`,
		{ cache: "no-store" },
	);
	if (!res.ok) return [];
	const data = (await res.json()) as { providers: SearchResult[] };
	return data.providers;
}

export default async function SearchPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { q } = await searchParams;
	const intent = q?.trim() ?? "";
	const results = intent ? await searchProviders(intent) : [];

	return (
		<div className="min-h-dvh flex flex-col">
			<nav className="shrink-0 flex items-center border-b border-foreground/[0.06]">
				<Link href="/" className="flex items-center gap-2.5 px-5 sm:px-6 py-3">
					<AgentAuthLogo className="h-3.5 w-auto" />
					<p className="select-none font-mono text-xs uppercase tracking-wider text-foreground/70">
						Agent-Auth
					</p>
				</Link>
				<div className="ml-auto flex items-center gap-2 px-5 sm:px-6">
					<Link
						href="/providers"
						className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
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
					<SearchBar defaultValue={intent} autoFocus />
				</div>
			</div>

			<div className="flex-1 px-5 sm:px-6 lg:px-8 py-8">
				{intent && (
					<div className="mb-6">
						<p className="text-[11px] font-mono text-foreground/40">
							{results.length} result{results.length !== 1 && "s"} for intent
							&ldquo;{intent}&rdquo;
						</p>
					</div>
				)}

				{results.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{results.map((p) => (
							<ProviderCard
								key={p.provider_name}
								name={p.provider_name}
								displayName={p.display_name ?? p.provider_name}
								description={p.description ?? ""}
								categories={p.categories ?? []}
								verified={p.verified ?? false}
								modes={p.modes}
								url={p.url ?? p.issuer}
							/>
						))}
					</div>
				) : intent ? (
					<div className="text-center py-16 space-y-3">
						<p className="text-sm text-foreground/40">
							No providers match this intent.
						</p>
						<p className="text-[11px] font-mono text-foreground/25">
							Try a different search, or{" "}
							<Link
								href="/submit"
								className="text-foreground/40 hover:text-foreground/60 underline underline-offset-2 transition-colors"
							>
								submit a provider
							</Link>
						</p>
					</div>
				) : (
					<div className="text-center py-16">
						<p className="text-sm text-foreground/40">
							Enter an intent to search for providers.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
