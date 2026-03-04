import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as betterAuthSchema from "./better-auth-schema";
import * as appSchema from "./schema";

const globalForDb = globalThis as unknown as {
	pgClient: ReturnType<typeof postgres> | undefined;
};

export const client =
	globalForDb.pgClient ?? postgres(env.POSTGRES_URL, { max: 10 });

if (env.IS_DEV) globalForDb.pgClient = client;

export const db = drizzle(client, {
	schema: { ...appSchema, ...betterAuthSchema },
});
