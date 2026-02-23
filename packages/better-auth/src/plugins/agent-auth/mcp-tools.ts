/**
 * MCP tool definitions for Agent Auth.
 *
 * These are portable tool descriptors that developers register
 * in their MCP servers. The storage layer is injected so this
 * module has no Node.js dependencies.
 *
 * All tools are keyed by `agentId` — each connect_agent call
 * creates a fresh identity. The AI passes the agentId it received
 * to subsequent tools within the same conversation.
 */

import * as z from "zod";
import type { AgentJWK } from "./crypto";
import { generateAgentKeypair, signAgentJWT } from "./crypto";

export interface AgentKeypair {
	privateKey: AgentJWK;
	publicKey: AgentJWK;
	kid: string;
}

export interface AgentConnectionData {
	appUrl: string;
	keypair: AgentKeypair;
	name: string;
	scopes: string[];
}

/**
 * Storage interface for MCP agent tools.
 *
 * Three implementations:
 * - **Memory** (default): agents in-memory, ephemeral
 * - **File**: one file per agent on disk
 * - **Database**: implement this interface with your own DB
 */
export interface MCPAgentStorage {
	/** Get a connection by agent ID (includes keypair). */
	getConnection(agentId: string): Promise<AgentConnectionData | null>;
	/** Save a connection keyed by agent ID. */
	saveConnection(
		agentId: string,
		connection: AgentConnectionData,
	): Promise<void>;
	/** Remove a connection by agent ID. */
	removeConnection(agentId: string): Promise<void>;
	/** List all stored connections. */
	listConnections(): Promise<
		Array<{
			agentId: string;
			appUrl: string;
			name: string;
			scopes: string[];
		}>
	>;

	/** Store a pending device auth flow so connect_complete can finish it. */
	savePendingFlow?(
		appUrl: string,
		flow: {
			deviceCode: string;
			clientId: string;
			name: string;
			scopes: string[];
		},
	): Promise<void>;
	/** Retrieve a pending device auth flow. */
	getPendingFlow?(appUrl: string): Promise<{
		deviceCode: string;
		clientId: string;
		name: string;
		scopes: string[];
	} | null>;
	/** Remove a pending device auth flow. */
	removePendingFlow?(appUrl: string): Promise<void>;
}

export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, z.ZodType>;
	handler: (input: Record<string, string | string[]>) => Promise<{
		content: Array<{ type: "text"; text: string }>;
	}>;
}

export interface CreateAgentMCPToolsOptions {
	storage: MCPAgentStorage;
	/**
	 * Auth headers to attach when creating/revoking agents via direct method.
	 * If not provided, the `connect_agent` tool will use the device
	 * authorization flow instead (recommended).
	 */
	getAuthHeaders?: () =>
		| Record<string, string>
		| Promise<Record<string, string>>;
	/** Client ID for device auth flow. Default: "agent-auth" */
	clientId?: string;
	/**
	 * Called when a verification URL is available during device auth flow.
	 * Use this to automatically open the URL in the user's browser.
	 * Receives the `verification_uri_complete` (with user code pre-filled).
	 */
	onVerificationUrl?: (url: string) => void | Promise<void>;
	/**
	 * Build RFC 9396 authorization_details objects for the consent screen.
	 * The gateway sets this to map tool scope names to structured details.
	 *
	 * @see https://datatracker.ietf.org/doc/html/rfc9396
	 */
	resolveAuthorizationDetails?: (scopes: string[]) => Array<{
		type: string;
		locations?: string[];
		actions?: string[];
		identifier?: string;
		description?: string;
		[key: string]: string | string[] | undefined;
	}>;
}

/**
 * Helper: try to register an agent with a token, return the response or null on auth failure.
 */
