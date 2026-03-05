import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { account, member } from "@/lib/db/better-auth-schema";
import {
	createConnection,
	getCredential,
	listConnectionsByOrg,
	updateConnection,
	upsertCredential,
} from "@/lib/db/connections";
import { db } from "@/lib/db/drizzle";
import { connection } from "@/lib/db/schema";

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const orgId = url.searchParams.get("orgId");

	if (!orgId) {
		return Response.json(
			{ error: "orgId query parameter is required" },
			{ status: 400 },
		);
	}

	const connections = await listConnectionsByOrg(orgId);

	const results = await Promise.all(
		connections.map(async (conn) => {
			let connected = false;
			let identifier: string | null = null;

			if (conn.type === "oauth" && conn.builtinId) {
				const cred = await getCredential(session.user.id, conn.id, orgId);
				if (cred) {
					connected = true;
				}
				// Also check the Better Auth account table for identifier
				const [acc] = await db
					.select()
					.from(account)
					.where(
						and(
							eq(account.userId, session.user.id),
							eq(account.providerId, conn.builtinId),
						),
					)
					.limit(1);
				if (acc) {
					connected = true;
					identifier = acc.accountId;
				}
			} else if (conn.type === "mcp") {
				connected = true;
				identifier = conn.mcpEndpoint;
			} else if (conn.type === "openapi") {
				connected = true;
				identifier = conn.specUrl;
			} else if (conn.type === "agent-auth") {
				connected = !!conn.baseUrl;
				identifier = conn.baseUrl;
			}

			return {
				id: conn.id,
				orgId: conn.orgId,
				name: conn.name,
				displayName: conn.displayName,
				type: conn.type,
				builtinId: conn.builtinId,
				transport: conn.transport,
				mcpEndpoint: conn.mcpEndpoint,
				credentialType: conn.credentialType,
				status: conn.status,
				createdAt: conn.createdAt,
				connected,
				identifier,
			};
		}),
	);

	return Response.json(results);
}

async function syncExistingAccounts(
	connectionId: string,
	orgId: string,
	builtinId: string,
) {
	const orgMembers = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));

	if (orgMembers.length === 0) return;

	const accounts = await db
		.select()
		.from(account)
		.where(
			and(
				inArray(
					account.userId,
					orgMembers.map((m) => m.userId),
				),
				eq(account.providerId, builtinId),
			),
		);

	for (const acc of accounts) {
		if (!acc.accessToken) continue;
		await upsertCredential({
			userId: acc.userId,
			connectionId,
			orgId,
			accessToken: acc.accessToken,
			refreshToken: acc.refreshToken,
			tokenExpiresAt: acc.accessTokenExpiresAt,
			status: "active",
		});
	}
}

/**
 * POST /api/connections
 *
 * Admin-only: create a connection template (OAuth provider, pre-configured MCP, etc.)
 */
export async function POST(req: Request) {
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await req.json()) as {
		orgId: string;
		type: string;
		builtinId?: string;
		name?: string;
		displayName?: string;
		mcpEndpoint?: string;
		oauthScopes?: string;
	};

	if (!body.orgId || !body.type) {
		return Response.json(
			{ error: "orgId and type are required." },
			{ status: 400 },
		);
	}

	const canCreate = await auth.api.hasPermission({
		headers: reqHeaders,
		body: {
			permissions: { connection: ["create"] },
			organizationId: body.orgId,
		},
	});
	if (!canCreate?.success) {
		return Response.json(
			{ error: "Only admins can add connections." },
			{ status: 403 },
		);
	}

	const name = (body.name ?? body.builtinId ?? body.displayName ?? "conn")
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-");

	// For builtin providers, upsert: update if it already exists
	if (body.builtinId) {
		const [existing] = await db
			.select()
			.from(connection)
			.where(
				and(
					eq(connection.orgId, body.orgId),
					eq(connection.builtinId, body.builtinId),
				),
			)
			.limit(1);

		if (existing) {
			const updated = await updateConnection(existing.id, body.orgId, {
				displayName: body.displayName ?? existing.displayName,
				oauthScopes: body.oauthScopes ?? existing.oauthScopes,
				mcpEndpoint: body.mcpEndpoint ?? existing.mcpEndpoint,
			});
			await syncExistingAccounts(existing.id, body.orgId, body.builtinId);
			return Response.json(updated, { status: 200 });
		}
	}

	try {
		const conn = await createConnection({
			orgId: body.orgId,
			name,
			displayName: body.displayName ?? name,
			type: body.type,
			builtinId: body.builtinId ?? null,
			mcpEndpoint: body.mcpEndpoint ?? null,
			oauthScopes: body.oauthScopes ?? null,
			credentialType: body.type === "oauth" ? "oauth" : "none",
			status: "active",
		});

		if (body.builtinId) {
			await syncExistingAccounts(conn.id, body.orgId, body.builtinId);
		}

		return Response.json(conn, { status: 201 });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const isUnique = msg.includes("unique") || msg.includes("duplicate");
		return Response.json(
			{
				error: isUnique
					? "This connection already exists in the organization."
					: msg,
			},
			{ status: isUnique ? 409 : 400 },
		);
	}
}
