import Database from "better-sqlite3";

const DB_PATH = "demo.db";

export interface ActivityLogEntry {
	id: string;
	agentId: string;
	agentName: string;
	userId: string;
	provider: string;
	tool: string;
	args: string;
	result: string;
	status: "success" | "error";
	durationMs: number;
	inputSchema: string;
	createdAt: string;
}

function getDb() {
	const db = new Database(DB_PATH);
	db.exec(`
		CREATE TABLE IF NOT EXISTS activity_log (
			id TEXT PRIMARY KEY,
			agentId TEXT NOT NULL,
			agentName TEXT NOT NULL,
			userId TEXT NOT NULL,
			provider TEXT NOT NULL,
			tool TEXT NOT NULL,
			args TEXT NOT NULL DEFAULT '{}',
			result TEXT NOT NULL DEFAULT '{}',
			status TEXT NOT NULL DEFAULT 'success',
			durationMs INTEGER NOT NULL DEFAULT 0,
			inputSchema TEXT NOT NULL DEFAULT '{}',
			createdAt TEXT NOT NULL
		)
	`);
	return db;
}

export function logActivity(
	entry: Omit<ActivityLogEntry, "id" | "createdAt">,
): ActivityLogEntry {
	const db = getDb();
	try {
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();
		db.prepare(
			`INSERT INTO activity_log (id, agentId, agentName, userId, provider, tool, args, result, status, durationMs, inputSchema, createdAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			id,
			entry.agentId,
			entry.agentName,
			entry.userId,
			entry.provider,
			entry.tool,
			entry.args,
			entry.result,
			entry.status,
			entry.durationMs,
			entry.inputSchema,
			createdAt,
		);
		return { ...entry, id, createdAt };
	} finally {
		db.close();
	}
}

export function getActivityLog(
	userId: string,
	limit = 50,
	offset = 0,
): ActivityLogEntry[] {
	const db = getDb();
	try {
		return db
			.prepare(
				"SELECT * FROM activity_log WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?",
			)
			.all(userId, limit, offset) as ActivityLogEntry[];
	} finally {
		db.close();
	}
}

export function getActivityLogCount(userId: string): number {
	const db = getDb();
	try {
		const row = db
			.prepare("SELECT COUNT(*) as count FROM activity_log WHERE userId = ?")
			.get(userId) as { count: number };
		return row.count;
	} finally {
		db.close();
	}
}
