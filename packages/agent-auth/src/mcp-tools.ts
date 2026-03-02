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
import { generateAgentKeypair, hashRequestBody, signAgentJWT } from "./crypto";

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

	/** Store a host keypair for an app URL (enables trusted host auto-approval). */
	saveHostKeypair?(
		appUrl: string,
		data: { keypair: AgentKeypair; hostId: string },
	): Promise<void>;
	/** Retrieve the stored host keypair for an app URL. */
	getHostKeypair?(
		appUrl: string,
	): Promise<{ keypair: AgentKeypair; hostId: string } | null>;
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
 * Sign a host JWT for registration (§2.2).
 * Contains the host's public key and the agent's public key.
 */
async function signHostJWT(opts: {
	hostId: string;
	hostPrivateKey: AgentJWK;
	hostPublicKey: AgentJWK;
	agentPublicKey: AgentJWK;
	audience: string;
}): Promise<string> {
	return signAgentJWT({
		agentId: opts.hostId,
		privateKey: opts.hostPrivateKey,
		audience: opts.audience,
		expiresIn: 60,
		additionalClaims: {
			host_public_key: opts.hostPublicKey,
			agent_public_key: opts.agentPublicKey,
		},
	});
}

/**
 * Try to register via host JWT (trusted host path).
 * Returns the registration result, or null if the host is unknown/untrusted.
 */