async function tryRegisterAgent(
	url: string,
	token: string,
	body: { name: string; publicKey: AgentJWK; scopes: string[] },
): Promise<{ agentId: string; scopes: string[] } | null> {
	const res = await globalThis.fetch(`${url}/api/auth/agent/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			Origin: url,
		},
		body: JSON.stringify(body),
	});

	if (res.ok) {
		return (await res.json()) as { agentId: string; scopes: string[] };
	}

	// Auth failure — token expired or invalid
	if (res.status === 401 || res.status === 403) {
		return null;
	}

	// Other error — throw with details
	const err = await res.text();
	throw new Error(`Failed to register agent: ${err}`);
}

/**
 * MCP server instructions for Agent Auth.
 *
 * Pass this to `new McpServer(info, { instructions })` so clients
 * (Cursor, Claude Desktop, etc.) know how to drive the tools.
 *
 * @param hasGateway - true if the server includes gateway tools
 */
export function getAgentAuthInstructions(hasGateway = false): string {
	const lines: string[] = [
		"You are connected to an Agent Auth MCP server that lets you authenticate and act on behalf of users.",
		"",
		"## When to use these tools",
		"",
		"Use these tools whenever the user asks you to:",
		"- Connect, sign in, log in, authenticate, hire an agent, or access an app",
		"- Perform actions on third-party services (create issues, list PRs, send messages, etc.)",
		"- Fetch data or call APIs on a connected app",
		"- Check connection status, list agents, disconnect, or log out",
		"",
		"## Quick-start workflow",
		"",
	];

	if (hasGateway) {
		lines.push(
			"### Step 1 — Discover tools (if configured)",
			"",
			"If the url is pre-configured, call `discover_tools` before connecting:",
			'  `discover_tools(url="<app-url>")`',
			"The url may include query parameters that identify the target context (e.g. `?referenceId=abc`).",
			"This returns providers and tool names without authentication. Use the returned tool names as **specific scopes** in Step 2.",
			"If no url is pre-configured for discovery, skip to Step 2.",
			"",
			"### Step 2 — Connect",
			"",
			'  `connect_agent(url="<app-url>", name="<task-specific name>", scopes=["<provider>.<tool>", ...])`',
			"- Pick a descriptive name reflecting the user's request.",
			'- If you discovered tools in Step 1, pass the exact tool names as scopes (e.g. `["github.list_issues"]`).',
			"- If you skipped Step 1, omit `scopes` to let the user choose on the approval page.",
			"- The user will see an approval page in their browser. Tell them to approve.",
			"- **Save the returned Agent ID.**",
			"",
			"### Step 3 — List tools",
			"",
			'  `list_gateway_tools(agentId="<agent-id>")`',
			"Read the returned list carefully. Use the **exact** provider and tool names returned.",
			"**The user already granted permissions. You are ready to call tools now.**",
			"",
			"### Step 4 — Call tools",
			"",
			'  `call_gateway_tool(agentId="<agent-id>", tool="<provider>.<tool_name>", args=\'{ ... }\')`',
			"`args` is a JSON string matching the tool's input schema from step 3.",
			"**Just call the tool directly. Do NOT call `add_scopes` first.**",
			"",
			"### Step 5 — Disconnect when done",
			"",
			'  `disconnect_agent(agentId="<agent-id>")`',
		);
	} else {
		lines.push(
			"1. **Connect** — call `connect_agent` with the app URL, a task-specific name, and the scopes you need.",
			"   - The user may need to approve in their browser. Tell them and wait.",
			"   - You will receive an **Agent ID**. SAVE IT.",
			"2. **Use the Agent ID everywhere** — pass it as `agentId` to every subsequent tool call.",
			"3. **Re-use, don't re-create** — if you already have an Agent ID, pass it to `connect_agent` to reuse your session.",
		);
	}

	lines.push(
		"",
		"## Calling the app's own API",
		"",
		"- Use `agent_request` to make authenticated HTTP requests to the app's endpoints.",
		"- Example: `agent_request(agentId, path='/api/data', method='GET')`",
		"",
		"## Rules",
		"",
		"1. **NEVER call `add_scopes` unless a `call_gateway_tool` returned a 403 error.** The user already approved scopes during `connect_agent`. Calling `add_scopes` preemptively forces the user to approve again for no reason. Always try the tool call first.",
		"2. **NEVER invent an Agent ID.** Only use one returned by `connect_agent`.",
		"3. **NEVER guess provider or tool names.** Discover or list tools first, use exact names.",
		"4. **NEVER disconnect and reconnect** just to get more scopes.",
		"5. If a `call_gateway_tool` returns **403**, then and only then call `add_scopes` with the specific tool that was denied.",
		"6. Use descriptive agent names that reflect the task (e.g. 'PR Review Agent'), not generic ones.",
		"7. Call `disconnect_agent` when you are done with a task to clean up.",
	);

	return lines.join("\n");
}

