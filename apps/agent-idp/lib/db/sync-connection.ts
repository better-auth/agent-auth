import { and, eq } from "drizzle-orm";
import { member } from "./better-auth-schema";
import { db } from "./drizzle";
import { connection, connectionCredential } from "./schema";

const BUILTIN_DISPLAY_NAMES: Record<string, string> = {
	github: "GitHub",
	google: "Google",
};

const BUILTIN_MCP_ENDPOINTS: Record<string, string> = {
	github: "https://api.githubcopilot.com/mcp/",
};

export async function syncConnectionOnAccountLink(account: {
	id: string;
	userId: string;
	providerId: string;
	accessToken?: string | null;
	refreshToken?: string | null;
	accessTokenExpiresAt?: Date | null;
	scope?: string | null;
}) {
	const builtinId = account.providerId;
	if (!["github", "google"].includes(builtinId)) return;
	if (!account.accessToken) return;

	const userMemberships = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, account.userId));

	if (userMemberships.length === 0) return;

	for (const { organizationId } of userMemberships) {
		const [existing] = await db
			.select()
			.from(connection)
			.where(
				and(
					eq(connection.orgId, organizationId),
					eq(connection.builtinId, builtinId),
				),
			)
			.limit(1);

		let connectionId: string;

		if (existing) {
			connectionId = existing.id;
			if (account.scope) {
				await db
					.update(connection)
					.set({ oauthScopes: account.scope, updatedAt: new Date() })
					.where(eq(connection.id, existing.id));
			}
		} else {
			const id = crypto.randomUUID();
			await db.insert(connection).values({
				id,
				orgId: organizationId,
				name: builtinId,
				displayName: BUILTIN_DISPLAY_NAMES[builtinId] ?? builtinId,
				type: "oauth",
				builtinId,
				mcpEndpoint: BUILTIN_MCP_ENDPOINTS[builtinId] ?? null,
				oauthScopes: account.scope ?? null,
				credentialType: "oauth",
				status: "active",
			});
			connectionId = id;
		}

		const [existingCred] = await db
			.select()
			.from(connectionCredential)
			.where(
				and(
					eq(connectionCredential.userId, account.userId),
					eq(connectionCredential.connectionId, connectionId),
					eq(connectionCredential.orgId, organizationId),
				),
			)
			.limit(1);

		if (existingCred) {
			await db
				.update(connectionCredential)
				.set({
					accessToken: account.accessToken,
					refreshToken: account.refreshToken ?? null,
					tokenExpiresAt: account.accessTokenExpiresAt ?? null,
					status: "active",
					updatedAt: new Date(),
				})
				.where(eq(connectionCredential.id, existingCred.id));
		} else {
			await db.insert(connectionCredential).values({
				id: crypto.randomUUID(),
				userId: account.userId,
				connectionId,
				orgId: organizationId,
				accessToken: account.accessToken,
				refreshToken: account.refreshToken ?? null,
				tokenExpiresAt: account.accessTokenExpiresAt ?? null,
				status: "active",
			});
		}
	}
}
