import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface MCPTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

const toolsCache = new Map<string, { tools: MCPTool[]; fetchedAt: number }>();
const CACHE_TTL = 60_000;

const CONNECTION_TIMEOUT = 3_000;

async function withClient<T>(
	endpoint: string,
	fn: (client: Client) => Promise<T>,
	headers?: Record<string, string>,
): Promise<T> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), CONNECTION_TIMEOUT);
	try {
		const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
			requestInit: {
				signal: abortController.signal,
				headers,
			},
		});
		const client = new Client({
			name: "agent-auth-gateway",
			version: "1.0.0",
		});

		await Promise.race([
			client.connect(transport),
			new Promise<never>((_, reject) => {
				abortController.signal.addEventListener("abort", () =>
					reject(new Error(`MCP connection to ${endpoint} timed out`)),
				);
			}),
		]);

		return await Promise.race([
			fn(client),
			new Promise<never>((_, reject) => {
				abortController.signal.addEventListener("abort", () =>
					reject(new Error(`MCP operation on ${endpoint} timed out`)),
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
		abortController.abort();
	}
}

export async function listMCPTools(
	endpoint: string,
	headers?: Record<string, string>,
): Promise<MCPTool[]> {
	const cacheKey = headers?.Authorization
		? `${endpoint}::${headers.Authorization.slice(-8)}`
		: endpoint;
	const cached = toolsCache.get(cacheKey);
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
		return cached.tools;
	}

	try {
		const tools = await withClient(
			endpoint,
			async (client) => {
				const result = await client.listTools();
				return result.tools.map((t) => ({
					name: t.name,
					description: t.description ?? "",
					inputSchema: t.inputSchema as Record<string, unknown>,
				}));
			},
			headers,
		);

		toolsCache.set(cacheKey, { tools, fetchedAt: Date.now() });
		return tools;
	} catch {
		return [];
	}
}

export async function callMCPTool(
	endpoint: string,
	toolName: string,
	args: Record<string, unknown>,
	headers?: Record<string, string>,
): Promise<{
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}> {
	return withClient(
		endpoint,
		async (client) => {
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
		},
		headers,
	);
}
