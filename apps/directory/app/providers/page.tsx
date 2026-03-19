import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import { safeJsonParse } from "@/lib/utils";

const PAGE_SIZE = 24;

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1"));
  const offset = (page - 1) * PAGE_SIZE;

  const publicActive = and(eq(provider.status, "active"), eq(provider.public, true));

  const [providers, countResult] = await Promise.all([
    db.select().from(provider).where(publicActive).limit(PAGE_SIZE).offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(provider)
      .where(publicActive),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-dvh flex flex-col">
      <Nav />

      <div className="border-b border-foreground/[0.06] px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <SearchBar />
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[11px] font-mono uppercase tracking-wider text-foreground/40">
            All Providers ({total})
          </h1>
          <a
            href="https://agent-auth-protocol.com/specification/v1.0-draft#611-directory"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-foreground/25 hover:text-foreground/50 transition-colors"
          >
            §6.11 Directory
          </a>
        </div>

        {providers.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  name={p.name}
                  displayName={p.displayName}
                  description={p.description}
                  categories={safeJsonParse<string[]>(p.categories, [])}
                  verified={p.verified}
                  modes={safeJsonParse<string[]>(p.modes, [])}
                  url={p.url}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                {page > 1 && (
                  <Link
                    href={`/providers?page=${page - 1}`}
                    className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 border border-foreground/[0.08] px-3 py-1.5 transition-colors"
                  >
                    ← Prev
                  </Link>
                )}
                <span className="text-[11px] font-mono text-foreground/30 px-2">
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={`/providers?page=${page + 1}`}
                    className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 border border-foreground/[0.08] px-3 py-1.5 transition-colors"
                  >
                    Next →
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm text-foreground/40">No providers registered yet.</p>
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