/**
 * Create MCP tool definitions for agent management.
 * Register these in your MCP server via `server.registerTool()`.
 */
export function createAgentMCPTools(
	options: CreateAgentMCPToolsOptions,
): MCPToolDefinition[] {
	const {
		storage,
		getAuthHeaders,
		clientId = "agent-auth",
		onVerificationUrl,
		resolveAuthorizationDetails,
	} = options;

	async function resolveAuthHeaders(): Promise<Record<string, string>> {
		if (!getAuthHeaders) return {};
		return await getAuthHeaders();
	}

	/**
	 * Health-check an existing connection. Returns true if the agent session
	 * is still valid on the server, false otherwise.
	 */
	async function isConnectionHealthy(
		agentId: string,
		connection: AgentConnectionData,
	): Promise<boolean> {
		try {
			const jwt = await signAgentJWT({
				agentId,
				privateKey: connection.keypair.privateKey,
			});
			const res = await globalThis.fetch(
				`${connection.appUrl}/api/auth/agent/get-session`,
				{ headers: { Authorization: `Bearer ${jwt}` } },
			);
			return res.ok;
		} catch {
			return false;
		}
	}

	const tools: MCPToolDefinition[] = [
		{
			name: "discover_tools",
			description:
				"Discover available tools and providers BEFORE connecting. " +
				"Call this to find out what tools are available, so you can request specific scopes " +
				"during connect_agent instead of broad wildcards. " +
				"This does NOT require authentication. " +
				"The url may include query parameters (e.g. referenceId) that identify the target context.",
			inputSchema: {
				url: z
					.string()
					.describe(
						"App URL, optionally with query params (e.g. https://myapp.com?referenceId=abc)",
					),
			},
			handler: async (input) => {
				const rawUrl = (input.url as string).replace(/\/+$/, "");
				let baseUrl = rawUrl;
				let query = "";
				try {
					const parsed = new URL(rawUrl);
					query = parsed.search;
					parsed.search = "";
					baseUrl = parsed.toString().replace(/\/+$/, "");
				} catch {}
				const _sep = query ? "&" : "?";

				try {
					const res = await globalThis.fetch(
						`${baseUrl}/api/agent/gateway/discover${query}`,
					);

					if (!res.ok) {
						const err = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to discover tools: ${err}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						orgId: string;
						providers: Array<{
							name: string;
							displayName: string;
							tools: Array<{ name: string; description: string }>;
						}>;
						cached: boolean;
					};

					if (data.providers.length === 0) {
						return {
							content: [
								{
									type: "text" as const,
									text: "No providers found for this organization. The user may need to connect services in the dashboard first.",
								},
							],
						};
					}

					const lines: string[] = [
						`Found ${data.providers.length} provider(s):`,
					];
					for (const p of data.providers) {
						if (p.tools.length > 0) {
							lines.push(
								`\n${p.displayName} (${p.name}): ${p.tools.length} tools`,
							);
							for (const t of p.tools) {
								lines.push(`  - ${p.name}.${t.name}: ${t.description}`);
							}
						} else {
							lines.push(
								`\n${p.displayName} (${p.name}): tools not yet cached — they will be available after first connection`,
							);
						}
					}
					lines.push(
						"\nUse these tool names as scopes when calling connect_agent. " +
							'Example: connect_agent(url=..., scopes=["github.list_issues", "github.create_issue"])',
					);

					return {
						content: [{ type: "text" as const, text: lines.join("\n") }],
					};
				} catch (err) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to discover tools: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}
			},
		},
		{
			name: "connect_agent",
			description:
				"Authenticate and connect to an app as an AI agent. " +
				"Call this when the user asks you to: connect, sign in, log in, authenticate, " +
				"access an app, hire an agent, act on their behalf, use a service, " +
				"or perform any task that requires authorization (e.g. creating issues, " +
				"reading pull requests, sending messages, managing files). " +
				"Returns an Agent ID you MUST save and reuse for all subsequent calls. " +
				"RULES: (1) Call ONCE per conversation. (2) SAVE the Agent ID. " +
				"(3) Pass it as agentId if re-calling. (4) If user approval is needed, tell them and wait." +
				(getAuthHeaders
					? ""
					: " Uses device authorization (browser approval)."),
			inputSchema: {
				url: z.string().describe("App URL (e.g. https://myapp.com)"),
				name: z
					.string()
					.describe(
						"Short task-based name (e.g. 'PR Review Agent', 'Issue Creator'). NOT generic names like 'Cursor Agent'.",
					),
				scopes: z
					.array(z.string())
					.optional()
					.describe(
						"Permissions to request. Use tool names from list_gateway_tools in provider.tool format " +
							"(e.g. ['github.create_issue', 'github.list_pull_requests']). " +
							"Request ONLY what you need for the user's current task.",
					),
				agentId: z
					.string()
					.optional()
					.describe(
						"Pass your Agent ID here if you already received one in this conversation. " +
							"This reuses your existing identity instead of creating a new one. " +
							"ONLY omit this on your very first connect_agent call.",
					),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");
				const name = (input.name as string) ?? "MCP Agent";
				const scopes = (input.scopes as string[]) ?? [];
				const existingAgentId = input.agentId as string | undefined;

				// Explicit agentId — reuse that specific connection
				if (existingAgentId) {
					const existing = await storage.getConnection(existingAgentId);
					if (existing) {
						const healthy = await isConnectionHealthy(
							existingAgentId,
							existing,
						);
						if (healthy) {
							return {
								content: [
									{
										type: "text" as const,
										text: `Reusing connection. Agent ID: ${existingAgentId}. Name: "${existing.name}". URL: ${existing.appUrl}. Scopes: ${existing.scopes.join(", ") || "none"}.`,
									},
								],
							};
						}
					}
					// agentId invalid or stale — fall through to create fresh
				}

				// Fresh identity — each conversation gets its own agent
				const keypair = await generateAgentKeypair();

				// Direct auth mode (cookie/token in env)
				if (getAuthHeaders) {
					const authHeaders = await resolveAuthHeaders();
					const res = await globalThis.fetch(`${url}/api/auth/agent/create`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...authHeaders,
						},
						body: JSON.stringify({
							name,
							publicKey: keypair.publicKey,
							scopes,
						}),
					});

					if (!res.ok) {
						const err = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to connect: ${err}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						agentId: string;
						scopes: string[];
					};

					await storage.saveConnection(data.agentId, {
						appUrl: url,
						keypair,
						name,
						scopes: data.scopes,
					});

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agentId}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				}

				// Device authorization flow — every new identity requires explicit approval
				const authorizationDetails = resolveAuthorizationDetails
					? resolveAuthorizationDetails(scopes)
					: undefined;

				const codeRes = await globalThis.fetch(`${url}/api/auth/device/code`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						client_id: clientId,
						scope: scopes.join(" "),
						client_name: name,
						authorization_details: authorizationDetails,
					}),
				});

				if (!codeRes.ok) {
					const err = await codeRes.text();
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to start device auth: ${err}`,
							},
						],
					};
				}

				const codeData = (await codeRes.json()) as {
					device_code: string;
					user_code: string;
					verification_uri: string;
					verification_uri_complete: string;
					expires_in: number;
					interval: number;
				};

				// Store pending flow as fallback for connect_agent_complete
				if (storage.savePendingFlow) {
					await storage.savePendingFlow(url, {
						deviceCode: codeData.device_code,
						clientId,
						name,
						scopes,
					});
				}

				// Auto-open browser if callback is provided
				if (onVerificationUrl) {
					try {
						await onVerificationUrl(codeData.verification_uri_complete);
					} catch {
						// Best-effort — fall back to showing the URL
					}
				}

				// Poll for approval
				const maxAttempts = 60;
				const pollInterval = Math.max(5000, (codeData.interval ?? 5) * 1000);
				let accessToken: string | null = null;

				for (let i = 0; i < maxAttempts; i++) {
					await new Promise((resolve) => setTimeout(resolve, pollInterval));

					const tokenRes = await globalThis.fetch(
						`${url}/api/auth/device/token`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								grant_type: "urn:ietf:params:oauth:grant-type:device_code",
								device_code: codeData.device_code,
								client_id: clientId,
							}),
						},
					);

					if (tokenRes.ok) {
						const tokenData = (await tokenRes.json()) as {
							access_token: string;
						};
						accessToken = tokenData.access_token;
						break;
					}

					const errorData = (await tokenRes.json()) as {
						error: string;
					};

					if (errorData.error === "authorization_pending") {
						continue;
					}
					if (errorData.error === "slow_down") {
						await new Promise((resolve) => setTimeout(resolve, pollInterval));
						continue;
					}
					if (errorData.error === "access_denied") {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "User denied the connection.",
								},
							],
						};
					}
					if (errorData.error === "expired_token") {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "Device code expired. Please try again.",
								},
							],
						};
					}

					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `Device auth failed: ${errorData.error}`,
							},
						],
					};
				}

				if (!accessToken) {
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: "Timed out waiting for approval. Please try again.",
							},
						],
					};
				}

				// Register the agent
				try {
					const data = await tryRegisterAgent(url, accessToken, {
						name,
						publicKey: keypair.publicKey,
						scopes,
					});

					if (!data) {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "Failed to register agent: auth token was rejected.",
								},
							],
						};
					}

					await storage.saveConnection(data.agentId, {
						appUrl: url,
						keypair,
						name,
						scopes: data.scopes,
					});

					if (storage.removePendingFlow) await storage.removePendingFlow(url);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agentId}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				} catch (err) {
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}
			},
		},
		{
			name: "list_agents",
			description:
				"Show all active agent connections. Call when the user asks: " +
				"what agents are running, show my connections, which apps am I connected to, " +
				"or what sessions are active. Returns Agent IDs, app URLs, names, and scopes.",
			inputSchema: {},
			handler: async () => {
				const connections = await storage.listConnections();
				if (connections.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No agent connections.",
							},
						],
					};
				}
				const lines = connections.map(
					(c) =>
						`${c.appUrl} — ${c.name} (${c.agentId}) [${c.scopes.join(", ")}]`,
				);
				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
				};
			},
		},
		{
			name: "disconnect_agent",
			description:
				"Disconnect, sign out, log out, or revoke an agent. " +
				"Call when the user says: disconnect, stop, log out, sign out, done, " +
				"revoke access, or remove agent. The agent will no longer be able to authenticate.",
			inputSchema: {
				agentId: z
					.string()
					.describe("Agent ID to disconnect (from connect_agent)"),
			},
			handler: async (input) => {
				const agentId = input.agentId as string;
				const connection = await storage.getConnection(agentId);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection found for agent ${agentId}.`,
							},
						],
					};
				}

				// Best-effort server-side revocation
				try {
					const jwt = await signAgentJWT({
						agentId,
						privateKey: connection.keypair.privateKey,
					});
					await globalThis.fetch(`${connection.appUrl}/api/auth/agent/revoke`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${jwt}`,
						},
						body: JSON.stringify({ agentId }),
					});
				} catch {
					// Best-effort
				}

				await storage.removeConnection(agentId);
				return {
					content: [
						{
							type: "text" as const,
							text: `Disconnected agent ${agentId} from ${connection.appUrl}.`,
						},
					],
				};
			},
		},
		{
			name: "agent_status",
			description:
				"Check if an agent connection is still alive and authenticated. " +
				"Call when the user asks: is the agent working, check connection, am I still connected, " +
				"or is my session active. Returns agent details and user info if healthy.",
			inputSchema: {
				agentId: z.string().describe("Agent ID to check (from connect_agent)"),
			},
			handler: async (input) => {
				const agentId = input.agentId as string;
				const connection = await storage.getConnection(agentId);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection found for agent ${agentId}.`,
							},
						],
					};
				}

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
				});

				const res = await globalThis.fetch(
					`${connection.appUrl}/api/auth/agent/get-session`,
					{
						headers: { Authorization: `Bearer ${jwt}` },
					},
				);

				if (!res.ok) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Connection unhealthy: ${res.status} ${res.statusText}`,
							},
						],
					};
				}

				const session = (await res.json()) as {
					agent: { name: string; scopes: string[] };
					user: { name: string; email: string };
				};
				return {
					content: [
						{
							type: "text" as const,
							text: `Healthy. Agent: ${session.agent.name} (${agentId}). User: ${session.user.name} (${session.user.email}). Scopes: ${session.agent.scopes.join(", ")}`,
						},
					],
				};
			},
		},
		{
			name: "agent_request",
			description:
				"Make an authenticated HTTP request to the app's own API endpoints. " +
				"Use when the user asks you to: fetch data, call an API, get information from the app, " +
				"submit data, or interact with the app's backend. " +
				"NOT for third-party tools (GitHub, Slack, etc.) — use call_gateway_tool for those. " +
				"Automatically signs the request with the agent's identity.",
			inputSchema: {
				agentId: z.string().describe("Your Agent ID (from connect_agent)"),
				path: z.string().describe("API path on the app (e.g. /api/reports/Q4)"),
				method: z.string().optional().describe("HTTP method (default: GET)"),
				body: z
					.string()
					.optional()
					.describe("Request body as JSON string (for POST/PUT)"),
			},
			handler: async (input) => {
				const agentId = input.agentId as string;
				const reqPath = input.path as string;
				const method = (input.method as string) ?? "GET";
				const body = input.body as string | undefined;

				const connection = await storage.getConnection(agentId);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection found for agent ${agentId}. Run connect_agent first.`,
							},
						],
					};
				}

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
				});

				const fullUrl = reqPath.startsWith("http")
					? reqPath
					: `${connection.appUrl}${reqPath}`;

				const headers: Record<string, string> = {
					Authorization: `Bearer ${jwt}`,
				};
				if (body) {
					headers["Content-Type"] = "application/json";
				}

				const res = await globalThis.fetch(fullUrl, {
					method,
					headers,
					body: body ?? undefined,
				});

				const text = await res.text();
				return {
					content: [
						{
							type: "text" as const,
							text: `${res.status} ${res.statusText}\n${text}`,
						},
					],
				};
			},
		},
	];

	// Only add connect_agent_complete when using device auth flow
	if (!getAuthHeaders) {
		tools.push({
			name: "connect_agent_complete",
			description:
				"Finish a pending connection after the user approved in their browser. " +
				"Call when the user says: I approved it, I clicked allow, I authorized it, " +
				"or the connection timed out but I approved. " +
				"ONLY needed if connect_agent timed out waiting. Do NOT call if connect_agent already succeeded.",
			inputSchema: {
				url: z.string().describe("App URL (same one used in connect_agent)"),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");

				const pendingFlow = storage.getPendingFlow
					? await storage.getPendingFlow(url)
					: null;
				if (!pendingFlow) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No pending connection for ${url}. Run connect_agent first.`,
							},
						],
					};
				}

				const keypair = await generateAgentKeypair();

				// Poll for the token
				const maxAttempts = 60;
				const pollInterval = 5000;
				let accessToken: string | null = null;

				for (let i = 0; i < maxAttempts; i++) {
					const tokenRes = await globalThis.fetch(
						`${url}/api/auth/device/token`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								grant_type: "urn:ietf:params:oauth:grant-type:device_code",
								device_code: pendingFlow.deviceCode,
								client_id: pendingFlow.clientId,
							}),
						},
					);

					if (tokenRes.ok) {
						const tokenData = (await tokenRes.json()) as {
							access_token: string;
						};
						accessToken = tokenData.access_token;
						break;
					}

					const errorData = (await tokenRes.json()) as {
						error: string;
					};

					if (errorData.error === "authorization_pending") {
						await new Promise((resolve) => setTimeout(resolve, pollInterval));
						continue;
					}
					if (errorData.error === "slow_down") {
						await new Promise((resolve) =>
							setTimeout(resolve, pollInterval * 2),
						);
						continue;
					}
					if (errorData.error === "access_denied") {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "User denied the connection.",
								},
							],
						};
					}
					if (errorData.error === "expired_token") {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "Device code expired. Please run connect_agent again.",
								},
							],
						};
					}

					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `Device auth failed: ${errorData.error}`,
							},
						],
					};
				}

				if (!accessToken) {
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: "Timed out waiting for approval. Run connect_agent again.",
							},
						],
					};
				}

				try {
					const data = await tryRegisterAgent(url, accessToken, {
						name: pendingFlow.name,
						publicKey: keypair.publicKey,
						scopes: pendingFlow.scopes,
					});

					if (!data) {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "Failed to register agent: auth token was rejected.",
								},
							],
						};
					}

					await storage.saveConnection(data.agentId, {
						appUrl: url,
						keypair,
						name: pendingFlow.name,
						scopes: data.scopes,
					});

					if (storage.removePendingFlow) await storage.removePendingFlow(url);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agentId}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				} catch (err) {
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}
			},
		});
	}

	return tools;
}
