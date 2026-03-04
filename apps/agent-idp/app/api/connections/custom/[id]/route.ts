import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { deleteConnection, getConnectionById } from "@/lib/db/connections";

export async function DELETE(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const conn = await getConnectionById(id);
	if (!conn) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	await deleteConnection(id, conn.orgId);
	return Response.json({ success: true });
}
