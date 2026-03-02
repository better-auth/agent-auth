import { verifyAgentRequest } from "@better-auth/agent-auth";
import { auth } from "@/lib/auth";
import { listMCPTools } from "@/lib/mcp-client";
import { listProviders } from "@/lib/mcp-providers";

export async function GET(request: Request) {
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

	const providers = listProviders(agentSession.user.id);
	const result: Array<{
		name: string;
		tools: Array<{
			name: string;
			description: string;
			inputSchema: Record<string, unknown>;
		}>;
	}> = [];

	for (const provider of providers) {
		try {
			const tools = await listMCPTools(provider.endpoint);
			result.push({
				name: provider.name,
				tools: tools.map((t) => ({
					name: t.name,
					description: t.description,
					inputSchema: t.inputSchema,
				})),
			});
		} catch {
			result.push({ name: provider.name, tools: [] });
		}
	}

	return Response.json({ providers: result });
}
