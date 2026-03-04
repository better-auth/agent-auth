/**
 * MCP stdio server — creates an MCP server on stdio transport that
 * registers all Agent Auth client tools.
 *
 * All spec-defined client tools (discover, list_capabilities, connect_agent,
 * call_tool, request_scope, etc.) are provided by createAgentMCPTools.
 * This module adds the stdio transport and lifecycle management.
 *
 * Requires `@modelcontextprotocol/sdk` as a peer dependency.
 */

import { signAgentJWT } from "./crypto";
import type { CreateAgentMCPToolsOptions, MCPAgentStorage } from "./mcp-tools";
import { createAgentMCPTools, getAgentAuthInstructions } from "./mcp-tools";

export type { MCPAgentStorage } from "./mcp-tools";

export interface MCPServerOptions
	extends Omit<CreateAgentMCPToolsOptions, "onVerificationUrl" | "defaultUrl"> {
	/**
	 * Called when a verification URL is available during device auth flow.
	 * Set to `false` to disable auto-opening.
	 * Default: opens URL in the user's default browser.
	 */
	onVerificationUrl?: ((url: string) => void | Promise<void>) | false;
	/** MCP server name. Default: "better-auth-agent" */
	serverName?: string;
	/**
	 * App URL, optionally with query params for discovery.
	 * Example: "http://localhost:3000" or "http://localhost:3000?referenceId=abc"
	 */
	appUrl?: string;
	/**
	 * Hook called after all built-in tools are registered but before the
	 * transport is connected. Use this to add custom tools to the MCP server.
	 *
	 * @param server - The McpServer instance
	 * @param z - The zod module for defining tool schemas
	 */
	onServerReady?: (
		server: unknown,
		z: typeof import("zod"),
	) => void | Promise<void>;
}

async function openInBrowser(url: string): Promise<void> {
	const { exec } = await import("node:child_process");
	const { platform } = await import("node:os");
	const cmd =
		platform() === "darwin"
			? "open"
			: platform() === "win32"
				? "start"
				: "xdg-open";
	exec(`${cmd} "${url}"`);
}

/**
 * Create and start an MCP server on stdio.
 *
 * Registers all Agent Auth client tools and connects via stdio transport.
 *
 * @example
 * ```ts
 * import { createMCPServer } from "@auth/agents/mcp-server";
 * import { createFileStorage } from "@auth/agents/mcp-storage-fs";
 *
 * await createMCPServer({
 *   storage: createFileStorage({ encryptionKey: process.env.ENCRYPTION_KEY }),
 *   appUrl: "https://myapp.com",
 *   serverName: "my-agent-server",
 * });
 * ```
 */
export async function createMCPServer(
	options: MCPServerOptions,
): Promise<void> {
	const {
		storage,
		getAuthHeaders,
		onVerificationUrl = openInBrowser,
		clientId,
		resolveAuthorizationDetails,
		serverName = "better-auth-agent",
		appUrl: configAppUrl,
	} = options;

	const rawUrl = (configAppUrl || process.env.BETTER_AUTH_URL || "").replace(
		/\/+$/,
		"",
	);

	let resolvedAppUrl = rawUrl;
	try {
		const parsed = new URL(rawUrl);
		parsed.search = "";
		resolvedAppUrl = parsed.toString().replace(/\/+$/, "");
	} catch {}

	const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
	const { StdioServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/stdio.js"
	);
	const z = await import("zod");

	const { tools } = createAgentMCPTools({
		storage,
		getAuthHeaders,
		clientId,
		resolveAuthorizationDetails,
		onVerificationUrl:
			onVerificationUrl === false ? undefined : onVerificationUrl,
		defaultUrl: resolvedAppUrl || undefined,
	});

	// Auto-discover on startup so provider names resolve immediately
	if (resolvedAppUrl && storage.saveProviderConfig) {
		try {
			const discoverTool = tools.find((t) => t.name === "discover");
			if (discoverTool) {
				await discoverTool.handler({ url: resolvedAppUrl });
				process.stderr.write(
					`[${serverName}] Auto-discovered ${resolvedAppUrl}\n`,
				);
			}
		} catch {
			process.stderr.write(
				`[${serverName}] Auto-discovery failed for ${resolvedAppUrl} (server may not be running yet)\n`,
			);
		}
	}

	let instructions = getAgentAuthInstructions();
	if (resolvedAppUrl) {
		instructions +=
			`\n\n## Default App URL\n\n` +
			`The app URL is: ${resolvedAppUrl}\n` +
			`Always use this URL when calling connect_agent. Do NOT ask the user for it.`;
	}
	if (rawUrl && rawUrl !== resolvedAppUrl) {
		instructions +=
			`\n\n## Tool Discovery\n\n` +
			`Call discover before connecting — it is pre-configured. Do NOT ask the user for parameters.`;
	}

	const server = new McpServer(
		{ name: serverName, version: "1.0.0" },
		{ instructions },
	);

	for (const tool of tools) {
		const zodShape: Record<string, ReturnType<typeof z.string>> = {};
		for (const [key, schema] of Object.entries(tool.inputSchema)) {
			zodShape[key] = schema as ReturnType<typeof z.string>;
		}

		const originalHandler = tool.handler;
		const handler = async (params: Record<string, string | string[]>) => {
			// Auto-inject url for discover when appUrl is configured
			if (tool.name === "discover" && rawUrl && !params.url) {
				params.url = rawUrl;
			}
			// Auto-inject provider/url for tools that need it
			if (resolvedAppUrl && !params.provider && !params.url) {
				if ("provider" in tool.inputSchema) {
					params.provider = resolvedAppUrl;
				} else if ("url" in tool.inputSchema) {
					params.url = resolvedAppUrl;
				}
			}
			return originalHandler(params);
		};

		server.tool(tool.name, tool.description, zodShape, handler);
	}

	if (options.onServerReady) {
		await options.onServerReady(server, z);
	}

	const transport = new StdioServerTransport();
	await server.connect(transport);

	const revokeAll = buildRevokeAll(storage);
	const cleanup = async () => {
		await revokeAll();
	};

	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, async () => {
			process.stderr.write(`[${serverName}] ${signal}, cleaning up…\n`);
			await cleanup();
			process.exit(0);
		});
	}

	transport.onclose = async () => {
		process.stderr.write(`[${serverName}] Transport closed, cleaning up…\n`);
		await cleanup();
		process.exit(0);
	};

	process.stderr.write(`[${serverName}] Running on stdio\n`);
}

function buildRevokeAll(storage: MCPAgentStorage) {
	return async () => {
		const connections = await storage.listConnections();
		for (const conn of connections) {
			const full = await storage.getConnection(conn.agentId);
			if (!full) continue;
			try {
				const jwt = await signAgentJWT({
					agentId: conn.agentId,
					privateKey: full.keypair.privateKey,
					audience: new URL(full.appUrl).origin,
				});
				await globalThis.fetch(`${full.appUrl}/api/auth/agent/revoke`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({ agentId: conn.agentId }),
				});
			} catch {}
			await storage.removeConnection(conn.agentId);
		}
	};
}
