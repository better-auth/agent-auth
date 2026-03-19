import { eq, and, desc, count } from "drizzle-orm";
import { db } from "./db/index";
import { site, eventLog } from "./db/schema";

export { db } from "./db/index";
export * as schema from "./db/schema";

export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniqueSlug(name: string): string {
  const base = slugify(name);
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base}-${suffix}`;
}

interface SiteRow {
  id: string;
  name: string;
  slug: string;
  html: string;
  description: string | null;
  userId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function insertLog(
  type: string | null,
  actorId: string | null,
  actorType: string | null,
  agentId: string | null,
  hostId: string | null,
  orgId: string | null,
  data: string | null,
): Promise<void> {
  await db.insert(eventLog).values({
    type: type ?? "unknown",
    actorId,
    actorType,
    agentId,
    hostId,
    orgId,
    data,
  });
}

export async function createSite(params: {
  name: string;
  html: string;
  description?: string;
  userId: string;
}): Promise<SiteRow> {
  const id = generateId();
  const slug = uniqueSlug(params.name);
  const [row] = await db
    .insert(site)
    .values({
      id,
      name: params.name,
      slug,
      html: params.html,
      description: params.description ?? "",
      userId: params.userId,
    })
    .returning();
  return row;
}

export async function updateSite(params: {
  id: string;
  userId: string;
  name?: string;
  html?: string;
  description?: string;
}): Promise<SiteRow | null> {
  const existing = await db
    .select()
    .from(site)
    .where(and(eq(site.id, params.id), eq(site.userId, params.userId), eq(site.status, "active")))
    .limit(1);
  if (existing.length === 0) return null;

  const updates: Partial<{
    name: string;
    html: string;
    description: string;
  }> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.html !== undefined) updates.html = params.html;
  if (params.description !== undefined) updates.description = params.description;

  const [row] = await db.update(site).set(updates).where(eq(site.id, params.id)).returning();
  return row;
}

export async function deleteSite(id: string, userId: string): Promise<boolean> {
  const result = await db
    .update(site)
    .set({ status: "deleted" })
    .where(and(eq(site.id, id), eq(site.userId, userId), eq(site.status, "active")))
    .returning({ id: site.id });
  return result.length > 0;
}

export async function getSite(id: string): Promise<SiteRow | null> {
  const rows = await db
    .select()
    .from(site)
    .where(and(eq(site.id, id), eq(site.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSiteBySlug(slug: string): Promise<SiteRow | null> {
  const rows = await db
    .select()
    .from(site)
    .where(and(eq(site.slug, slug), eq(site.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSites(userId: string): Promise<SiteRow[]> {
  return db
    .select()
    .from(site)
    .where(and(eq(site.userId, userId), eq(site.status, "active")))
    .orderBy(desc(site.updatedAt));
}

export async function countSites(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(site)
    .where(and(eq(site.userId, userId), eq(site.status, "active")));
  return row?.count ?? 0;
}
