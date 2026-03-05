import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import {
	listAgentAuthTools,
	parseAgentAuthCredential,
} from "@/lib/agent-auth-proxy";
import { auth } from "@/lib/auth/auth";
import { account } from "@/lib/db/better-auth-schema";
import { getCredential, listConnectionsByOrg } from "@/lib/db/connections";
import { db } from "@/lib/db/drizzle";
import { getOrgBySlug, getSession } from "@/lib/db/queries";
import { connectionCredential } from "@/lib/db/schema";
import { listMCPTools } from "@/lib/mcp-client";
import { getOAuthAdapter } from "@/lib/oauth-adapters";
import { listOpenAPITools } from "@/lib/openapi-tools";
import { ConnectionsClient } from "./connections-client";

type ToolDef = { name: string; description: string };

async function getToolsForConnection(
	conn: {
		id: string;
		type: string;
		builtinId: string | null;
		mcpEndpoint: string | null;
		specUrl: string | null;
		baseUrl: string | null;
		oauthScopes: string | null;
	},
	orgId: string,
	userId?: string,
): Promise<ToolDef[]> {
	if (conn.type === "openapi" && conn.specUrl) {
		try {
			const tools = await listOpenAPITools(conn.specUrl);
			return tools.map((t) => ({ name: t.name, description: t.description }));
		} catch {
			return [];
		}
	}
	if (conn.type === "oauth" && conn.mcpEndpoint) {
		// OAuth + MCP (e.g. GitHub): need auth headers to list tools
		let authHeaders: Record<string, string> | undefined;
		if (userId) {
			const cred = await getCredential(userId, conn.id, orgId);
			if (cred?.accessToken) {
				authHeaders = { Authorization: `Bearer ${cred.accessToken}` };
			}
		}
		try {
			return await listMCPTools(conn.mcpEndpoint, authHeaders);
		} catch {
			return [];
		}
	}
	if (conn.mcpEndpoint) {
		try {
			return await listMCPTools(conn.mcpEndpoint);
		} catch {
			return [];
		}
	}
	if (conn.type === "oauth" && conn.builtinId) {
		const adapter = getOAuthAdapter(conn.builtinId);
		if (adapter) {
			const grantedScopes =
				conn.oauthScopes?.split(/[\s,]+/).filter(Boolean) ?? undefined;
			return adapter.listTools(grantedScopes);
		}
		return [];
	}
	if (conn.type === "agent-auth" && conn.baseUrl) {
		try {
			const [cred] = await db
				.select()
				.from(connectionCredential)
				.where(
					and(
						eq(connectionCredential.connectionId, conn.id),
						eq(connectionCredential.orgId, orgId),
						eq(connectionCredential.status, "active"),
					),
				)
				.limit(1);

			const credential = parseAgentAuthCredential(
				cred?.metadata ?? null,
				conn.baseUrl,
			);
			if (!credential) return [];
			return await listAgentAuthTools(credential);
		} catch {
			return [];
		}
	}
	return [];
}

export default async function ConnectionsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
	]);

	if (!org || !session?.user) {
		return (
			<div className="max-w-5xl mx-auto">
				<ConnectionsClient initialConnections={[]} orgId="" canManage={false} />
			</div>
		);
	}

	const orgId = org.id;
	const userId = session.user.id;

	const reqHeaders = await headers();
	const canManageResult = await auth.api.hasPermission({
		headers: reqHeaders,
		body: {
			permissions: { connection: ["create"] },
			organizationId: orgId,
		},
	});
	const canManage = canManageResult?.success ?? false;

	const connections = await listConnectionsByOrg(orgId);

	const results = await Promise.all(
		connections.map(async (conn) => {
			let connected = false;
			let identifier: string | null = null;

			if (conn.type === "oauth" && conn.builtinId) {
				const cred = await getCredential(userId, conn.id, orgId);
				if (cred) {
					connected = true;
				}
				const [acc] = await db
					.select()
					.from(account)
					.where(
						and(
							eq(account.userId, userId),
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
				const [cred] = await db
					.select()
					.from(connectionCredential)
					.where(
						and(
							eq(connectionCredential.connectionId, conn.id),
							eq(connectionCredential.orgId, orgId),
							eq(connectionCredential.status, "active"),
						),
					)
					.limit(1);
				connected = !!cred;
				identifier = conn.baseUrl;
			}

			const tools = await getToolsForConnection(conn, orgId, userId);

			return {
				id: conn.id,
				orgId: conn.orgId,
				name: conn.name,
				displayName: conn.displayName,
				type: conn.type,
				builtinId: conn.builtinId,
				transport: conn.transport,
				mcpEndpoint: conn.mcpEndpoint,
				oauthScopes: conn.oauthScopes,
				credentialType: conn.credentialType,
				status: conn.status,
				createdAt:
					conn.createdAt instanceof Date
						? conn.createdAt.toISOString()
						: String(conn.createdAt),
				connected,
				identifier,
				tools,
			};
		}),
	);

	return (
		<div className="max-w-5xl mx-auto">
			<ConnectionsClient
				initialConnections={results}
				orgId={orgId}
				canManage={canManage}
			/>
		</div>
	);
}
