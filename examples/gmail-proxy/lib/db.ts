import { eq } from "drizzle-orm";
import { db } from "./db/index";
import { settings, eventLog } from "./db/schema";

export { db } from "./db/index";
export * as schema from "./db/schema";

export async function getSetting(key: string): Promise<string | undefined> {
	const rows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, key))
		.limit(1);
	return rows[0]?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
	await db
		.insert(settings)
		.values({ key, value })
		.onConflictDoUpdate({
			target: settings.key,
			set: { value },
		});
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
