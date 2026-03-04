import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { account } from "@/lib/db/better-auth-schema";
import {
	deleteConnection,
	deleteCredential,
	getConnectionById,
	getCredential,
} from "@/lib/db/connections";
import { db } from "@/lib/db/drizzle";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ connected: false });
	}

	// UUID path → connection table lookup
	if (UUID_RE.test(id)) {
		const conn = await getConnectionById(id);
		if (!conn) {
			return Response.json({ connected: false });
		}

		let connected = false;
		let identifier: string | null = null;

		if (conn.type === "oauth" && conn.builtinId) {
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
		}

		return Response.json({ connected, identifier });
	}

	// Legacy: treat id as a provider name (e.g. "github")
	const providerId = id;
	const [acc] = await db
		.select()
		.from(account)
		.where(
			and(
				eq(account.userId, session.user.id),
				eq(account.providerId, providerId),
			),
		)
		.limit(1);

	if (!acc) {
		return Response.json({ connected: false });
	}

	return Response.json({
		connected: true,
		identifier: acc.accountId,
		connectedAt: acc.createdAt.toISOString(),
	});
}

export async function DELETE(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	// UUID path → connection table lookup
	if (UUID_RE.test(id)) {
		const conn = await getConnectionById(id);
		if (!conn) {
			return Response.json({ error: "Not found" }, { status: 404 });
		}

		if (conn.type === "oauth" && conn.builtinId) {
			// Delete the Better Auth account row so it shows as "not connected"
			await db
				.delete(account)
				.where(
					and(
						eq(account.userId, session.user.id),
						eq(account.providerId, conn.builtinId),
					),
				);
			// Also delete any credential row
			const cred = await getCredential(session.user.id, conn.id, conn.orgId);
			if (cred) {
				await deleteCredential(cred.id);
			}
			// Keep the connection row so it appears as "not connected"
			return Response.json({ success: true });
		}

		// MCP / OpenAPI → delete the connection entirely
		await deleteConnection(id, conn.orgId);
		return Response.json({ success: true });
	}

	// Legacy: treat id as a provider name
	const providerId = id;
	await db
		.delete(account)
		.where(
			and(
				eq(account.userId, session.user.id),
				eq(account.providerId, providerId),
			),
		);

	return Response.json({ success: true });
}
