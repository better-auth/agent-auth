import Database from "better-sqlite3";

export const db = new Database("vercel-proxy.db");

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

db.exec(`
  CREATE TABLE IF NOT EXISTS autonomous_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostId TEXT NOT NULL,
    projectId TEXT NOT NULL,
    projectName TEXT,
    transferred INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(hostId, projectId)
  )
`);

export function getSetting(key: string): string | undefined {
	const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
	return row?.value;
}

export function setSetting(key: string, value: string): void {
	db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export const insertLog = db.prepare(
	`INSERT INTO event_log (type, actorId, actorType, agentId, hostId, orgId, data, createdAt)
	 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
);

export function trackAutonomousProject(
	hostId: string,
	projectId: string,
	projectName?: string,
): void {
	db.prepare(
		`INSERT OR IGNORE INTO autonomous_projects (hostId, projectId, projectName) VALUES (?, ?, ?)`,
	).run(hostId, projectId, projectName ?? null);
}

export function getUntransferredProjects(
	hostId: string,
): Array<{ projectId: string; projectName: string | null }> {
	return db
		.prepare(
			`SELECT projectId, projectName FROM autonomous_projects WHERE hostId = ? AND transferred = 0`,
		)
		.all(hostId) as Array<{ projectId: string; projectName: string | null }>;
}

export function markProjectTransferred(projectId: string): void {
	db.prepare(
		`UPDATE autonomous_projects SET transferred = 1 WHERE projectId = ?`,
	).run(projectId);
}
