import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const sqliteInstance = new Database("agent-deploy.db");
const sqlite = sqliteInstance;
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  -- Better Auth core tables
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    isAnonymous INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    expiresAt TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    accessTokenExpiresAt TEXT,
    scope TEXT,
    password TEXT,
    idToken TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- Device Authorization plugin table (table name: deviceCode)
  CREATE TABLE IF NOT EXISTS deviceCode (
    id TEXT PRIMARY KEY,
    deviceCode TEXT NOT NULL UNIQUE,
    userCode TEXT NOT NULL UNIQUE,
    userId TEXT,
    expiresAt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    lastPolledAt TEXT,
    pollingInterval INTEGER DEFAULT 5,
    clientId TEXT,
    scope TEXT
  );

  -- Agent Auth plugin tables
  CREATE TABLE IF NOT EXISTS agentHost (
    id TEXT PRIMARY KEY,
    name TEXT,
    userId TEXT REFERENCES user(id) ON DELETE CASCADE,
    referenceId TEXT,
    scopes TEXT,
    publicKey TEXT,
    kid TEXT,
    jwksUrl TEXT,
    enrollmentTokenHash TEXT,
    enrollmentTokenExpiresAt TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    activatedAt TEXT,
    expiresAt TEXT,
    lastUsedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    userId TEXT REFERENCES user(id) ON DELETE CASCADE,
    hostId TEXT NOT NULL REFERENCES agentHost(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    mode TEXT NOT NULL DEFAULT 'delegated',
    publicKey TEXT NOT NULL,
    kid TEXT,
    jwksUrl TEXT,
    lastUsedAt TEXT,
    activatedAt TEXT,
    expiresAt TEXT,
    metadata TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agentPermission (
    id TEXT PRIMARY KEY,
    agentId TEXT NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    referenceId TEXT,
    grantedBy TEXT,
    expiresAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    reason TEXT
  );

  CREATE TABLE IF NOT EXISTS cibaAuthRequest (
    id TEXT PRIMARY KEY,
    clientId TEXT NOT NULL,
    loginHint TEXT NOT NULL,
    userId TEXT REFERENCES user(id),
    scope TEXT,
    bindingMessage TEXT,
    clientNotificationToken TEXT,
    clientNotificationEndpoint TEXT,
    deliveryMode TEXT NOT NULL DEFAULT 'poll',
    status TEXT NOT NULL DEFAULT 'pending',
    "interval" INTEGER NOT NULL DEFAULT 5,
    lastPolledAt TEXT,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- App-specific tables
  CREATE TABLE IF NOT EXISTS site (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deployment (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    html TEXT NOT NULL,
    label TEXT,
    status TEXT NOT NULL DEFAULT 'live',
    url TEXT,
    size INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_activity (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    created_at TEXT NOT NULL
  );
`);

const userColumns = sqlite
	.prepare("PRAGMA table_info(user)")
	.all() as Array<{ name: string }>;
if (!userColumns.some((column) => column.name === "isAnonymous")) {
	sqlite.exec(
		"ALTER TABLE user ADD COLUMN isAnonymous INTEGER NOT NULL DEFAULT 0;",
	);
}

export const db = drizzle(sqlite, { schema });
