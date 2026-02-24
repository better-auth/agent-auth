/**
 * MCP Gateway server — creates an MCP stdio server that proxies
 * tool calls through a web app's gateway API.
 *
 * The web app resolves credentials and forwards to real MCP providers.
 *
 *   list_gateway_tools  → GET  {appUrl}{basePath}/agent/gateway/tools
 *   call_gateway_tool   → POST {appUrl}{basePath}/agent/gateway/call
 *   add_scopes          → POST {appUrl}{basePath}/agent/request-scope
 *
 * basePath is discovered at runtime via GET {appUrl}{basePath}/agent/gateway-config
 */

import { exec } from "node:child_process";
import { platform } from "node:os";
import type { AgentJWK } from "better-auth/plugins/agent-auth/agent-client";

export interface MCPAgentStorage {
	getConnection(agentId: string): Promise<{
		appUrl: string;
		keypair: {
			privateKey: AgentJWK;
			publicKey: AgentJWK;
			kid: string;
		};
		name: string;
		scopes: string[];
	} | null>;
	saveConnection(
		agentId: string,
		connection: {
			appUrl: string;
			keypair: {
				privateKey: AgentJWK;
				publicKey: AgentJWK;
				kid: string;
			};
			name: string;
			scopes: string[];
		},
	): Promise<void>;
	removeConnection(agentId: string): Promise<void>;
	listConnections(): Promise<
		Array<{ agentId: string; appUrl: string; name: string; scopes: string[] }>
	>;
	savePendingFlow?(
		appUrl: string,
		flow: {
			deviceCode: string;
			clientId: string;
			name: string;
			scopes: string[];
		},
	): Promise<void>;
	getPendingFlow?(appUrl: string): Promise<{
		deviceCode: string;
		clientId: string;
		name: string;
		scopes: string[];
	} | null>;
	removePendingFlow?(appUrl: string): Promise<void>;
}

export interface GatewayServerOptions {
	storage: MCPAgentStorage;
	getAuthHeaders?: () =>
		| Record<string, string>
		| Promise<Record<string, string>>;
	onVerificationUrl?: ((url: string) => void | Promise<void>) | false;
	clientId?: string;
	serverName?: string;
	appUrl?: string;
}

function toArray(val: unknown): string[] {
	if (Array.isArray(val)) return val;
	if (typeof val === "string") {
		try {
			const parsed = JSON.parse(val);
			if (Array.isArray(parsed)) return parsed;
		} catch {}
	}
	return [];
}

function openInBrowser(url: string): void {
	const cmd =
		platform() === "darwin"
			? "open"
			: platform() === "win32"
				? "start"
				: "xdg-open";
	exec(`${cmd} "${url}"`);
}

