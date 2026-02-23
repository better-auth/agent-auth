/**
 * MCP Bridge — connects to provider MCP servers using OAuth tokens.
 *
 * Supports two transports:
 * - HTTP (Streamable-HTTP): for remote MCP endpoints (e.g. GitHub Copilot MCP)
 * - Stdio: spawns a local process and communicates via stdin/stdout
 *
 * Tool discovery results are cached globally per provider with a 1-hour TTL.
 */

import type {
	HttpProviderBridge,
	McpTool,
	ProviderBridgeConfig,
	StdioProviderBridge,
	ToolResult,
} from "./types";

const CACHE_TTL_MS = 60 * 60 * 1000;
const toolCache = new Map<string, { tools: McpTool[]; fetchedAt: number }>();

// ── HTTP transport ──────────────────────────────────────────────────────

function parseLastSSEData(raw: string): unknown {
	let last = "";
	for (const line of raw.split("\n")) {
		if (line.startsWith("data: ")) last = line.slice(6);
	}
	return last ? JSON.parse(last) : null;
}

async function mcpPost(
	endpoint: string,
	authHeaders: Record<string, string>,
	body: Record<string, unknown>,
	sessionId?: string,
): Promise<{ json: unknown; sessionId?: string }> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
		...authHeaders,
	};
	if (sessionId) headers["Mcp-Session-Id"] = sessionId;

	const res = await fetch(endpoint, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15_000),
	});

	const sid = res.headers.get("mcp-session-id") ?? sessionId;

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`MCP ${res.status}: ${text.slice(0, 500)}`);
	}

	const ct = res.headers.get("content-type") ?? "";
	let json: unknown;
	if (ct.includes("text/event-stream")) {
		json = parseLastSSEData(await res.text());
	} else {
		const text = await res.text();
		if (!text.trim()) throw new Error("MCP returned empty response");
		json = JSON.parse(text);
	}

	return { json, sessionId: sid || undefined };
}

async function httpOpenSession(
	config: HttpProviderBridge,
	token: string,
): Promise<{ sessionId?: string; authHeaders: Record<string, string> }> {
	const authHeaders = config.getAuthHeaders(token);

	const init = await mcpPost(config.mcpEndpoint, authHeaders, {
		jsonrpc: "2.0",
		method: "initialize",
		params: {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "better-auth-gateway", version: "1.0.0" },
		},
		id: 1,
	});

	mcpPost(
		config.mcpEndpoint,
		authHeaders,
		{ jsonrpc: "2.0", method: "notifications/initialized" },
		init.sessionId,
	).catch(() => {});

	return { sessionId: init.sessionId, authHeaders };
}

async function httpDiscoverTools(
	config: HttpProviderBridge,
	token: string,
): Promise<McpTool[]> {
	const session = await httpOpenSession(config, token);
	const res = await mcpPost(
		config.mcpEndpoint,
		session.authHeaders,
		{ jsonrpc: "2.0", method: "tools/list", id: 2 },
		session.sessionId,
	);
	const data = res.json as { result?: { tools?: McpTool[] } } | null;
	return data?.result?.tools ?? [];
}

async function httpCallTool(
	config: HttpProviderBridge,
	token: string,
	toolName: string,
	args: Record<string, unknown>,
): Promise<ToolResult> {
	const session = await httpOpenSession(config, token);
	const res = await mcpPost(
		config.mcpEndpoint,
		session.authHeaders,
		{
			jsonrpc: "2.0",
			method: "tools/call",
			params: { name: toolName, arguments: args },
			id: 3,
		},
		session.sessionId,
	);

	const data = res.json as {
		result?: {
			content?: Array<{ type: string; text: string }>;
			isError?: boolean;
		};
		error?: { message: string };
	} | null;

	if (data?.error) {
		return {
			content: [{ type: "text", text: data.error.message }],
			isError: true,
		};
	}
	return {
		content: data?.result?.content ?? [{ type: "text", text: "No response" }],
		isError: data?.result?.isError,
	};
}

// ── Stdio transport ─────────────────────────────────────────────────────

type SdkClient = import("@modelcontextprotocol/sdk/client/index.js").Client;

async function createStdioClient(
	config: StdioProviderBridge,
	token: string,
): Promise<SdkClient> {
	const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
	const { StdioClientTransport } = await import(
		"@modelcontextprotocol/sdk/client/stdio.js"
	);

	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v !== undefined) env[k] = v;
	}
	Object.assign(env, config.getEnv(token));

	const transport = new StdioClientTransport({
		command: config.command,
		args: config.args ?? [],
		env,
	});

	const client = new Client({
		name: "better-auth-gateway",
		version: "1.0.0",
	});
	await client.connect(transport);
	return client;
}

async function stdioDiscoverTools(
	config: StdioProviderBridge,
	token: string,
): Promise<McpTool[]> {
	const client = await createStdioClient(config, token);
	try {
		const result = await client.listTools();
		return (result.tools ?? []).map((t) => ({
			name: t.name,
			description: t.description ?? "",
			inputSchema: t.inputSchema as Record<string, unknown> | undefined,
		}));
	} finally {
		await client.close().catch(() => {});
	}
}

async function stdioCallTool(
	config: StdioProviderBridge,
	token: string,
	toolName: string,
	args: Record<string, unknown>,
): Promise<ToolResult> {
	const client = await createStdioClient(config, token);
	try {
		const result = await client.callTool({ name: toolName, arguments: args });
		return {
			content: (result.content ?? []) as Array<{ type: string; text: string }>,
			isError: result.isError as boolean | undefined,
		};
	} finally {
		await client.close().catch(() => {});
	}
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Discover tools from a provider's MCP server.
 * Cached globally per cacheKey with a 1-hour TTL.
 */
export async function discoverTools(
	config: ProviderBridgeConfig,
	token: string,
	cacheKey?: string,
): Promise<McpTool[]> {
	if (cacheKey) {
		const cached = toolCache.get(cacheKey);
		if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
			return cached.tools;
		}
	}

	try {
		const tools =
			config.transport === "http"
				? await httpDiscoverTools(config, token)
				: await stdioDiscoverTools(config, token);

		if (cacheKey) {
			toolCache.set(cacheKey, { tools, fetchedAt: Date.now() });
		}
		return tools;
	} catch (err) {
		if (cacheKey) {
			const cached = toolCache.get(cacheKey);
			if (cached) return cached.tools;
		}
		throw err;
	}
}

/**
 * Call a tool on the provider's MCP server.
 */
export async function callTool(
	config: ProviderBridgeConfig,
	token: string,
	toolName: string,
	args: Record<string, unknown>,
): Promise<ToolResult> {
	return config.transport === "http"
		? httpCallTool(config, token, toolName, args)
		: stdioCallTool(config, token, toolName, args);
}

/** Evict cached tools for a provider. */
export function invalidateToolCache(provider: string): void {
	toolCache.delete(provider);
}
