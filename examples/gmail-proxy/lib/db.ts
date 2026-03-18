import { eq } from "drizzle-orm";
import { db } from "./db/index";
import { settings, eventLog } from "./db/schema";

export { db } from "./db/index";
export * as schema from "./db/schema";

// In-memory settings cache for sync access in auth config callbacks.
// Postgres queries are async, but agentAuth callbacks (freshSessionWindow,
// resolveApprovalMethod) require sync return values.
const settingsCache = new Map<string, string>();
let cacheLoaded = false;

async function loadSettingsCache(): Promise<void> {
	const rows = await db.select().from(settings);
	settingsCache.clear();
	for (const row of rows) {
		settingsCache.set(row.key, row.value);
	}
	cacheLoaded = true;
}

const cacheReady = loadSettingsCache().catch(() => {});

export function getSetting(key: string): string | undefined {
	return settingsCache.get(key);
}

export async function getSettingAsync(
	key: string,
): Promise<string | undefined> {
	if (!cacheLoaded) await cacheReady;
	const rows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, key))
		.limit(1);
	return rows[0]?.value;
}

export async function setSettingAsync(
	key: string,
	value: string,
): Promise<void> {
	await db
		.insert(settings)
		.values({ key, value })
		.onConflictDoUpdate({
			target: settings.key,
			set: { value },
		});
	settingsCache.set(key, value);
}

export async function insertLogAsync(
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