export async function createGatewayServer(
	options: GatewayServerOptions,
): Promise<void> {
	const {
		storage,
		getAuthHeaders,
		onVerificationUrl = openInBrowser,
		clientId,
		serverName = "better-auth-gateway",
		appUrl: configAppUrl,
	} = options;

	const rawUrl = (configAppUrl || process.env.BETTER_AUTH_URL || "").replace(
		/\/+$/,
		"",
	);

	let resolvedAppUrl = rawUrl;
	let resolvedUrlQuery = "";
	try {
		const parsed = new URL(rawUrl);
		resolvedUrlQuery = parsed.search;
		parsed.search = "";
		resolvedAppUrl = parsed.toString().replace(/\/+$/, "");
	} catch {}

	const { createAgentMCPTools, getAgentAuthInstructions } = await import(
		"better-auth/plugins/agent-auth/mcp-tools"
	);
	const { signAgentJWT } = await import(
		"better-auth/plugins/agent-auth/agent-client"
	);
	const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
	const { StdioServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/stdio.js"
	);
	const z = await import("zod");

	const tools = createAgentMCPTools({
		storage,
		getAuthHeaders,
		clientId,
		onVerificationUrl:
			onVerificationUrl === false ? undefined : onVerificationUrl,
	});

	const basePathCache = new Map<string, string>();

	async function resolveBasePath(appUrl: string): Promise<string> {
		const cached = basePathCache.get(appUrl);
		if (cached) return cached;

		const knownPaths = ["/api/auth", "/auth", "/api"];
		for (const prefix of knownPaths) {
			try {
				const res = await globalThis.fetch(
					`${appUrl}${prefix}/agent/gateway-config`,
				);
				if (res.ok) {
					const data = (await res.json()) as { basePath?: string };
					const bp = data.basePath || prefix;
					basePathCache.set(appUrl, bp);
					return bp;
				}
			} catch {}
		}

		const fallback = "/api/auth";
		basePathCache.set(appUrl, fallback);
		return fallback;
	}

	const hasDiscoverParams = resolvedUrlQuery.length > 1;

	let instructions = getAgentAuthInstructions(true);
	if (resolvedAppUrl) {
		instructions +=
			`\n\n## Default App URL\n\n` +
			`The app URL is: ${resolvedAppUrl}\n` +
			`Always use this URL when calling connect_agent. Do NOT ask the user for it.`;
	}
	if (hasDiscoverParams) {
		instructions +=
			`\n\n## Tool Discovery\n\n` +
			`Call discover_tools before connecting — it is pre-configured. Do NOT ask the user for parameters.`;
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
			if (tool.name === "discover_tools" && rawUrl) {
				params.url = rawUrl;
			} else if (resolvedAppUrl && !params.url) {
				params.url = resolvedAppUrl;
			}
			return originalHandler(params);
		};

		server.tool(tool.name, tool.description, zodShape, handler);
	}

	// ── list_gateway_tools ─────────────────────────────────────────────
	server.tool(
		"list_gateway_tools",
		"Discover what third-party tools are available for your connected accounts. " +
			"REQUIRES an Agent ID (call connect_agent first). " +
			"Returns tools from providers the user has connected (GitHub, Slack, etc.).",
		{
			agentId: z.string().describe("Your Agent ID (from connect_agent)"),
		},
		async (params: { agentId: string }) => {
			const { agentId } = params;
			const connection = await storage.getConnection(agentId);
			if (!connection) {
				return {
					content: [
						{
							type: "text" as const,
							text: `No connection found for agent ${agentId}. Call connect_agent first.`,
						},
					],
				};
			}

			const jwt = await signAgentJWT({
				agentId,
				privateKey: connection.keypair.privateKey,
			});

			try {
				const basePath = await resolveBasePath(connection.appUrl);
				const res = await globalThis.fetch(
					`${connection.appUrl}${basePath}/agent/gateway/tools`,
					{ headers: { Authorization: `Bearer ${jwt}` } },
				);

				if (!res.ok) {
					const text = await res.text();
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to fetch tools: ${res.status} ${text.slice(0, 300)}`,
							},
						],
					};
				}

				const data = (await res.json()) as {
					providers: Array<{
						name: string;
						tools: Array<{ name: string; description: string }>;
					}>;
				};

				if (data.providers.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No providers connected. Connect an account (e.g. GitHub) on the web app first.",
							},
						],
					};
				}

				const lines: string[] = ["Available gateway tools:\n"];
				for (const provider of data.providers) {
					lines.push(`## ${provider.name} (${provider.tools.length} tools)`);
					for (const t of provider.tools) {
						lines.push(`  - ${t.name}: ${t.description}`);
					}
					lines.push("");
				}
				lines.push(
					"HOW TO USE:\n" +
						"1. Call add_scopes to request access. Use `<provider>.*` for broad access (the user can narrow it down).\n" +
						"   Example: add_scopes(agentId='...', scopes=['github.*'], name='GitHub Assistant')\n" +
						"2. After the user approves, call call_gateway_tool.\n" +
						'   Example: call_gateway_tool(agentId=\'...\', tool=\'github.list_issues\', args=\'{"owner":"org","repo":"app"}\')\n' +
						"3. If a tool call returns 403, call add_scopes with the specific tool scope.",
				);

				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error fetching tools: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	// ── call_gateway_tool ──────────────────────────────────────────────
	server.tool(
		"call_gateway_tool",
		"Run a third-party tool through the web app gateway. " +
			"Call when the user asks you to: create an issue, list pull requests, " +
			"send a message, search repos, or any action on a connected service. " +
			"REQUIRES: (1) An Agent ID from connect_agent. " +
			"(2) The tool must be in your granted scopes. " +
			"Use list_gateway_tools to discover available tools first.",
		{
			agentId: z.string().describe("Your Agent ID (from connect_agent)"),
			tool: z
				.string()
				.describe(
					"Tool to call in provider.tool format (e.g. 'github.list_issues')",
				),
			args: z
				.string()
				.optional()
				.describe(
					'JSON arguments for the tool (e.g. \'{"owner":"org","repo":"app"}\')',
				),
		},
		async (params: { agentId: string; tool: string; args?: string }) => {
			const { agentId, tool, args: argsJson } = params;

			if (!agentId) {
				return {
					content: [
						{
							type: "text" as const,
							text: "agentId is required. Call connect_agent first.",
						},
					],
				};
			}

			const connection = await storage.getConnection(agentId);
			if (!connection) {
				return {
					content: [
						{
							type: "text" as const,
							text: `No connection found for agent ${agentId}. Call connect_agent first.`,
						},
					],
				};
			}

			let toolArgs: Record<string, unknown> = {};
			if (argsJson) {
				try {
					toolArgs = JSON.parse(argsJson);
				} catch {
					return {
						content: [
							{
								type: "text" as const,
								text: `Invalid JSON in args: ${argsJson}`,
							},
						],
					};
				}
			}

			const jwt = await signAgentJWT({
				agentId,
				privateKey: connection.keypair.privateKey,
			});

			try {
				const basePath = await resolveBasePath(connection.appUrl);
				const res = await globalThis.fetch(
					`${connection.appUrl}${basePath}/agent/gateway/call`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${jwt}`,
						},
						body: JSON.stringify({ tool, args: toolArgs }),
					},
				);

				if (!res.ok) {
					const text = await res.text();
					let errorMsg: string;
					try {
						const errJson = JSON.parse(text);
						errorMsg = errJson.error ?? text;
					} catch {
						errorMsg = text;
					}
					return {
						content: [
							{
								type: "text" as const,
								text: `Tool call failed (${res.status}): ${errorMsg}`,
							},
						],
					};
				}

				const result = (await res.json()) as {
					content: Array<{ type: string; text: string }>;
					isError?: boolean;
				};

				return {
					content: (result.content ?? []).map((c) => ({
						type: (c.type ?? "text") as "text",
						text: c.text ?? JSON.stringify(c),
					})),
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error calling tool: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	// ── add_scopes ───────────────────────────────────────────────────
	server.tool(
		"add_scopes",
		"Request additional scopes for an existing agent connection. " +
			"The user must approve in their browser before the scopes are granted. " +
			"This tool will open the approval page and wait for the user's decision. " +
			"New scopes are MERGED with existing ones — nothing is removed. " +
			"You MUST provide a new name that reflects your expanded role.",
		{
			agentId: z.string().describe("Your Agent ID (from connect_agent)"),
			scopes: z
				.array(z.string())
				.describe(
					"Additional scopes to add (e.g. ['github.create_issue', 'google.send_email'])",
				),
			name: z
				.string()
				.optional()
				.describe(
					"New agent name reflecting the expanded role (e.g. 'GitHub & Email Assistant')",
				),
		},
		async (params: { agentId: string; scopes: string[]; name?: string }) => {
			const { agentId, scopes: newScopes, name } = params;

			if (!agentId) {
				return {
					content: [
						{
							type: "text" as const,
							text: "agentId is required. Call connect_agent first.",
						},
					],
				};
			}

			const connection = await storage.getConnection(agentId);
			if (!connection) {
				return {
					content: [
						{
							type: "text" as const,
							text: `No connection found for agent ${agentId}. Call connect_agent first.`,
						},
					],
				};
			}

			if (!newScopes || newScopes.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: "No scopes provided. Pass an array of scopes to add.",
						},
					],
				};
			}

			const jwt = await signAgentJWT({
				agentId,
				privateKey: connection.keypair.privateKey,
			});

			try {
				const res = await globalThis.fetch(
					`${connection.appUrl}/api/auth/agent/request-scope`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${jwt}`,
						},
						body: JSON.stringify({
							scopes: newScopes,
							name: name || undefined,
						}),
					},
				);

				if (!res.ok) {
					const text = await res.text();
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to add scopes: ${res.status} ${text.slice(0, 300)}`,
							},
						],
					};
				}

				const data = (await res.json()) as {
					requestId?: string;
					status: string;
					verificationUrl?: string;
					message?: string;
					agentId?: string;
					scopes?: string[] | string;
					added?: string[] | string;
				};

				if (data.status === "approved" && data.scopes) {
					const dataScopes = toArray(data.scopes);
					await storage.saveConnection(agentId, {
						...connection,
						scopes: dataScopes,
					});
					return {
						content: [
							{
								type: "text" as const,
								text: `All requested scopes were already present. Current scopes: ${dataScopes.join(", ")}.`,
							},
						],
					};
				}

				if (!data.requestId || !data.verificationUrl) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Unexpected response from server.",
							},
						],
					};
				}

				if (onVerificationUrl) {
					onVerificationUrl(data.verificationUrl);
				}

				const POLL_INTERVAL = 2000;
				const MAX_WAIT = 5 * 60 * 1000;
				const start = Date.now();

				while (Date.now() - start < MAX_WAIT) {
					await new Promise((r) => setTimeout(r, POLL_INTERVAL));

					const pollJwt = await signAgentJWT({
						agentId,
						privateKey: connection.keypair.privateKey,
					});

					const pollRes = await globalThis.fetch(
						`${connection.appUrl}/api/auth/agent/scope-request-status?requestId=${data.requestId}`,
						{ headers: { Authorization: `Bearer ${pollJwt}` } },
					);

					if (!pollRes.ok) continue;

					const poll = (await pollRes.json()) as {
						status: string;
						scopes?: string[] | string;
						added?: string[] | string;
					};

					if (poll.status === "approved") {
						const scopes = toArray(poll.scopes);
						const added = toArray(poll.added);
						if (scopes.length > 0) {
							const updated = { ...connection, scopes };
							if (name) updated.name = name;
							await storage.saveConnection(agentId, updated);
						}
						const addedMsg =
							added.length > 0 ? `Added: ${added.join(", ")}.` : "";
						return {
							content: [
								{
									type: "text" as const,
									text: `Scopes approved. ${addedMsg}${scopes.length > 0 ? ` Current scopes: ${scopes.join(", ")}.` : ""}`,
								},
							],
						};
					}

					if (poll.status === "denied") {
						return {
							content: [
								{
									type: "text" as const,
									text: "Scope escalation was denied by the user.",
								},
							],
						};
					}
				}

				return {
					content: [
						{
							type: "text" as const,
							text:
								"Timed out waiting for scope approval. Ask the user to approve at: " +
								data.verificationUrl,
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error adding scopes: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	const transport = new StdioServerTransport();
	await server.connect(transport);

	const revokeAll = buildRevokeAll(storage, signAgentJWT);
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

	process.stderr.write(
		`[${serverName}] Running on stdio (web-app proxy mode)\n`,
	);
}

function buildRevokeAll(
	storage: MCPAgentStorage,
	signJWT: (opts: { agentId: string; privateKey: AgentJWK }) => Promise<string>,
) {
	return async () => {
		const connections = await storage.listConnections();
		for (const conn of connections) {
			const full = await storage.getConnection(conn.agentId);
			if (!full) continue;
			try {
				const jwt = await signJWT({
					agentId: conn.agentId,
					privateKey: full.keypair.privateKey,
				});
				await globalThis.fetch(`${full.appUrl}/api/auth/agent/revoke`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({ agentId: conn.agentId }),
				});
			} catch {
				// best-effort
			}
			await storage.removeConnection(conn.agentId);
		}
	};
}
