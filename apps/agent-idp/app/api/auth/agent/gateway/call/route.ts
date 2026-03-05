import { and, eq } from "drizzle-orm";
import {
	callAgentAuthTool,
	parseAgentAuthCredential,
} from "@/lib/agent-auth-proxy";
import { audit } from "@/lib/audit";
import {
	policyMatchesInput,
	resolveInputScopePolicies,
} from "@/lib/auth/input-scope-policy";
import { member, organization } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import { getOrgSecuritySettings, isPersonalOrg } from "@/lib/db/queries";
import { connection, connectionCredential } from "@/lib/db/schema";
import {
	executeIdpTool,
	IDP_PROVIDER_NAME,
	PERSONAL_IDP_TOOLS,
} from "@/lib/idp-tools";
import { callMCPTool, listMCPTools } from "@/lib/mcp-client";
import { getOAuthAdapter } from "@/lib/oauth-adapters";
import { buildUrl, listOpenAPITools } from "@/lib/openapi-tools";
import { resolveAuth } from "@/lib/resolve-auth";

function extractContentText(
	content: unknown,
): string | undefined {
	if (!Array.isArray(content)) return undefined;
	const texts = content
		.filter(
			(c): c is { text: string } =>
				typeof c === "object" && c !== null && typeof c.text === "string",
		)
		.map((c) => c.text);
	return texts.length > 0 ? texts.join("\n") : undefined;
}

/**
 * POST /api/auth/agent/gateway/call
 *
 * Executes a tool call on behalf of an agent.
 * Auth: agent JWT required (needs agent identity for permission checks and audit).
 */
