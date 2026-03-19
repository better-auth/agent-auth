import Link from "next/link";
import { Nav } from "@/components/nav";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";

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
  const base =
    process.env.NEXT_PUBLIC_DIRECTORY_URL ?? `http://localhost:${process.env.PORT ?? "4200"}`;
  const res = await fetch(`${base}/api/search?intent=${encodeURIComponent(intent)}&limit=20`, {
    cache: "no-store",
  });
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
      <Nav />

      <div className="border-b border-foreground/[0.06] px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <SearchBar defaultValue={intent} autoFocus />
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        {intent && (
          <div className="mb-6">
            <p className="text-[11px] font-mono text-foreground/40">
              {results.length} result{results.length !== 1 && "s"} for intent &ldquo;{intent}&rdquo;
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
            <p className="text-sm text-foreground/40">No providers match this intent.</p>
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
            <p className="text-sm text-foreground/40">Enter an intent to search for providers.</p>
          </div>
        )}
      </div>
    </div>
  );
}
