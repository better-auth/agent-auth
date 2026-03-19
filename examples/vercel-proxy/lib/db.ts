import { eq, and, sql } from "drizzle-orm";
import { db } from "./db/index";
import { settings, eventLog, autonomousProjects } from "./db/schema";

export { db } from "./db/index";
export * as schema from "./db/schema";

const settingsCache = new Map<string, string>();
let settingsLoaded = false;

async function loadSettings() {
  if (settingsLoaded) return;
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
  for (const row of rows) {
    settingsCache.set(row.key, row.value);
  }
  settingsLoaded = true;
}

export function getSetting(key: string): string | undefined {
  return settingsCache.get(key);
}

export async function ensureSettings(): Promise<void> {
  await loadSettings();
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({
    target: settings.key,
    set: { value },
  });
  settingsCache.set(key, value);
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

export async function trackAutonomousProject(
  hostId: string,
  projectId: string,
  projectName?: string,
): Promise<void> {
  await db
    .insert(autonomousProjects)
    .values({ hostId, projectId, projectName: projectName ?? null })
    .onConflictDoNothing();
}

export async function getUntransferredProjects(
  hostId: string,
): Promise<Array<{ projectId: string; projectName: string | null }>> {
  return db
    .select({
      projectId: autonomousProjects.projectId,
      projectName: autonomousProjects.projectName,
    })
    .from(autonomousProjects)
    .where(and(eq(autonomousProjects.hostId, hostId), eq(autonomousProjects.transferred, false)));
}

export async function markProjectTransferred(projectId: string): Promise<void> {
  await db
    .update(autonomousProjects)
    .set({ transferred: true })
    .where(eq(autonomousProjects.projectId, projectId));
}
