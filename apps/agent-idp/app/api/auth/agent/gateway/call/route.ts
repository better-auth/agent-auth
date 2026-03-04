import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { agentActivity, connection } from "@/lib/db/schema";
import { callMCPTool, listMCPTools } from "@/lib/mcp-client";
import { buildUrl, listOpenAPITools } from "@/lib/openapi-tools";
import { resolveAuth } from "@/lib/resolve-auth";

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
	const hasPermission = agentSession.agent.permissions.some(
		(p) =>
			p.scope === scope || p.scope === `${providerName}.*` || p.scope === "*",
	);

	if (!hasPermission) {
		return Response.json(
			{
				error: `Agent does not have permission for scope "${scope}". Call request_scope first.`,
			},
			{ status: 403 },
		);
	}

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
				(body.args as Record<string, unknown>) ?? {},
				matchedTool.method,
			);

			const hasBody = ["POST", "PUT", "PATCH"].includes(matchedTool.method);
			const response = await fetch(url, {
				method: matchedTool.method,
				headers: { "Content-Type": "application/json" },
				body: hasBody ? JSON.stringify(body.args) : undefined,
			});

			const resultData = await response.json();
			const durationMs = Date.now() - startTime;

			await db.insert(agentActivity).values({
				id: crypto.randomUUID(),
				orgId,
				agentId: agentSession.agent.id,
				agentName: agentSession.agent.name,
				userId,
				tool: toolName,
				provider: providerName,
				status: response.ok ? "success" : "error",
				durationMs,
				error: response.ok ? undefined : JSON.stringify(resultData),
			});

			return Response.json({
				content: [{ type: "text", text: JSON.stringify(resultData) }],
				isError: !response.ok,
			});
		} catch (err) {
			const durationMs = Date.now() - startTime;
			const errorMsg = err instanceof Error ? err.message : String(err);

			await db.insert(agentActivity).values({
				id: crypto.randomUUID(),
				orgId,
				agentId: agentSession.agent.id,
				agentName: agentSession.agent.name,
				userId,
				tool: toolName,
				provider: providerName,
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

	if (!conn.mcpEndpoint) {
		return Response.json(
			{ error: `Connection "${providerName}" has no MCP endpoint` },
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

		const result = await callMCPTool(
			conn.mcpEndpoint,
			toolName,
			body.args ?? {},
		);
		const durationMs = Date.now() - startTime;

		await db.insert(agentActivity).values({
			id: crypto.randomUUID(),
			orgId,
			agentId: agentSession.agent.id,
			agentName: agentSession.agent.name,
			userId,
			tool: toolName,
			provider: providerName,
			status: result.isError ? "error" : "success",
			durationMs,
		});

		return Response.json(result);
	} catch (err) {
		const durationMs = Date.now() - startTime;
		const errorMsg = err instanceof Error ? err.message : String(err);

		await db.insert(agentActivity).values({
			id: crypto.randomUUID(),
			orgId,
			agentId: agentSession.agent.id,
			agentName: agentSession.agent.name,
			userId,
			tool: toolName,
			provider: providerName,
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
