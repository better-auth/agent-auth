import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_BASE = "https://mcp.cloudflare.com";

/**
 * Dynamically register this proxy with the Cloudflare MCP server (RFC 7591).
 * Returns the issued `client_id`. No client secret is needed since we
 * register with `token_endpoint_auth_method: "none"`.
 */
export async function registerMcpClient(redirectUri: string): Promise<string> {
	const res = await fetch(`${MCP_BASE}/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			client_name: "Cloudflare Agent Auth Proxy",
		}),
	});

	if (!res.ok) {
		throw new Error(
			`MCP dynamic registration failed: ${res.status} ${await res.text()}`
		);
	}

	const data = (await res.json()) as { client_id: string };
	return data.client_id;
}

/**
 * Call an MCP tool on the Cloudflare MCP server.
 * Creates a fresh Streamable HTTP client per call (the server is stateless).
 */
export async function callMcpTool(
	mcpToken: string,
	toolName: string,
	args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text?: string }> }> {
	const transport = new StreamableHTTPClientTransport(
		new URL(`${MCP_BASE}/mcp`),
		{
			requestInit: {
				headers: {
					Authorization: `Bearer ${mcpToken}`,
				},
			},
		}
	);

	const client = new Client(
		{ name: "cloudflare-proxy", version: "0.1.0" },
		{ capabilities: {} }
	);

	await client.connect(transport);

	try {
		const result = await client.callTool({
			name: toolName,
			arguments: args,
		});
		return result as {
			content: Array<{ type: string; text?: string }>;
		};
	} finally {
		await client.close();
	}
}

/**
 * Parse the text content from an MCP tool result.
 */
export function parseToolResult(result: {
	content: Array<{ type: string; text?: string }>;
}): unknown {
	const textContent = result.content?.find((c) => c.type === "text");
	if (!textContent?.text) {
		return null;
	}
	try {
		return JSON.parse(textContent.text);
	} catch {
		return textContent.text;
	}
}
