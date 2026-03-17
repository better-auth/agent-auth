import Link from "next/link";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";

interface SearchResult {
	algorithms: string[];
	approval_methods: string[];
	categories?: string[];
	description?: string;
	display_name?: string;
	endpoints: Record<string, string>;
	issuer: string;
	modes: string[];
	protocol_version: string;
	provider_name: string;
	url?: string;
	verified?: boolean;
}

async function searchProviders(intent: string) {
	const base =
		process.env.NEXT_PUBLIC_REGISTRY_URL ?? "https://agent-auth.directory";
	const res = await fetch(
		`${base}/api/search?intent=${encodeURIComponent(intent)}&limit=20`,
		{ cache: "no-store" }
	);
	if (!res.ok) {
		return [];
	}
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
						className="font-mono text-[11px] text-foreground/45 transition-colors hover:text-foreground/70"
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
					<SearchBar autoFocus defaultValue={intent} />
				</div>
			</div>

			<div className="flex-1 px-5 py-8 sm:px-6 lg:px-8">
				{intent && (
					<div className="mb-6">
						<p className="font-mono text-[11px] text-foreground/40">
							{results.length} result{results.length !== 1 && "s"} for intent
							&ldquo;{intent}&rdquo;
						</p>
					</div>
				)}

				{results.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{results.map((p) => (
							<ProviderCard
								categories={p.categories ?? []}
								description={p.description ?? ""}
								displayName={p.display_name ?? p.provider_name}
								key={p.provider_name}
								modes={p.modes}
								name={p.provider_name}
								url={p.url ?? p.issuer}
								verified={p.verified ?? false}
							/>
						))}
					</div>
				) : intent ? (
					<div className="space-y-3 py-16 text-center">
						<p className="text-foreground/40 text-sm">
							No providers match this intent.
						</p>
						<p className="font-mono text-[11px] text-foreground/25">
							Try a different search, or{" "}
							<Link
								className="text-foreground/40 underline underline-offset-2 transition-colors hover:text-foreground/60"
								href="/submit"
							>
								submit a provider
							</Link>
						</p>
					</div>
				) : (
					<div className="py-16 text-center">
						<p className="text-foreground/40 text-sm">
							Enter an intent to search for providers.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
