import Database from "better-sqlite3";

const DB_PATH = "demo.db";

export interface MCPProvider {
	id: string;
	userId: string;
	name: string;
	endpoint: string;
	createdAt: string;
}

function getDb() {
	const db = new Database(DB_PATH);
	db.exec(`
		CREATE TABLE IF NOT EXISTS mcp_provider (
			id TEXT PRIMARY KEY,
			userId TEXT NOT NULL,
			name TEXT NOT NULL,
			endpoint TEXT NOT NULL,
			createdAt TEXT NOT NULL
		)
	`);
	return db;
}

export function addProvider(
	userId: string,
	name: string,
	endpoint: string,
): MCPProvider {
	const db = getDb();
	try {
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();
		db.prepare(
			"INSERT INTO mcp_provider (id, userId, name, endpoint, createdAt) VALUES (?, ?, ?, ?, ?)",
		).run(id, userId, name, endpoint, createdAt);
		return { id, userId, name, endpoint, createdAt };
	} finally {
		db.close();
	}
}

export function listProviders(userId: string): MCPProvider[] {
	const db = getDb();
	try {
		return db
			.prepare("SELECT * FROM mcp_provider WHERE userId = ?")
			.all(userId) as MCPProvider[];
	} finally {
		db.close();
	}
}

export function listAllProviders(): MCPProvider[] {
	const db = getDb();
	try {
		return db.prepare("SELECT * FROM mcp_provider").all() as MCPProvider[];
	} finally {
		db.close();
	}
}

export function removeProvider(id: string, userId: string): boolean {
	const db = getDb();
	try {
		const result = db
			.prepare("DELETE FROM mcp_provider WHERE id = ? AND userId = ?")
			.run(id, userId);
		return result.changes > 0;
	} finally {
		db.close();
	}
}