export async function POST(request: Request) {
	const resolved = await resolveAuth(request);

	if (!resolved) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (!resolved.agentSession) {
		return Response.json(
			{ error: "Agent JWT required for tool calls" },
			{ status: 403 },
		);
	}

	const { orgId, userId, agentSession } = resolved;

	const body = (await request.json()) as {
		tool: string;
		args: Record<string, unknown>;
	};

	const dotIdx = body.tool.indexOf(".");
	if (dotIdx === -1) {
		return Response.json(
			{ error: "Tool must be in provider.tool_name format" },
			{ status: 400 },
		);
	}

	const providerName = body.tool.substring(0, dotIdx);
	const toolName = body.tool.substring(dotIdx + 1);

	// Built-in IDP tools — no connection record needed
	if (providerName === IDP_PROVIDER_NAME) {
		const [orgRow] = await db
			.select({ metadata: organization.metadata })
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);

		const personal = isPersonalOrg(orgRow?.metadata ?? null);
		if (personal) {
			const allowedNames = new Set<string>(
				PERSONAL_IDP_TOOLS.map((t) => t.name),
			);
			if (!allowedNames.has(toolName)) {
				return Response.json(
					{
						error: `Tool "${toolName}" is not available for personal workspaces.`,
					},
					{ status: 400 },
				);
			}
		}

		const scope = body.tool;
		const activePermissionScopes = new Set(
			agentSession.agent.permissions.map((p) => p.scope),
		);
		const hasPermission =
			activePermissionScopes.has(scope) ||
			activePermissionScopes.has(`${IDP_PROVIDER_NAME}.*`) ||
			activePermissionScopes.has("*");

		if (!hasPermission) {
			return Response.json(
				{
					error: `Agent does not have permission for scope "${scope}". Request the scope first.`,
				},
				{ status: 403 },
			);
		}

		const result = await executeIdpTool(toolName, body.args ?? {}, {
			orgId,
			userId,
			agentSession,
		});
		return Response.json(result);
	}

	const [conn] = await db
		.select()
		.from(connection)
		.where(
			and(
				eq(connection.orgId, orgId),
				eq(connection.name, providerName),
				eq(connection.status, "active"),
			),
		)
		.limit(1);

	if (!conn) {
		return Response.json(
			{ error: `Provider "${providerName}" not found` },
			{ status: 404 },
		);
	}

	const scope = body.tool;
	const activePermissionScopes = new Set(
		agentSession.agent.permissions.map((p) => p.scope),
	);

	const hasBaseScopePermission =
		activePermissionScopes.has(scope) ||
		activePermissionScopes.has(`${providerName}.*`) ||
		activePermissionScopes.has("*");

	let hasInputScopedPermission = false;
	if (!hasBaseScopePermission) {
		const [org] = await db
			.select({ metadata: organization.metadata })
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);

		let orgMeta: Record<string, unknown> = {};
		if (org?.metadata) {
			try {
				orgMeta = JSON.parse(org.metadata) as Record<string, unknown>;
			} catch {
				orgMeta = {};
			}
		}

		const inputPolicies = resolveInputScopePolicies(orgMeta);
		const scopedPolicies = inputPolicies.filter((p) => p.parentScope === scope);
		const args = body.args ?? {};

		hasInputScopedPermission = scopedPolicies.some((policy) => {
			if (!activePermissionScopes.has(policy.scope)) return false;
			return policyMatchesInput(policy, args);
		});
	}

	if (!hasBaseScopePermission && !hasInputScopedPermission) {
		return Response.json(
			{
				error: `Agent does not have permission for scope "${scope}" with the provided input. Request a matching scope policy first.`,
			},
			{ status: 403 },
		);
	}

	// Cross-user calls: resolve the effective user context
	const asUserId = typeof body.args?.as === "string" ? body.args.as : null;
	let effectiveUserId = userId;

	if (asUserId) {
		// Personal orgs don't support cross-user calls
		{
			const [orgRow] = await db
				.select({ metadata: organization.metadata })
				.from(organization)
				.where(eq(organization.id, orgId))
				.limit(1);
			if (isPersonalOrg(orgRow?.metadata ?? null)) {
				return Response.json(
					{
						error:
							"Cross-user calls are not available for personal workspaces.",
					},
					{ status: 400 },
				);
			}
		}

		const security = await getOrgSecuritySettings(orgId);
		const { crossUserCalls } = security;

		if (!crossUserCalls.enabled) {
			return Response.json(
				{ error: "Cross-user calls are disabled for this organization." },
				{ status: 403 },
			);
		}

		if (crossUserCalls.disabledScopes.includes(scope)) {
			return Response.json(
				{ error: `Cross-user calls are disabled for scope "${scope}".` },
				{ status: 403 },
			);
		}

		// Verify the agent has a permission for this scope granted by the target user
		const hasAsPermission = agentSession.agent.permissions.some(
			(p) =>
				p.grantedBy === asUserId &&
				p.status === "active" &&
				(p.scope === scope ||
					p.scope === `${providerName}.*` ||
					p.scope === "*"),
		);

		if (!hasAsPermission) {
			return Response.json(
				{
					error:
						`No permission for scope "${scope}" granted by user "${asUserId}". ` +
						"Request approval from this user first.",
				},
				{ status: 403 },
			);
		}

		// Verify target user is an org member
		const [targetMember] = await db
			.select({ userId: member.userId })
			.from(member)
			.where(and(eq(member.organizationId, orgId), eq(member.userId, asUserId)))
			.limit(1);

		if (!targetMember) {
			return Response.json(
				{ error: "Target user is not a member of this organization." },
				{ status: 403 },
			);
		}

		effectiveUserId = asUserId;
	}

	// Strip 'as' from args before passing to the tool
	const { as: _as, ...toolArgs } = body.args ?? {};

	const startTime = Date.now();

	if (conn.type === "openapi" && conn.specUrl) {
		try {
			const tools = await listOpenAPITools(conn.specUrl);
			const matchedTool = tools.find((t) => t.name === toolName);
			if (!matchedTool) {
				return Response.json(
					{
						error: `Tool "${toolName}" not found on provider "${providerName}"`,
					},
					{ status: 404 },
				);
			}

			const base = conn.baseUrl || "";
			const url = buildUrl(
				base,
				matchedTool.path,
				toolArgs,
				matchedTool.method,
			);

			const hasBody = ["POST", "PUT", "PATCH"].includes(matchedTool.method);
			const response = await fetch(url, {
				method: matchedTool.method,
				headers: { "Content-Type": "application/json" },
				body: hasBody ? JSON.stringify(toolArgs) : undefined,
			});

			const resultData = await response.json();
			const durationMs = Date.now() - startTime;
			const resultText = JSON.stringify(resultData);

			audit.onEvent({
				type: "tool.executed",
				orgId,
				agentId: agentSession.agent.id,
				agentName: agentSession.agent.name,
				userId,
				tool: toolName,
				provider: providerName,
				toolArgs,
				toolOutput: resultText,
				status: response.ok ? "success" : "error",
				durationMs,
				error: response.ok ? undefined : resultText,
			});

			return Response.json({
				content: [{ type: "text", text: resultText }],
				isError: !response.ok,
			});
		} catch (err) {
			const durationMs = Date.now() - startTime;
			const errorMsg = err instanceof Error ? err.message : String(err);

			audit.onEvent({
				type: "tool.executed",
				orgId,
				agentId: agentSession.agent.id,
				agentName: agentSession.agent.name,
				userId,
				tool: toolName,
				provider: providerName,
				toolArgs,
				status: "error",
				durationMs,
				error: errorMsg,
			});

			return Response.json(
				{ error: `Failed to call tool: ${errorMsg}` },
				{ status: 502 },
			);
		}
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
						eq(connectionCredential.userId, effectiveUserId),
						eq(connectionCredential.status, "active"),
					),
				)
				.limit(1);

			const credential = parseAgentAuthCredential(
				cred?.metadata ?? null,
				conn.baseUrl,
			);
			if (!credential) {
				return Response.json(
					{
						error: asUserId
							? `No credentials found for user "${asUserId}" on connection "${providerName}".`
							: `Agent Auth connection "${providerName}" is not connected. Set up the connection first.`,
					},
					{ status: 400 },
				);
			}

			const result = await callAgentAuthTool(credential, toolName, toolArgs);
			const durationMs = Date.now() - startTime;

			audit.onEvent({
				type: "tool.executed",
				orgId,
				agentId: agentSession.agent.id,
				agentName: agentSession.agent.name,
				userId,
				tool: toolName,
				provider: providerName,
				toolArgs,
				toolOutput: extractContentText(result.content),
				status: result.isError ? "error" : "success",
				durationMs,
			});

			return Response.json(result);
		} catch (err) {
			const durationMs = Date.now() - startTime;
			const errorMsg = err instanceof Error ? err.message : String(err);

			audit.onEvent({
				type: "tool.executed",
				orgId,
				agentId: agentSession.agent.id,
				agentName: agentSession.agent.name,
				userId,
				tool: toolName,
				provider: providerName,
				toolArgs,
				status: "error",
				durationMs,
				error: errorMsg,
			});

			return Response.json(
				{ error: `Failed to call tool: ${errorMsg}` },
				{ status: 502 },
			);
		}
	}

	// OAuth connections: MCP with auth headers (GitHub) or REST adapter (Google)
	if (conn.type === "oauth") {
		const [cred] = await db
			.select()
			.from(connectionCredential)
			.where(
				and(
					eq(connectionCredential.connectionId, conn.id),
					eq(connectionCredential.orgId, orgId),
					eq(connectionCredential.userId, effectiveUserId),
					eq(connectionCredential.status, "active"),
				),
			)
			.limit(1);

		if (!cred?.accessToken) {
			return Response.json(
				{
					error: asUserId
						? `No OAuth credentials found for user "${asUserId}" on connection "${providerName}".`
						: `OAuth connection "${providerName}" is not connected. Link your account first.`,
				},
				{ status: 400 },
			);
		}

		// If the OAuth connection has an MCP endpoint (e.g. GitHub), use MCP with auth
		if (conn.mcpEndpoint) {
			try {
				const authHeaders = {
					Authorization: `Bearer ${cred.accessToken}`,
				};
				const mcpArgs = asUserId
					? { ...toolArgs, _actingAsUserId: asUserId }
					: toolArgs;
				const result = await callMCPTool(
					conn.mcpEndpoint,
					toolName,
					mcpArgs,
					authHeaders,
				);
				const durationMs = Date.now() - startTime;

				audit.onEvent({
					type: "tool.executed",
					orgId,
					agentId: agentSession.agent.id,
					agentName: agentSession.agent.name,
					userId,
					tool: toolName,
					provider: providerName,
					toolArgs,
					toolOutput: extractContentText(result.content),
					status: result.isError ? "error" : "success",
					durationMs,
				});

				return Response.json(result);
			} catch (err) {
				const durationMs = Date.now() - startTime;
				const errorMsg = err instanceof Error ? err.message : String(err);

				audit.onEvent({
					type: "tool.executed",
					orgId,
					agentId: agentSession.agent.id,
					agentName: agentSession.agent.name,
					userId,
					tool: toolName,
					provider: providerName,
					toolArgs,
					status: "error",
					durationMs,
					error: errorMsg,
				});

				return Response.json(
					{ error: `Failed to call tool: ${errorMsg}` },
					{ status: 502 },
				);
			}
		}

		// Otherwise use the OAuth REST adapter (e.g. Google)
		const adapter = conn.builtinId
			? getOAuthAdapter(conn.builtinId)
			: undefined;
		if (!adapter) {
			return Response.json(
				{
					error: `OAuth connection "${providerName}" has no MCP endpoint and no REST adapter configured.`,
				},
				{ status: 400 },
			);
		}

		try {
			const result = await adapter.callTool(
				toolName,
				toolArgs,
				cred.accessToken,
			);
			const durationMs = Date.now() - startTime;

			audit.onEvent({
				type: "tool.executed",
				orgId,
				agentId: agentSession.agent.id,
				agentName: agentSession.agent.name,
				userId,
				tool: toolName,
				provider: providerName,
				toolArgs,
				toolOutput: extractContentText(result.content),
				status: result.isError ? "error" : "success",
				durationMs,
			});

			return Response.json(result);
		} catch (err) {
			const durationMs = Date.now() - startTime;
			const errorMsg = err instanceof Error ? err.message : String(err);

			audit.onEvent({
				type: "tool.executed",
				orgId,
				agentId: agentSession.agent.id,
				agentName: agentSession.agent.name,
				userId,
				tool: toolName,
				provider: providerName,
				toolArgs,
				status: "error",
				durationMs,
				error: errorMsg,
			});

			return Response.json(
				{ error: `Failed to call tool: ${errorMsg}` },
				{ status: 502 },
			);
		}
	}

	// Generic MCP connections
	if (!conn.mcpEndpoint) {
		return Response.json(
			{ error: `Connection "${providerName}" has no configured endpoint` },
			{ status: 400 },
		);
	}

	try {
		const tools = await listMCPTools(conn.mcpEndpoint);
		const matchedTool = tools.find((t) => t.name === toolName);
		if (!matchedTool) {
			return Response.json(
				{
					error: `Tool "${toolName}" not found on provider "${providerName}"`,
				},
				{ status: 404 },
			);
		}

		const mcpArgs = asUserId
			? { ...toolArgs, _actingAsUserId: asUserId }
			: toolArgs;
		const result = await callMCPTool(conn.mcpEndpoint, toolName, mcpArgs);
		const durationMs = Date.now() - startTime;

		audit.onEvent({
			type: "tool.executed",
			orgId,
			agentId: agentSession.agent.id,
			agentName: agentSession.agent.name,
			userId,
			tool: toolName,
			provider: providerName,
			toolArgs,
			toolOutput: extractContentText(result.content),
			status: result.isError ? "error" : "success",
			durationMs,
		});

		return Response.json(result);
	} catch (err) {
		const durationMs = Date.now() - startTime;
		const errorMsg = err instanceof Error ? err.message : String(err);

		audit.onEvent({
			type: "tool.executed",
			orgId,
			agentId: agentSession.agent.id,
			agentName: agentSession.agent.name,
			userId,
			tool: toolName,
			provider: providerName,
			toolArgs,
			status: "error",
			durationMs,
			error: errorMsg,
		});

		return Response.json(
			{ error: `Failed to call tool: ${errorMsg}` },
			{ status: 502 },
		);
	}
}
