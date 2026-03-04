import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { account } from "@/lib/db/better-auth-schema";
import { getCredential, listConnectionsByOrg } from "@/lib/db/connections";
import { db } from "@/lib/db/drizzle";

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
