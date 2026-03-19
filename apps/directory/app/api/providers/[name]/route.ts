import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import type { ProviderConfig } from "@/lib/discover";
import { requireAdmin, safeJsonParse } from "@/lib/utils";

function toProviderConfig(row: typeof provider.$inferSelect): ProviderConfig {
  return {
    version: row.version,
    provider_name: row.name,
    description: row.description,
    issuer: row.issuer,
    algorithms: safeJsonParse<string[]>(row.algorithms, []),
    modes: safeJsonParse<string[]>(row.modes, []),
    approval_methods: safeJsonParse<string[]>(row.approvalMethods, []),
    endpoints: safeJsonParse<Record<string, string>>(row.endpoints, {}),
    jwks_uri: row.jwksUri ?? undefined,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name: encodedName } = await params;
    const name = decodeURIComponent(encodedName);
    const [row] = await db.select().from(provider).where(eq(provider.name, name)).limit(1);

    if (!row) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    return Response.json({
      ...toProviderConfig(row),
      display_name: row.displayName,
      url: row.url,
      categories: safeJsonParse<string[]>(row.categories, []),
      logo_url: row.logoUrl,
      verified: row.verified,
      status: row.status,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    });
  } catch (err) {
    console.error("GET /api/providers/[name] failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { name: encodedName } = await params;
    const name = decodeURIComponent(encodedName);
    const body = (await request.json()) as {
      displayName?: string;
      description?: string;
      categories?: string[];
      logoUrl?: string | null;
      status?: string;
      verified?: boolean;
      public?: boolean;
    };

    const [existing] = await db.select().from(provider).where(eq(provider.name, name)).limit(1);

    if (!existing) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.description !== undefined) updates.description = body.description;
    if (body.categories !== undefined) updates.categories = JSON.stringify(body.categories);
    if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl;
    if (body.status !== undefined) updates.status = body.status;
    if (body.verified !== undefined) updates.verified = body.verified;
    if (body.public !== undefined) updates.public = body.public;

    await db.update(provider).set(updates).where(eq(provider.name, name));

    return Response.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/providers/[name] failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { name: encodedName } = await params;
    const name = decodeURIComponent(encodedName);

    const [existing] = await db.select().from(provider).where(eq(provider.name, name)).limit(1);

    if (!existing) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    await db.delete(provider).where(eq(provider.name, name));

    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/providers/[name] failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
