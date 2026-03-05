import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getConnectionById, upsertCredential } from "@/lib/db/connections";

/**
 * POST /api/connections/[id]/connect
 *
 * Member-facing endpoint to connect to a connection template.
 * For bearer-token MCP connections, accepts { token } in the body.
 * For no-auth connections, no body needed.
 * OAuth connections use the linkSocial flow instead.
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const conn = await getConnectionById(id);
	if (!conn) {
		return Response.json({ error: "Connection not found" }, { status: 404 });
	}

	if (conn.type === "oauth") {
		return Response.json(
			{ error: "Use the OAuth flow (linkSocial) to connect OAuth providers." },
			{ status: 400 },
		);
	}

	const body = (await request.json().catch(() => ({}))) as {
		token?: string;
	};

	if (conn.credentialType === "bearer" || conn.credentialType === "token") {
		if (!body.token) {
			return Response.json(
				{ error: "A bearer token is required for this connection." },
				{ status: 400 },
			);
		}
	}

	const cred = await upsertCredential({
		userId: session.user.id,
		connectionId: conn.id,
		orgId: conn.orgId,
		accessToken: body.token ?? null,
		status: "active",
	});

	return Response.json({
		id: cred.id,
		connectionId: conn.id,
		connected: true,
	});
}