async function tryHostJWTRegistration(
	url: string,
	hostData: { keypair: AgentKeypair; hostId: string },
	agentPublicKey: AgentJWK,
	body: {
		name: string;
		scopes: string[];
		mode?: string;
		metadata?: Record<string, unknown>;
	},
): Promise<{
	agent_id: string;
	host_id: string;
	status: string;
	scopes: string[];
	pending_scopes?: string[];
	approval?: Record<string, unknown>;
} | null> {
	try {
		const issuer = new URL(url).origin;
		const hostJwt = await signHostJWT({
			hostId: hostData.hostId,
			hostPrivateKey: hostData.keypair.privateKey,
			hostPublicKey: hostData.keypair.publicKey,
			agentPublicKey,
			audience: issuer,
		});

		const res = await globalThis.fetch(`${url}/api/auth/agent/register`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${hostJwt}`,
			},
			body: JSON.stringify({
				name: body.name,
				scopes: body.scopes,
				mode: body.mode,
				metadata: body.metadata,
			}),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			console.error(
				`[agent-auth] Host JWT registration failed: ${res.status} ${text.slice(0, 300)}`,
			);
			return null;
		}

		return (await res.json()) as {
			agent_id: string;
			host_id: string;
			status: string;
			scopes: string[];
			pending_scopes?: string[];
			approval?: Record<string, unknown>;
		};
	} catch (err) {
		console.error(
			"[agent-auth] Host JWT registration error:",
			err instanceof Error ? err.message : err,
		);
		return null;
	}
}

/**
 * Helper: try to register an agent with a token, return the response or null on auth failure.
 */
async function tryRegisterAgent(
	url: string,
	token: string,
	body: { name: string; publicKey: AgentJWK; scopes: string[] },
): Promise<{ agent_id: string; scopes: string[] } | null> {
	const res = await globalThis.fetch(`${url}/api/auth/agent/register`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			Origin: url,
		},
		body: JSON.stringify(body),
	});

	if (res.ok) {
		return (await res.json()) as { agent_id: string; scopes: string[] };
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
			"- **Approval methods:** By default, the user approves in their browser (device authorization).",
			'  To use dashboard notification instead, pass `method="ciba"` and `login_hint="user@email.com"`.',
			"  Ask the user which method they prefer if unclear.",
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
export interface AgentMCPToolsResult {
	tools: MCPToolDefinition[];
	/** Set of agent IDs authorized in this session. Used by gateway tools for isolation. */
	sessionAgentIds: Set<string>;
}

export function createAgentMCPTools(
	options: CreateAgentMCPToolsOptions,
): AgentMCPToolsResult {
	const {
		storage,
		getAuthHeaders,
		clientId = "agent-auth",
		onVerificationUrl,
		resolveAuthorizationDetails,
	} = options;

	// Session-scoped agent tracking: only agents created or explicitly
	// authorized during this process lifetime can be used by tools.
	// Prevents cross-conversation agent hijacking via shared storage.
	const sessionAgentIds = new Set<string>();

	async function resolveAuthHeaders(): Promise<Record<string, string>> {
		if (!getAuthHeaders) return {};
		return await getAuthHeaders();
	}

	function requireSessionAgent(agentId: string): string | null {
		if (!sessionAgentIds.has(agentId)) {
			return `Agent ${agentId} was not created in this session. Call connect_agent first.`;
		}
		return null;
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
				audience: new URL(connection.appUrl).origin,
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
						referenceId: string;
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
									text: "No providers found. The user may need to connect services in the dashboard first.",
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
					: " Supports two approval methods: 'device_authorization' (opens browser) and 'ciba' (dashboard notification, requires login_hint)."),
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
				method: z
					.enum(["device_authorization", "ciba"])
					.optional()
					.describe(
						"Approval method. 'device_authorization' opens a browser for user approval. " +
							"'ciba' sends a notification to the user's dashboard (requires login_hint). " +
							"Default: 'device_authorization'.",
					),
				login_hint: z
					.string()
					.optional()
					.describe(
						"User's email address. Required when method is 'ciba'. " +
							"The server will send a notification to this user's dashboard.",
					),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");
				const name = (input.name as string) ?? "MCP Agent";
				const scopes = (input.scopes as string[]) ?? [];
				const existingAgentId = input.agentId as string | undefined;
				const method = (input.method as string) ?? "device_authorization";
				const loginHint = input.login_hint as string | undefined;

				// Explicit agentId — only allow reuse if it was created in this session
				if (existingAgentId) {
					if (!sessionAgentIds.has(existingAgentId)) {
						// Not from this session — ignore and create fresh
					} else {
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
					}
					// agentId invalid or stale — fall through to create fresh
				}

				// Fresh identity — each conversation gets its own agent
				const keypair = await generateAgentKeypair();

				// Trusted host path: if we have a stored host keypair for this
				// app, try registering with a host JWT first. If the host is
				// trusted and scopes are within its budget, the server
				// auto-approves — no device auth needed.
				if (storage.getHostKeypair) {
					const hostData = await storage.getHostKeypair(url);
					if (hostData) {
						const result = await tryHostJWTRegistration(
							url,
							hostData,
							keypair.publicKey,
							{ name, scopes },
						);

						if (result && result.status === "active") {
							await storage.saveConnection(result.agent_id, {
								appUrl: url,
								keypair,
								name,
								scopes: result.scopes,
							});
							sessionAgentIds.add(result.agent_id);

							return {
								content: [
									{
										type: "text" as const,
										text: `Connected to ${url} (trusted host, auto-approved). Agent ID: ${result.agent_id}. Scopes: ${result.scopes.join(", ")}. Use this Agent ID for subsequent requests.`,
									},
								],
							};
						}
						// status is "pending" or registration failed — fall through to device auth/CIBA
					}
				}

				// Direct auth mode (cookie/token in env)
				if (getAuthHeaders) {
					const authHeaders = await resolveAuthHeaders();
					const res = await globalThis.fetch(`${url}/api/auth/agent/register`, {
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
						agent_id: string;
						scopes: string[];
					};

					await storage.saveConnection(data.agent_id, {
						appUrl: url,
						keypair,
						name,
						scopes: data.scopes,
					});
					sessionAgentIds.add(data.agent_id);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agent_id}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				}

				// CIBA flow — backchannel authentication via dashboard notification
				if (method === "ciba") {
					if (!loginHint) {
						return {
							content: [
								{
									type: "text" as const,
									text: "CIBA requires a login_hint (user email). Pass login_hint with the user's email address.",
								},
							],
						};
					}

					const cibaRes = await globalThis.fetch(
						`${url}/api/auth/agent/ciba/authorize`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								login_hint: loginHint,
								scope: scopes.join(" "),
								binding_message: `${name} requests access${scopes.length > 0 ? `: ${scopes.join(", ")}` : ""}`,
								client_id: clientId,
								backchannel_token_delivery_mode: "poll",
							}),
						},
					);

					if (!cibaRes.ok) {
						const err = await cibaRes.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `CIBA auth failed: ${err}`,
								},
							],
						};
					}

					const cibaData = (await cibaRes.json()) as {
						auth_req_id: string;
						expires_in: number;
						interval: number;
					};

					const cibaMaxAttempts = 60;
					const cibaInterval = Math.max(5000, (cibaData.interval ?? 5) * 1000);
					let cibaAccessToken: string | null = null;

					for (let i = 0; i < cibaMaxAttempts; i++) {
						await new Promise((resolve) => setTimeout(resolve, cibaInterval));

						const tokenRes = await globalThis.fetch(
							`${url}/api/auth/agent/ciba/token`,
							{
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									grant_type: "urn:openid:params:grant-type:ciba",
									auth_req_id: cibaData.auth_req_id,
									client_id: clientId,
								}),
							},
						);

						const resText = await tokenRes.text();
						let resJson: Record<string, unknown>;
						try {
							resJson = JSON.parse(resText);
						} catch {
							return {
								content: [
									{
										type: "text" as const,
										text: `CIBA token endpoint returned non-JSON: ${resText.slice(0, 200)}`,
									},
								],
							};
						}

						if (tokenRes.ok) {
							cibaAccessToken = resJson.access_token as string;
							break;
						}

						const error = resJson.error as string | undefined;
						if (error === "authorization_pending") continue;
						if (error === "slow_down") {
							await new Promise((resolve) => setTimeout(resolve, cibaInterval));
							continue;
						}
						if (error === "access_denied") {
							return {
								content: [
									{
										type: "text" as const,
										text: "User denied the CIBA authentication request.",
									},
								],
							};
						}
						if (error === "expired_token") {
							return {
								content: [
									{
										type: "text" as const,
										text: "CIBA request expired. Please try again.",
									},
								],
							};
						}
						return {
							content: [
								{
									type: "text" as const,
									text: `CIBA token exchange failed: ${error}`,
								},
							],
						};
					}

					if (!cibaAccessToken) {
						return {
							content: [
								{
									type: "text" as const,
									text: "Timed out waiting for CIBA approval. Ask the user to approve in their dashboard.",
								},
							],
						};
					}

					const cibaHostKeypair = storage.saveHostKeypair
						? await generateAgentKeypair()
						: null;

					try {
						const cibaRegisterBody: Record<string, unknown> = {
							name,
							publicKey: keypair.publicKey,
							scopes,
						};
						if (cibaHostKeypair) {
							cibaRegisterBody.hostPublicKey = cibaHostKeypair.publicKey;
						}

						const cibaRegRes = await globalThis.fetch(
							`${url}/api/auth/agent/register`,
							{
								method: "POST",
								headers: {
									"Content-Type": "application/json",
									Authorization: `Bearer ${cibaAccessToken}`,
								},
								body: JSON.stringify(cibaRegisterBody),
							},
						);

						if (!cibaRegRes.ok) {
							const err = await cibaRegRes.text();
							return {
								content: [
									{
										type: "text" as const,
										text: `Failed to register agent: ${err}`,
									},
								],
							};
						}

						const data = (await cibaRegRes.json()) as {
							agent_id: string;
							host_id?: string;
							scopes: string[];
						};

						await storage.saveConnection(data.agent_id, {
							appUrl: url,
							keypair,
							name,
							scopes: data.scopes,
						});
						sessionAgentIds.add(data.agent_id);

						if (cibaHostKeypair && data.host_id && storage.saveHostKeypair) {
							await storage.saveHostKeypair(url, {
								keypair: cibaHostKeypair,
								hostId: data.host_id,
							});
						}

						return {
							content: [
								{
									type: "text" as const,
									text: `Connected via CIBA to ${url}. Agent ID: ${data.agent_id}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests.`,
								},
							],
						};
					} catch (err) {
						return {
							content: [
								{
									type: "text" as const,
									text: `${err instanceof Error ? err.message : String(err)}`,
								},
							],
						};
					}
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

					const resText = await tokenRes.text();
					let resJson: Record<string, unknown>;
					try {
						resJson = JSON.parse(resText);
					} catch {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: `Device auth returned non-JSON response: ${resText.slice(0, 200)}`,
								},
							],
						};
					}

					if (tokenRes.ok) {
						accessToken = resJson.access_token as string;
						break;
					}

					const error = resJson.error as string | undefined;

					if (error === "authorization_pending") {
						continue;
					}
					if (error === "slow_down") {
						await new Promise((resolve) => setTimeout(resolve, pollInterval));
						continue;
					}
					if (error === "access_denied") {
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
					if (error === "expired_token") {
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
								text: `Device auth failed: ${error}`,
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

				// Generate a host keypair to register alongside the agent.
				// The server creates a host with this key, enabling future
				// agents to auto-approve via host JWT without device auth.
				const hostKeypair = storage.saveHostKeypair
					? await generateAgentKeypair()
					: null;

				// Register the agent (include hostPublicKey so the server
				// creates/associates a host with this key)
				try {
					const registerBody: Record<string, unknown> = {
						name,
						publicKey: keypair.publicKey,
						scopes,
					};
					if (hostKeypair) {
						registerBody.hostPublicKey = hostKeypair.publicKey;
					}

					const res = await globalThis.fetch(`${url}/api/auth/agent/register`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${accessToken}`,
						},
						body: JSON.stringify(registerBody),
					});

					if (!res.ok) {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						const err = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to register agent: ${err}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						agent_id: string;
						host_id?: string;
						scopes: string[];
					};

					await storage.saveConnection(data.agent_id, {
						appUrl: url,
						keypair,
						name,
						scopes: data.scopes,
					});
					sessionAgentIds.add(data.agent_id);

					if (hostKeypair && data.host_id && storage.saveHostKeypair) {
						await storage.saveHostKeypair(url, {
							keypair: hostKeypair,
							hostId: data.host_id,
						});
					}

					if (storage.removePendingFlow) await storage.removePendingFlow(url);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agent_id}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
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
				const sessionErr = requireSessionAgent(agentId);
				if (sessionErr) {
					return { content: [{ type: "text" as const, text: sessionErr }] };
				}
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
						audience: new URL(connection.appUrl).origin,
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
				const sessionErr = requireSessionAgent(agentId);
				if (sessionErr) {
					return { content: [{ type: "text" as const, text: sessionErr }] };
				}
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
					audience: new URL(connection.appUrl).origin,
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
					agent: {
						name: string;
						permissions: Array<{ scope: string }>;
					};
					user: { name: string; email: string };
				};
				return {
					content: [
						{
							type: "text" as const,
							text: `Healthy. Agent: ${session.agent.name} (${agentId}). User: ${session.user.name} (${session.user.email}). Permissions: ${session.agent.permissions.map((p) => p.scope).join(", ")}`,
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
				const sessionErr = requireSessionAgent(agentId);
				if (sessionErr) {
					return { content: [{ type: "text" as const, text: sessionErr }] };
				}
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

				const fullUrl = reqPath.startsWith("http")
					? reqPath
					: `${connection.appUrl}${reqPath}`;

				// Prevent SSRF: only allow requests to the app the agent connected to
				try {
					const target = new URL(fullUrl);
					const allowed = new URL(connection.appUrl);
					if (target.origin !== allowed.origin) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Blocked: request origin ${target.origin} does not match connected app ${allowed.origin}.`,
								},
							],
						};
					}
				} catch {
					return {
						content: [
							{
								type: "text" as const,
								text: `Invalid URL: ${fullUrl}`,
							},
						],
					};
				}

				const requestPath = new URL(fullUrl).pathname;
				const bodyHash = body ? await hashRequestBody(body) : undefined;

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
					audience: new URL(connection.appUrl).origin,
					requestBinding: {
						method,
						path: requestPath,
						bodyHash,
					},
				});

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

					const resText = await tokenRes.text();
					let resJson: Record<string, unknown>;
					try {
						resJson = JSON.parse(resText);
					} catch {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: `Device auth returned non-JSON response: ${resText.slice(0, 200)}`,
								},
							],
						};
					}

					if (tokenRes.ok) {
						accessToken = resJson.access_token as string;
						break;
					}

					const error = resJson.error as string | undefined;

					if (error === "authorization_pending") {
						await new Promise((resolve) => setTimeout(resolve, pollInterval));
						continue;
					}
					if (error === "slow_down") {
						await new Promise((resolve) =>
							setTimeout(resolve, pollInterval * 2),
						);
						continue;
					}
					if (error === "access_denied") {
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
					if (error === "expired_token") {
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
								text: `Device auth failed: ${error}`,
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

					await storage.saveConnection(data.agent_id, {
						appUrl: url,
						keypair,
						name: pendingFlow.name,
						scopes: data.scopes,
					});
					sessionAgentIds.add(data.agent_id);

					if (storage.removePendingFlow) await storage.removePendingFlow(url);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agent_id}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
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

	return { tools, sessionAgentIds };
}
