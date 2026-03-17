import Database from "better-sqlite3";

export const db = new Database("gmail-proxy.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    actorId TEXT,
    actorType TEXT,
    agentId TEXT,
    hostId TEXT,
    orgId TEXT,
    data TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

export function getSetting(key: string): string | undefined {
	const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
		| { value: string }
		| undefined;
	return row?.value;
}

export function setSetting(key: string, value: string): void {
	db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
		key,
		value
	);
}

export const insertLog = db.prepare(
	`INSERT INTO event_log (type, actorId, actorType, agentId, hostId, orgId, data, createdAt)
	 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
);
