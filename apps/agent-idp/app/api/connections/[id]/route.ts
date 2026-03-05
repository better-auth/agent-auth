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
	updateConnection,
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
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	// UUID path → connection table lookup
	if (UUID_RE.test(id)) {
		const conn = await getConnectionById(id);
		if (!conn) {
			return Response.json({ error: "Not found" }, { status: 404 });
		}

		const url = new URL(_request.url);
		const action = url.searchParams.get("action");

		if (conn.type === "oauth" && conn.builtinId && action !== "delete") {
			// Per-user disconnect — any member can disconnect their own account
			await db
				.delete(account)
				.where(
					and(
						eq(account.userId, session.user.id),
						eq(account.providerId, conn.builtinId),
					),
				);
			const cred = await getCredential(session.user.id, conn.id, conn.orgId);
			if (cred) {
				await deleteCredential(cred.id);
			}
			return Response.json({ success: true });
		}

		// Delete the connection template — admin-only
		const canDelete = await auth.api.hasPermission({
			headers: reqHeaders,
			body: {
				permissions: { connection: ["delete"] },
				organizationId: conn.orgId,
			},
		});
		if (!canDelete?.success) {
			return Response.json(
				{ error: "Only admins can delete connections." },
				{ status: 403 },
			);
		}

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

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const conn = await getConnectionById(id);
	if (!conn) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	const canUpdate = await auth.api.hasPermission({
		headers: reqHeaders,
		body: {
			permissions: { connection: ["create"] },
			organizationId: conn.orgId,
		},
	});
	if (!canUpdate?.success) {
		return Response.json(
			{ error: "Only admins can update connections." },
			{ status: 403 },
		);
	}

	const body = (await request.json()) as {
		displayName?: string;
		oauthScopes?: string;
		mcpEndpoint?: string;
	};

	const updated = await updateConnection(conn.id, conn.orgId, {
		...(body.displayName
			? { name: body.displayName.toLowerCase().replace(/[^a-z0-9-]/g, "-") }
			: {}),
		...(body.displayName ? { displayName: body.displayName } : {}),
		...(body.oauthScopes !== undefined
			? { oauthScopes: body.oauthScopes }
			: {}),
		...(body.mcpEndpoint !== undefined
			? { mcpEndpoint: body.mcpEndpoint }
			: {}),
	});

	return Response.json(updated ?? { success: true });
}
