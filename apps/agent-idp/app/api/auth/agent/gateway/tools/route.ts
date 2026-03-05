import { and, eq } from "drizzle-orm";
import {
	listAgentAuthTools,
	parseAgentAuthCredential,
} from "@/lib/agent-auth-proxy";
import { organization } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import { getOrgSecuritySettings, isPersonalOrg } from "@/lib/db/queries";
import { connection, connectionCredential } from "@/lib/db/schema";
import {
	IDP_PROVIDER_NAME,
	IDP_TOOLS,
	PERSONAL_IDP_TOOLS,
} from "@/lib/idp-tools";
import { listMCPTools } from "@/lib/mcp-client";
import { getOAuthAdapter } from "@/lib/oauth-adapters";
import { listOpenAPITools } from "@/lib/openapi-tools";
import { resolveAuth } from "@/lib/resolve-auth";

/**
 * GET /api/auth/agent/gateway/tools
 *
 * Returns tools grouped by provider for the authenticated user's connections.
 * Auth: agent JWT or user session.
 */
export async function GET(request: Request) {
	const resolved = await resolveAuth(request);

	if (!resolved) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { orgId } = resolved;

	const [connections, security, [org]] = await Promise.all([
		db
			.select()
			.from(connection)
			.where(and(eq(connection.orgId, orgId), eq(connection.status, "active"))),
		getOrgSecuritySettings(orgId),
		db
			.select({ metadata: organization.metadata })
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1),
	]);

	const personal = isPersonalOrg(org?.metadata ?? null);

	const { crossUserCalls } = security;
	const disabledSet = new Set(crossUserCalls.disabledScopes);

	function injectAs(
		providerName: string,
		tool: {
			name: string;
			description: string;
			inputSchema?: Record<string, unknown>;
		},
	) {
		const scope = `${providerName}.${tool.name}`;
		if (!crossUserCalls.enabled || disabledSet.has(scope)) return tool;

		const schema = tool.inputSchema ?? { type: "object", properties: {} };
		const props =
			(schema.properties as Record<string, unknown> | undefined) ?? {};
		return {
			...tool,
			inputSchema: {
				...schema,
				properties: {
					...props,
					as: {
						type: "string",
						description:
							"User ID to act on behalf of. Requires a permission " +
							"for this scope granted by the target user.",
					},
				},
			},
		};
	}

	const result: Array<{
		name: string;
		tools: Array<{
			name: string;
			description: string;
			inputSchema?: Record<string, unknown>;
		}>;
	}> = [];

	const idpTools = personal ? PERSONAL_IDP_TOOLS : IDP_TOOLS;
	result.push({
		name: IDP_PROVIDER_NAME,
		tools: idpTools.map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema as Record<string, unknown>,
		})),
	});

	for (const conn of connections) {
		if (conn.type === "openapi" && conn.specUrl) {
			try {
				const tools = await listOpenAPITools(conn.specUrl);
				result.push({
					name: conn.name,
					tools: tools.map((t) =>
						injectAs(conn.name, {
							name: t.name,
							description: t.description,
							inputSchema: t.inputSchema,
						}),
					),
				});
			} catch {
				result.push({ name: conn.name, tools: [] });
			}
			continue;
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
				if (credential) {
					const tools = await listAgentAuthTools(credential);
					result.push({
						name: conn.name,
						tools: tools.map((t) =>
							injectAs(conn.name, {
								name: t.name,
								description: t.description,
								inputSchema: t.inputSchema,
							}),
						),
					});
				} else {
					result.push({ name: conn.name, tools: [] });
				}
			} catch {
				result.push({ name: conn.name, tools: [] });
			}
			continue;
		}

		if (conn.mcpEndpoint) {
			try {
				const tools = await listMCPTools(conn.mcpEndpoint);
				result.push({
					name: conn.name,
					tools: tools.map((t) =>
						injectAs(conn.name, {
							name: t.name,
							description: t.description,
							inputSchema: t.inputSchema,
						}),
					),
				});
			} catch {
				result.push({ name: conn.name, tools: [] });
			}
			continue;
		}

		if (conn.type === "oauth" && conn.builtinId) {
			const adapter = getOAuthAdapter(conn.builtinId);
			if (adapter) {
				const grantedScopes =
					conn.oauthScopes?.split(/[\s,]+/).filter(Boolean) ?? undefined;
				const tools = adapter.listTools(grantedScopes);
				result.push({
					name: conn.name,
					tools: tools.map((t) =>
						injectAs(conn.name, {
							name: t.name,
							description: t.description,
							inputSchema: t.inputSchema,
						}),
					),
				});
			} else {
				result.push({ name: conn.name, tools: [] });
			}
			continue;
		}

		result.push({ name: conn.name, tools: [] });
	}

	return Response.json({ providers: result });
}
