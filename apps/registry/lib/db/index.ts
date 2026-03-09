import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("registry.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS provider (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    issuer TEXT NOT NULL,
    url TEXT NOT NULL,
    version TEXT NOT NULL,
    modes TEXT NOT NULL DEFAULT '[]',
    approval_methods TEXT NOT NULL DEFAULT '[]',
    algorithms TEXT NOT NULL DEFAULT '[]',
    endpoints TEXT NOT NULL DEFAULT '{}',
    jwks_uri TEXT,
    categories TEXT NOT NULL DEFAULT '[]',
    logo_url TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    last_checked_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });
