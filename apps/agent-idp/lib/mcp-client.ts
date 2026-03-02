import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface MCPTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

const toolsCache = new Map<string, { tools: MCPTool[]; fetchedAt: number }>();
const CACHE_TTL = 60_000;

async function withClient<T>(
	endpoint: string,
	fn: (client: Client) => Promise<T>,
): Promise<T> {
	const transport = new StreamableHTTPClientTransport(new URL(endpoint));
	const client = new Client({ name: "agent-auth-gateway", version: "1.0.0" });
	try {
		await client.connect(transport);
		return await fn(client);
	} finally {
		try {
			await client.close();
		} catch {}
	}
}

export async function listMCPTools(endpoint: string): Promise<MCPTool[]> {
	const cached = toolsCache.get(endpoint);
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
		return cached.tools;
	}

	const tools = await withClient(endpoint, async (client) => {
		const result = await client.listTools();
		return result.tools.map((t) => ({
			name: t.name,
			description: t.description ?? "",
			inputSchema: t.inputSchema as Record<string, unknown>,
		}));
	});

	toolsCache.set(endpoint, { tools, fetchedAt: Date.now() });
	return tools;
}

export async function callMCPTool(
	endpoint: string,
	toolName: string,
	args: Record<string, unknown>,
): Promise<{
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}> {
	return withClient(endpoint, async (client) => {
		const result = await client.callTool({
			name: toolName,
			arguments: args,
		});
		return {
			content: (result.content as Array<{ type: string; text: string }>).map(
				(c) => ({
					type: c.type ?? "text",
					text: c.text ?? JSON.stringify(c),
				}),
			),
			isError: (result.isError as boolean) ?? false,
		};
	});
}
