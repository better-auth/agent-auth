import { verifyAgentRequest } from "@better-auth/agent-auth";
import { logActivity } from "@/lib/activity-log";
import { auth } from "@/lib/auth";
import { callMCPTool, listMCPTools } from "@/lib/mcp-client";
import { listProviders } from "@/lib/mcp-providers";

export async function POST(request: Request) {
	let agentSession;
	try {
		agentSession = await verifyAgentRequest({ auth, request });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "Unauthorized";
		const status =
			err && typeof err === "object" && "statusCode" in err
				? (err as { statusCode: number }).statusCode
				: 401;
		return Response.json({ error: message }, { status });
	}
	if (!agentSession) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

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

	const providers = listProviders(agentSession.user.id);
	const provider = providers.find((p) => p.name === providerName);

	if (!provider) {
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
				error: `Agent does not have permission for scope "${scope}". Call add_scopes first.`,
			},
			{ status: 403 },
		);
	}

	const startTime = Date.now();

	try {
		const tools = await listMCPTools(provider.endpoint);
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
			provider.endpoint,
			toolName,
			body.args ?? {},
		);
		const durationMs = Date.now() - startTime;

		logActivity({
			agentId: agentSession.agent.id,
			agentName: agentSession.agent.name,
			userId: agentSession.user.id,
			provider: providerName,
			tool: toolName,
			args: JSON.stringify(body.args ?? {}),
			result: JSON.stringify(result),
			status: result.isError ? "error" : "success",
			durationMs,
			inputSchema: JSON.stringify(matchedTool.inputSchema),
		});

		return Response.json(result);
	} catch (err) {
		const durationMs = Date.now() - startTime;
		const errorMsg = err instanceof Error ? err.message : String(err);

		logActivity({
			agentId: agentSession.agent.id,
			agentName: agentSession.agent.name,
			userId: agentSession.user.id,
			provider: providerName,
			tool: toolName,
			args: JSON.stringify(body.args ?? {}),
			result: JSON.stringify({ error: errorMsg }),
			status: "error",
			durationMs,
			inputSchema: "{}",
		});

		return Response.json(
			{ error: `Failed to call tool: ${errorMsg}` },
			{ status: 502 },
		);
	}
}
