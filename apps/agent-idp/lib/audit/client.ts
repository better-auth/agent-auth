import { createClient } from "@clickhouse/client";
import { env } from "@/lib/env";

let instance: ReturnType<typeof createClient> | null = null;

export function getClickHouseClient() {
	const url = env.CLICKHOUSE_URL;
	if (!url) return null;
	if (!instance) {
		instance = createClient({
			url,
			database: "agent_idp",
		});
	}
	return instance;
}
