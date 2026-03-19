import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import type { ProviderConfig } from "@/lib/discover";
import { rankByIntent } from "@/lib/intent-search";
import { safeJsonParse } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const intent = searchParams.get("intent")?.trim();
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "10")));

    if (!intent) {
      return Response.json({ error: "intent query parameter is required" }, { status: 400 });
    }

    const rows = await db
      .select()
      .from(provider)
      .where(and(eq(provider.status, "active"), eq(provider.public, true)));

    const searchable = rows.map((row) => ({
      ...row,
      displayName: row.displayName,
      categories: safeJsonParse<string[]>(row.categories, []),
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
      algorithms: safeJsonParse<string[]>(row.algorithms, []),
      modes: safeJsonParse<string[]>(row.modes, []),
      approval_methods: safeJsonParse<string[]>(row.approvalMethods, []),
      endpoints: safeJsonParse<Record<string, string>>(row.endpoints, {}),
      jwks_uri: row.jwksUri ?? undefined,
      display_name: row.displayName,
      url: row.url,
      categories: row.categories,
      verified: row.verified,
    }));

    return Response.json({ providers, intent, count: providers.length });
  } catch (err) {
    console.error("GET /api/search failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
