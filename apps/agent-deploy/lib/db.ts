import Database from "better-sqlite3";

export const db = new Database("agent-deploy.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS site (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    html TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    userId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

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

export const insertLog = db.prepare(
	`INSERT INTO event_log (type, actorId, actorType, agentId, hostId, orgId, data, createdAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
);

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
	createdAt: string;
	description: string;
	html: string;
	id: string;
	name: string;
	slug: string;
	status: string;
	updatedAt: string;
	userId: string;
}

export function createSite(params: {
	name: string;
	html: string;
	description?: string;
	userId: string;
}): SiteRow {
	const id = generateId();
	const slug = uniqueSlug(params.name);
	db.prepare(
		"INSERT INTO site (id, name, slug, html, description, userId) VALUES (?, ?, ?, ?, ?, ?)"
	).run(
		id,
		params.name,
		slug,
		params.html,
		params.description ?? "",
		params.userId
	);
	return db.prepare("SELECT * FROM site WHERE id = ?").get(id) as SiteRow;
}

export function updateSite(params: {
	id: string;
	userId: string;
	name?: string;
	html?: string;
	description?: string;
}): SiteRow | null {
	const site = db
		.prepare(
			"SELECT * FROM site WHERE id = ? AND userId = ? AND status = 'active'"
		)
		.get(params.id, params.userId) as SiteRow | undefined;
	if (!site) {
		return null;
	}

	const updates: string[] = ["updatedAt = datetime('now')"];
	const values: unknown[] = [];

	if (params.name !== undefined) {
		updates.push("name = ?");
		values.push(params.name);
	}
	if (params.html !== undefined) {
		updates.push("html = ?");
		values.push(params.html);
	}
	if (params.description !== undefined) {
		updates.push("description = ?");
		values.push(params.description);
	}

	values.push(params.id);
	db.prepare(`UPDATE site SET ${updates.join(", ")} WHERE id = ?`).run(
		...values
	);
	return db
		.prepare("SELECT * FROM site WHERE id = ?")
		.get(params.id) as SiteRow;
}

export function deleteSite(id: string, userId: string): boolean {
	const result = db
		.prepare(
			"UPDATE site SET status = 'deleted', updatedAt = datetime('now') WHERE id = ? AND userId = ? AND status = 'active'"
		)
		.run(id, userId);
	return result.changes > 0;
}

export function getSite(id: string): SiteRow | null {
	return (
		(db
			.prepare("SELECT * FROM site WHERE id = ? AND status = 'active'")
			.get(id) as SiteRow) ?? null
	);
}

export function getSiteBySlug(slug: string): SiteRow | null {
	return (
		(db
			.prepare("SELECT * FROM site WHERE slug = ? AND status = 'active'")
			.get(slug) as SiteRow) ?? null
	);
}

export function listSites(userId: string): SiteRow[] {
	return db
		.prepare(
			"SELECT * FROM site WHERE userId = ? AND status = 'active' ORDER BY updatedAt DESC"
		)
		.all(userId) as SiteRow[];
}

export function countSites(userId: string): number {
	const row = db
		.prepare(
			"SELECT COUNT(*) as count FROM site WHERE userId = ? AND status = 'active'"
		)
		.get(userId) as { count: number };
	return row.count;
}
