import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "./drizzle";
import { connection, connectionCredential } from "./schema";

export type Connection = typeof connection.$inferSelect;
export type NewConnection = typeof connection.$inferInsert;
export type ConnectionCredential = typeof connectionCredential.$inferSelect;
export type NewConnectionCredential = typeof connectionCredential.$inferInsert;

function generateId(): string {
	return crypto.randomUUID();
}

export async function listConnectionsByOrg(
	orgId: string,
): Promise<Connection[]> {
	return db
		.select()
		.from(connection)
		.where(eq(connection.orgId, orgId))
		.orderBy(connection.createdAt);
}

export async function getConnectionById(
	id: string,
): Promise<Connection | undefined> {
	const [row] = await db
		.select()
		.from(connection)
		.where(eq(connection.id, id))
		.limit(1);
	return row;
}

export async function getConnectionByIdInOrg(
	id: string,
	orgId: string,
): Promise<Connection | undefined> {
	const [row] = await db
		.select()
		.from(connection)
		.where(and(eq(connection.id, id), eq(connection.orgId, orgId)))
		.limit(1);
	return row;
}

export async function createConnection(
	data: Omit<NewConnection, "id" | "createdAt" | "updatedAt">,
): Promise<Connection> {
	const id = generateId();
	const [row] = await db
		.insert(connection)
		.values({ ...data, id })
		.returning();
	return row;
}

export async function updateConnection(
	id: string,
	orgId: string,
	data: Partial<
		Pick<
			Connection,
			| "name"
			| "displayName"
			| "status"
			| "mcpEndpoint"
			| "specUrl"
			| "baseUrl"
			| "oauthScopes"
		>
	>,
): Promise<Connection | undefined> {
	const [row] = await db
		.update(connection)
		.set({ ...data, updatedAt: new Date() })
		.where(and(eq(connection.id, id), eq(connection.orgId, orgId)))
		.returning();
	return row;
}

export async function deleteConnection(
	id: string,
	orgId: string,
): Promise<boolean> {
	const result = await db
		.delete(connection)
		.where(and(eq(connection.id, id), eq(connection.orgId, orgId)));
	return (result as any).rowCount > 0 || result.length > 0;
}

export async function getCredential(
	userId: string,
	connectionId: string,
	orgId: string,
): Promise<ConnectionCredential | undefined> {
	const [row] = await db
		.select()
		.from(connectionCredential)
		.where(
			and(
				eq(connectionCredential.userId, userId),
				eq(connectionCredential.connectionId, connectionId),
				eq(connectionCredential.orgId, orgId),
				eq(connectionCredential.status, "active"),
			),
		)
		.limit(1);
	return row;
}

export async function upsertCredential(
	data: Omit<NewConnectionCredential, "id" | "createdAt" | "updatedAt">,
): Promise<ConnectionCredential> {
	const existing = await getCredential(
		data.userId,
		data.connectionId,
		data.orgId,
	);
	if (existing) {
		const [row] = await db
			.update(connectionCredential)
			.set({
				accessToken: data.accessToken,
				refreshToken: data.refreshToken,
				tokenExpiresAt: data.tokenExpiresAt,
				apiKey: data.apiKey,
				metadata: data.metadata,
				status: data.status ?? "active",
				updatedAt: new Date(),
			})
			.where(eq(connectionCredential.id, existing.id))
			.returning();
		return row;
	}
	const id = generateId();
	const [row] = await db
		.insert(connectionCredential)
		.values({ ...data, id })
		.returning();
	return row;
}

export async function listCredentialsByMember(
	userId: string,
	orgId: string,
): Promise<ConnectionCredential[]> {
	return db
		.select()
		.from(connectionCredential)
		.where(
			and(
				eq(connectionCredential.userId, userId),
				eq(connectionCredential.orgId, orgId),
				eq(connectionCredential.status, "active"),
			),
		)
		.orderBy(connectionCredential.createdAt);
}

export async function deleteCredential(id: string): Promise<boolean> {
	const result = await db
		.delete(connectionCredential)
		.where(eq(connectionCredential.id, id));
	return (result as any).rowCount > 0 || result.length > 0;
}
