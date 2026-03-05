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
import { openInBrowser } from "./agent-client";
import type { AgentJWK } from "./crypto";
import { generateAgentKeypair, hashRequestBody, signAgentJWT } from "./crypto";
import { detectHostName } from "./host-name";

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
	/** Provider name this connection was created through */
	provider?: string;
}

/**
 * Discovery document from `/.well-known/agent-configuration` (§2.1).
 */
export interface ProviderConfig {
	protocol_version: string;
	provider_name: string;
	description?: string;
	issuer: string;
	algorithms: string[];
	modes: string[];
	approval_methods: string[];
	endpoints: Record<string, string>;
	jwks_uri?: string;
}

/**
 * A single capability from `/agent/capabilities` (§2.3).
 */
export interface Capability {
	name: string;
	description: string;
	type: string;
	input_schema?: Record<string, unknown>;
	/** Only present when queried with agent or host auth */
	grant_status?: "granted" | "not_granted";
	[key: string]: unknown;
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
			provider?: string;
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

	/** Save a discovered provider config. */
	saveProviderConfig?(name: string, config: ProviderConfig): Promise<void>;
	/** Retrieve a provider config by name. */
	getProviderConfig?(name: string): Promise<ProviderConfig | null>;
	/** List all stored provider configs. */
	listProviderConfigs?(): Promise<
		Array<{ name: string; config: ProviderConfig }>
	>;
	/** Remove a provider config by name. */
	removeProviderConfig?(name: string): Promise<void>;
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
	 * Maps tool scope names to structured details for the consent screen.
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
	/**
	 * Pre-configured app URL. When set, tools like `discover` and
	 * `connect_agent` will use this URL by default.
	 */
	defaultUrl?: string;
	/**
	 * Human-readable host name sent during registration.
	 * Auto-detected from the environment if not provided.
	 * Set to `false` to disable sending a host name.
	 */
	hostName?: string | false;
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
	registerEndpoint: string,
	hostData: { keypair: AgentKeypair; hostId: string },
	agentPublicKey: AgentJWK,
	body: {
		name: string;
		scopes: string[];
		mode?: string;
		metadata?: Record<string, unknown>;
		hostName?: string | null;
		preferredMethod?: string;
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
		const additionalClaims: Record<string, unknown> = {
			host_public_key: hostData.keypair.publicKey,
			agent_public_key: agentPublicKey,
		};
		if (body.hostName) {
			additionalClaims.host_name = body.hostName;
		}
		const hostJwt = await signAgentJWT({
			agentId: hostData.hostId,
			privateKey: hostData.keypair.privateKey,
			audience: issuer,
			expiresIn: 60,
			additionalClaims,
		});

		const registerBody: Record<string, unknown> = {
			name: body.name,
			scopes: body.scopes,
			mode: body.mode,
			metadata: body.metadata,
			preferredMethod: body.preferredMethod,
		};
		if (body.hostName) {
			registerBody.hostName = body.hostName;
		}

		const res = await globalThis.fetch(registerEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${hostJwt}`,
			},
			body: JSON.stringify(registerBody),
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
	registerEndpoint: string,
	token: string,
	body: { name: string; publicKey: AgentJWK; scopes: string[] },
): Promise<{ agent_id: string; scopes: string[] } | null> {
	const res = await globalThis.fetch(registerEndpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
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
 * Resolve an endpoint URL from a provider config.
 * Uses config endpoints when available, falls back to hardcoded paths.
 */
function resolveEndpointUrl(
	appUrl: string,
	config: ProviderConfig | null,
	endpointKey: string,
	fallbackPath: string,
): string {
	const basePath = "/api/auth";
	if (config?.endpoints[endpointKey]) {
		const issuer = config.issuer.replace(/\/+$/, "");
		return `${issuer}${basePath}${config.endpoints[endpointKey]}`;
	}
	return `${appUrl}${basePath}${fallbackPath}`;
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

/**
 * MCP server instructions for Agent Auth.
 *
 * Pass this to `new McpServer(info, { instructions })` so clients
 * (Cursor, Claude Desktop, etc.) know how to drive the tools.
 */
export function getAgentAuthInstructions(): string {
	return [
		"You are connected to an Agent Auth MCP server that lets you authenticate and act on behalf of users.",
		"",
		"## When to use these tools",
		"",
		"Use these tools whenever the user asks you to:",
		"- Connect, sign in, log in, authenticate, hire an agent, or access an app",
		"- Perform actions on third-party services (create issues, list PRs, send messages, etc.)",
		"- Fetch data or call APIs on a connected app",
		"- Check connection status, disconnect, or log out",
		"",
		"## Quick-start workflow",
		"",
		"### Step 1 — Connect",
		"",
		"If you already know a provider name (from `list_providers`), use it directly:",
		'  `connect_agent(provider="<provider-name>", name="<task-based name>")`',
		"If you have a URL instead, pass it — discovery happens automatically:",
		'  `connect_agent(url="<app-url>", name="<task-based name>")`',
		"- Pick a short, memorable name based on the user's request (e.g. 'PR Reviewer', 'Email Drafter').",
		"- Scopes are optional — omit them to let the server decide what to grant.",
		"- The user may need to approve in their browser. Tell them and wait.",
		"- **Save the returned Agent ID.** Pass it to every subsequent tool call.",
		"- If you already have an Agent ID, pass it as `agentId` to reuse your session.",
		"",
		"### Step 2 — List capabilities & call tools",
		"",
		"After connecting, list capabilities to see what tools are available:",
		'  `list_capabilities(provider="<provider-name>", agent_id="<agent-id>")`',
		"Then call the tools you need:",
		'  `call_tool(agent_id="<agent-id>", scope="<capability-name>", input=\'{ ... }\')`',
		"`input` is a JSON string matching the capability's input schema.",
		"",
		"### Step 3 — Disconnect when done",
		"",
		'  `disconnect_agent(agentId="<agent-id>")`',
		"",
		"## Calling the app's own API",
		"",
		"- Use `agent_request` to make authenticated HTTP requests to the app's endpoints.",
		"- Example: `agent_request(agentId, path='/api/data', method='GET')`",
		"",
		"## Rules",
		"",
		"1. **NEVER call `request_scope` unless a `call_tool` returned a 403 error.** The user already approved scopes during `connect_agent`. Calling `request_scope` preemptively forces the user to approve again for no reason. Always try the tool call first.",
		"2. **NEVER invent an Agent ID.** Only use one returned by `connect_agent`.",
		"3. **NEVER guess provider or capability names.** Use exact names from discover or list_capabilities.",
		"4. **NEVER disconnect and reconnect** just to get more scopes.",
		"5. If a `call_tool` returns **403**, then and only then call `request_scope` with the specific scope that was denied.",
		"6. Name agents after their task (e.g. 'PR Reviewer', 'Deploy my-app'). Pick something the user would recognize.",
		"7. Call `disconnect_agent` when you are done with a task to clean up.",
	].join("\n");
}

/**
 * Create MCP tool definitions for agent management.
 * Register these in your MCP server via `server.registerTool()`.
 */
export interface AgentMCPToolsResult {
	tools: MCPToolDefinition[];
	/** Set of agent IDs authorized in this session. Used for per-session isolation. */
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
		defaultUrl,
	} = options;

	const resolvedHostName =
		options.hostName === false ? null : (options.hostName ?? detectHostName());

	async function openVerificationUrl(url: string): Promise<void> {
		if (onVerificationUrl) {
			await onVerificationUrl(url);
		} else {
			await openInBrowser(url).catch(() => {});
		}
	}

	const defaultPreferredMethod =
		typeof globalThis.window !== "undefined"
			? "ciba"
			: "device_authorization";

	// Session-scoped agent tracking: only agents created or explicitly
	// authorized during this process lifetime can be used by tools.
	// Prevents cross-conversation agent hijacking via shared storage.
	const sessionAgentIds = new Set<string>();

	// In-memory capabilities cache for list_capabilities → call_tool routing
	const capabilitiesCache = new Map<
		string,
		{ capabilities: Capability[]; fetchedAt: number }
	>();

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
	 * Look up a stored provider config by name or URL.
	 * If `nameOrUrl` is a URL, tries to find a config whose issuer matches.
	 */
	async function findProviderConfig(
		nameOrUrl: string,
	): Promise<ProviderConfig | null> {
		if (storage.getProviderConfig) {
			const config = await storage.getProviderConfig(nameOrUrl);
			if (config) return config;
		}
		// Try matching by issuer URL
		if (
			storage.listProviderConfigs &&
			(nameOrUrl.startsWith("http://") || nameOrUrl.startsWith("https://"))
		) {
			const all = await storage.listProviderConfigs();
			const normalized = nameOrUrl.replace(/\/+$/, "");
			for (const entry of all) {
				if (entry.config.issuer.replace(/\/+$/, "") === normalized) {
					return entry.config;
				}
			}
		}
		return null;
	}

	/**
	 * Try to discover a provider config from a URL and cache it.
	 * Returns the config if successful, null otherwise.
	 */
	async function tryAutoDiscover(
		baseUrl: string,
	): Promise<ProviderConfig | null> {
		try {
			const wellKnownRes = await globalThis
				.fetch(`${baseUrl}/.well-known/agent-configuration`)
				.catch(() => null);

			if (wellKnownRes?.ok) {
				const data = (await wellKnownRes.json()) as ProviderConfig;
				if (storage.saveProviderConfig) {
					await storage.saveProviderConfig(data.provider_name, data);
				}
				return data;
			}

			const knownPaths = ["/api/auth", "/auth", "/api"];
			for (const prefix of knownPaths) {
				try {
					const res = await globalThis.fetch(
						`${baseUrl}${prefix}/agent/discover`,
					);
					if (res.ok) {
						const data = (await res.json()) as ProviderConfig;
						if (storage.saveProviderConfig) {
							await storage.saveProviderConfig(data.provider_name, data);
						}
						return data;
					}
				} catch {}
			}
		} catch {}
		return null;
	}

	/**
	 * Resolve an app URL from either a stored provider config name or a direct URL.
	 * Auto-discovers and caches the provider config when given a URL without a
	 * cached config, so callers don't need a separate discover step.
	 */
	async function resolveAppUrl(
		providerOrUrl: string,
	): Promise<{ appUrl: string; config: ProviderConfig | null }> {
		const config = await findProviderConfig(providerOrUrl);
		if (config) {
			return { appUrl: config.issuer.replace(/\/+$/, ""), config };
		}
		// Validate that the input looks like a URL, not just a provider name
		let isUrl = false;
		try {
			new URL(providerOrUrl);
			isUrl = true;
		} catch {
			// Not a valid URL — if we have a default, fall back to it
			if (defaultUrl) {
				const fallbackConfig = await findProviderConfig(defaultUrl);
				if (fallbackConfig) {
					return { appUrl: defaultUrl, config: fallbackConfig };
				}
				const discovered = await tryAutoDiscover(defaultUrl);
				return { appUrl: defaultUrl, config: discovered };
			}
			return { appUrl: "", config: null };
		}
		if (isUrl) {
			const baseUrl = providerOrUrl.replace(/\/+$/, "");
			const discovered = await tryAutoDiscover(baseUrl);
			return { appUrl: baseUrl, config: discovered };
		}
		return { appUrl: providerOrUrl.replace(/\/+$/, ""), config: null };
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
			const config = await findProviderConfig(
				connection.provider ?? connection.appUrl,
			);
			const statusUrl = resolveEndpointUrl(
				connection.appUrl,
				config,
				"status",
				"/agent/status",
			);
			const jwt = await signAgentJWT({
				agentId,
				privateKey: connection.keypair.privateKey,
				audience: new URL(connection.appUrl).origin,
			});
			const res = await globalThis.fetch(statusUrl, {
				headers: { Authorization: `Bearer ${jwt}` },
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	const tools: MCPToolDefinition[] = [
		{
			name: "list_providers",
			description:
				"List all known providers stored locally. " +
				"Returns provider names and descriptions. " +
				"If a provider is listed here, you can pass its name directly to connect_agent " +
				"without calling discover first.",
			inputSchema: {},
			handler: async () => {
				if (!storage.listProviderConfigs) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No providers discovered yet. Call discover(url=...) to discover a provider.",
							},
						],
					};
				}

				const providers = await storage.listProviderConfigs();
				if (providers.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No providers discovered yet. Call discover(url=...) to discover a provider.",
							},
						],
					};
				}

				const lines: string[] = [`Found ${providers.length} provider(s):`];
				for (const p of providers) {
					lines.push(
						`- ${p.name}: ${p.config.description ?? "No description"}` +
							` (issuer: ${p.config.issuer})`,
					);
				}
				lines.push(
					"\nUse these provider names with connect_agent and list_capabilities.",
				);

				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
				};
			},
		},
		{
			name: "discover",
			description:
				"Discover an Agent Auth server's configuration. " +
				"Fetches the well-known agent configuration document and stores it locally. " +
				"Useful for exploring what a server supports. " +
				"NOTE: connect_agent auto-discovers when given a URL, so you only need " +
				"this if you want to inspect the server config before connecting. " +
				"This does NOT require authentication.",
			inputSchema: {
				url: z
					.string()
					.describe("App URL to discover (e.g. https://myapp.com)"),
			},
			handler: async (input) => {
				const rawUrl = (input.url as string).replace(/\/+$/, "");
				let baseUrl = rawUrl;
				try {
					const parsed = new URL(rawUrl);
					parsed.search = "";
					baseUrl = parsed.toString().replace(/\/+$/, "");
				} catch {}

				try {
					const data = await tryAutoDiscover(baseUrl);

					if (!data) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Could not discover agent configuration at ${baseUrl}. The server may not support the Agent Auth protocol.`,
								},
							],
						};
					}

					const lines: string[] = [
						`Discovered: ${data.provider_name}`,
						data.description ? `Description: ${data.description}` : "",
						`Issuer: ${data.issuer}`,
						`Protocol: ${data.protocol_version}`,
						`Approval methods: ${data.approval_methods.join(", ")}`,
						`Modes: ${data.modes.join(", ")}`,
					].filter(Boolean);

					if (data.endpoints) {
						const endpointKeys = Object.keys(data.endpoints);
						lines.push(`Endpoints: ${endpointKeys.join(", ")}`);
					}

					lines.push(
						`\nProvider "${data.provider_name}" saved. Use this name with list_capabilities and connect_agent.`,
					);

					return {
						content: [{ type: "text" as const, text: lines.join("\n") }],
					};
				} catch (err) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to discover: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}
			},
		},
		{
			name: "list_capabilities",
			description:
				"List capabilities (tools) available on a provider. " +
				"Returns capability names, descriptions, and input schemas. " +
				"Best called AFTER connect_agent with your agent_id to see granted capabilities. " +
				"Can also be called before connecting, but some servers only expose capabilities to authenticated agents. " +
				"Can optionally filter by intent (natural language description of what you want to do).",
			inputSchema: {
				provider: z
					.string()
					.optional()
					.describe(
						"Provider name (from discover) or app URL. Uses default if omitted.",
					),
				intent: z
					.string()
					.optional()
					.describe(
						"Natural language intent for filtering (e.g. 'send money', 'list issues')",
					),
				agent_id: z
					.string()
					.optional()
					.describe(
						"Agent ID to check grant status for each capability. If provided, shows which capabilities are already granted.",
					),
			},
			handler: async (input) => {
				const providerInput = (input.provider as string) || defaultUrl || "";
				if (!providerInput) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Provider is required. Pass a provider name (from discover) or an app URL.",
							},
						],
					};
				}

				const { appUrl, config } = await resolveAppUrl(providerInput);
				if (!appUrl) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Could not resolve "${providerInput}" to an app URL. Call discover(url=...) first.`,
							},
						],
					};
				}
				const intent = input.intent as string | undefined;
				const agentId = input.agent_id as string | undefined;

				const capabilitiesUrl = resolveEndpointUrl(
					appUrl,
					config,
					"capabilities",
					"/agent/capabilities",
				);

				const params = new URLSearchParams();
				if (intent) params.set("intent", intent);

				const fetchUrl = params.toString()
					? `${capabilitiesUrl}?${params.toString()}`
					: capabilitiesUrl;

				const headers: Record<string, string> = {};

				// If agent_id provided, use agent JWT for grant_status
				if (agentId && sessionAgentIds.has(agentId)) {
					const connection = await storage.getConnection(agentId);
					if (connection) {
						const jwt = await signAgentJWT({
							agentId,
							privateKey: connection.keypair.privateKey,
							audience: new URL(appUrl).origin,
						});
						headers.Authorization = `Bearer ${jwt}`;
					}
				} else if (storage.getHostKeypair) {
					// Use host JWT for pre-registration capability listing (§2.3)
					const hostData = await storage.getHostKeypair(appUrl);
					if (hostData) {
						const hostJwt = await signHostJWT({
							hostId: hostData.hostId,
							hostPrivateKey: hostData.keypair.privateKey,
							hostPublicKey: hostData.keypair.publicKey,
							agentPublicKey: hostData.keypair.publicKey,
							audience: new URL(appUrl).origin,
						});
						headers.Authorization = `Bearer ${hostJwt}`;
					}
				}

				try {
					const res = await globalThis.fetch(fetchUrl, { headers });

					if (!res.ok) {
						const text = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to list capabilities: ${res.status} ${text.slice(0, 300)}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						capabilities: Capability[];
						has_more: boolean;
						next_cursor?: string;
					};

					// Cache capabilities for call_tool routing
					const providerName = config?.provider_name ?? appUrl;
					capabilitiesCache.set(providerName, {
						capabilities: data.capabilities,
						fetchedAt: Date.now(),
					});

					if (data.capabilities.length === 0) {
						return {
							content: [
								{
									type: "text" as const,
									text:
										"No capabilities listed yet. " +
										"Capabilities may only be visible after connecting. " +
										"Call connect_agent to authenticate first, then list capabilities again with your agent_id.",
								},
							],
						};
					}

					const lines: string[] = [
						`Found ${data.capabilities.length} capability(ies):`,
					];
					for (const c of data.capabilities) {
						const status = c.grant_status ? ` [${c.grant_status}]` : "";
						lines.push(`- ${c.name}: ${c.description}${status}`);
						if (c.input_schema) {
							lines.push(
								`  Input: ${JSON.stringify(c.input_schema).slice(0, 200)}`,
							);
						}
					}

					if (data.has_more) {
						lines.push("\n(More capabilities available)");
					}

					lines.push(
						"\nUse these capability names as the scope parameter when calling call_tool.",
					);

					return {
						content: [{ type: "text" as const, text: lines.join("\n") }],
					};
				} catch (err) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to list capabilities: ${err instanceof Error ? err.message : String(err)}`,
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
				provider: z
					.string()
					.optional()
					.describe(
						"Provider name (from discover) or app URL. Uses default if omitted.",
					),
				url: z
					.string()
					.optional()
					.describe(
						"App URL (e.g. https://myapp.com). Alternative to provider.",
					),
				name: z
					.string()
					.describe(
						"A short task-based name describing what you're doing (e.g. 'PR Reviewer', 'Deploy my-app', 'Email Drafter'). " +
							"Pick something the user would recognize from their request.",
					),
				scopes: z
					.array(z.string())
					.optional()
					.describe(
						"Optional permissions to request. Omit to let the server decide. " +
							"If you already know capability names, pass them " +
							"(e.g. ['github.create_issue', 'github.list_pull_requests']).",
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
				const providerInput =
					(input.provider as string) ||
					(input.url as string) ||
					defaultUrl ||
					"";
				if (!providerInput) {
					return {
						content: [
							{
								type: "text" as const,
								text: "A provider name or URL is required. Call discover(url=...) first, then use the provider name.",
							},
						],
					};
				}

				const { appUrl, config } = await resolveAppUrl(providerInput);
				if (!appUrl) {
					return {
						content: [
							{
								type: "text" as const,
								text:
									`Could not resolve "${providerInput}" to an app URL. ` +
									`If this is a provider name, call discover(url=...) first to register it. ` +
									`Otherwise, pass a full URL (e.g. url="https://myapp.com").`,
							},
						],
					};
				}
				const name = (input.name as string) ?? "MCP Agent";
				const scopes = (input.scopes as string[]) ?? [];
				const existingAgentId = input.agentId as string | undefined;
				const method = (input.method as string) ?? "device_authorization";
				const loginHint = input.login_hint as string | undefined;
				const providerName = config?.provider_name ?? undefined;

				const registerUrl = resolveEndpointUrl(
					appUrl,
					config,
					"register",
					"/agent/register",
				);
				const deviceCodeUrl = resolveEndpointUrl(
					appUrl,
					config,
					"device_authorization",
					"/device/code",
				);
				const deviceTokenUrl = resolveEndpointUrl(
					appUrl,
					config,
					"device_token",
					"/device/token",
				);

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
				// app, try registering with a host JWT first.
				if (storage.getHostKeypair) {
					const hostData = await storage.getHostKeypair(appUrl);
					if (hostData) {
						const result = await tryHostJWTRegistration(
							appUrl,
							registerUrl,
							hostData,
							keypair.publicKey,
							{ name, scopes, hostName: resolvedHostName, preferredMethod: defaultPreferredMethod },
						);

						if (result && result.status === "active") {
							await storage.saveConnection(result.agent_id, {
								appUrl,
								keypair,
								name,
								scopes: result.scopes,
								provider: providerName,
							});
							sessionAgentIds.add(result.agent_id);

							return {
								content: [
									{
										type: "text" as const,
										text: `Connected to ${appUrl} (trusted host, auto-approved). Agent ID: ${result.agent_id}. Scopes: ${result.scopes.join(", ")}. Use this Agent ID for subsequent requests.`,
									},
								],
							};
						}

						// Handle pending status — store the connection and report
						// the approval URL so the user can approve the agent.
						if (result && result.status === "pending" && result.approval) {
							await storage.saveConnection(result.agent_id, {
								appUrl,
								keypair,
								name,
								scopes: result.scopes ?? [],
								provider: providerName,
							});
							sessionAgentIds.add(result.agent_id);

							const approvalUrl =
								(result.approval as Record<string, string>)
									.verification_uri_complete ??
								(result.approval as Record<string, string>).verification_uri;
							if (approvalUrl) {
								await openVerificationUrl(approvalUrl);
							}

							return {
								content: [
									{
										type: "text" as const,
										text: `Agent registered but pending approval. Agent ID: ${result.agent_id}. Please approve at: ${approvalUrl ?? "the server dashboard"}. Once approved, use request_scope to grant the needed scopes.`,
									},
								],
							};
						}
					}
				}

				// Direct auth mode (cookie/token in env)
				if (getAuthHeaders) {
					const authHeaders = await resolveAuthHeaders();
				const directBody: Record<string, unknown> = {
					name,
					publicKey: keypair.publicKey,
					scopes,
					preferredMethod: defaultPreferredMethod,
				};
				if (resolvedHostName) {
					directBody.hostName = resolvedHostName;
				}
					const res = await globalThis.fetch(registerUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...authHeaders,
						},
						body: JSON.stringify(directBody),
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
						appUrl,
						keypair,
						name,
						scopes: data.scopes,
						provider: providerName,
					});
					sessionAgentIds.add(data.agent_id);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${appUrl}. Agent ID: ${data.agent_id}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
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

					const cibaAuthorizeUrl = resolveEndpointUrl(
						appUrl,
						config,
						"ciba_authorize",
						"/agent/ciba/authorize",
					);
					const cibaTokenUrl = resolveEndpointUrl(
						appUrl,
						config,
						"ciba_token",
						"/agent/ciba/token",
					);

					let cibaRes: Response;
					try {
						cibaRes = await globalThis.fetch(cibaAuthorizeUrl, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								login_hint: loginHint,
								scope: scopes.join(" "),
								binding_message: `${name} requests access${scopes.length > 0 ? `: ${scopes.join(", ")}` : ""}`,
								client_id: clientId,
								backchannel_token_delivery_mode: "poll",
							}),
						});
					} catch (err) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to reach CIBA endpoint at ${cibaAuthorizeUrl}: ${err instanceof Error ? err.message : String(err)}`,
								},
							],
						};
					}

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
					let currentInterval = cibaInterval;

					for (let i = 0; i < cibaMaxAttempts; i++) {
						await new Promise((resolve) =>
							setTimeout(resolve, currentInterval),
						);
						currentInterval = cibaInterval;

						let tokenRes: Response;
						try {
							tokenRes = await globalThis.fetch(cibaTokenUrl, {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									grant_type: "urn:openid:params:grant-type:ciba",
									auth_req_id: cibaData.auth_req_id,
									client_id: clientId,
								}),
							});
						} catch {
							continue;
						}

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

						// Handle both CIBA spec format ({ error }) and
						// Better Auth APIError format ({ code, message })
						const error =
							(resJson.error as string | undefined) ??
							(resJson.code as string | undefined);

						if (
							error === "authorization_pending" ||
							error === "CIBA_REQUEST_NOT_FOUND"
						)
							continue;
						if (error === "slow_down") {
							currentInterval = cibaInterval * 2;
							continue;
						}
						if (error === "access_denied" || error === "CIBA_ACCESS_DENIED") {
							return {
								content: [
									{
										type: "text" as const,
										text: "User denied the CIBA authentication request.",
									},
								],
							};
						}
						if (error === "expired_token" || error === "CIBA_REQUEST_EXPIRED") {
							return {
								content: [
									{
										type: "text" as const,
										text: "CIBA request expired. Please try again.",
									},
								],
							};
						}
						// Unknown error — log it but keep polling in case it's transient
						if (error) {
							const desc =
								(resJson.error_description as string) ??
								(resJson.message as string) ??
								error;
							return {
								content: [
									{
										type: "text" as const,
										text: `CIBA token exchange failed: ${desc}`,
									},
								],
							};
						}
						// No recognizable error field — keep polling
						continue;
					}

					if (!cibaAccessToken) {
						return {
							content: [
								{
									type: "text" as const,
									text: "Timed out waiting for CIBA approval. Ask the user to approve in their dashboard, then try connect_agent again.",
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
						preferredMethod: defaultPreferredMethod,
					};
						if (cibaHostKeypair) {
							cibaRegisterBody.hostPublicKey = cibaHostKeypair.publicKey;
						}
						if (resolvedHostName) {
							cibaRegisterBody.hostName = resolvedHostName;
						}

						const cibaRegRes = await globalThis.fetch(registerUrl, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${cibaAccessToken}`,
							},
							body: JSON.stringify(cibaRegisterBody),
						});

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
							appUrl,
							keypair,
							name,
							scopes: data.scopes,
							provider: providerName,
						});
						sessionAgentIds.add(data.agent_id);

						if (cibaHostKeypair && data.host_id && storage.saveHostKeypair) {
							await storage.saveHostKeypair(appUrl, {
								keypair: cibaHostKeypair,
								hostId: data.host_id,
							});
						}

						return {
							content: [
								{
									type: "text" as const,
									text: `Connected via CIBA to ${appUrl}. Agent ID: ${data.agent_id}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests.`,
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

				let codeRes: Response;
				try {
					codeRes = await globalThis.fetch(deviceCodeUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							client_id: clientId,
							scope: scopes.join(" "),
							client_name: name,
							authorization_details: authorizationDetails,
						}),
					});
				} catch (err) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to reach device auth endpoint at ${deviceCodeUrl}: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}

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
					await storage.savePendingFlow(appUrl, {
						deviceCode: codeData.device_code,
						clientId,
						name,
						scopes,
					});
				}

				await openVerificationUrl(codeData.verification_uri_complete);

				// Poll for approval
				const maxAttempts = 60;
				const pollInterval = Math.max(5000, (codeData.interval ?? 5) * 1000);
				let accessToken: string | null = null;

				for (let i = 0; i < maxAttempts; i++) {
					await new Promise((resolve) => setTimeout(resolve, pollInterval));

					const tokenRes = await globalThis.fetch(deviceTokenUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							grant_type: "urn:ietf:params:oauth:grant-type:device_code",
							device_code: codeData.device_code,
							client_id: clientId,
						}),
					});

					const resText = await tokenRes.text();
					let resJson: Record<string, unknown>;
					try {
						resJson = JSON.parse(resText);
					} catch {
						if (storage.removePendingFlow)
							await storage.removePendingFlow(appUrl);
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
						if (storage.removePendingFlow)
							await storage.removePendingFlow(appUrl);
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
						if (storage.removePendingFlow)
							await storage.removePendingFlow(appUrl);
						return {
							content: [
								{
									type: "text" as const,
									text: "Device code expired. Please try again.",
								},
							],
						};
					}

					if (storage.removePendingFlow)
						await storage.removePendingFlow(appUrl);
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
					if (storage.removePendingFlow)
						await storage.removePendingFlow(appUrl);
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
				const hostKeypair = storage.saveHostKeypair
					? await generateAgentKeypair()
					: null;

				// Register the agent
				try {
				const registerBody: Record<string, unknown> = {
					name,
					publicKey: keypair.publicKey,
					scopes,
					preferredMethod: defaultPreferredMethod,
				};
				if (hostKeypair) {
					registerBody.hostPublicKey = hostKeypair.publicKey;
				}
				if (resolvedHostName) {
					registerBody.hostName = resolvedHostName;
				}

					const res = await globalThis.fetch(registerUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${accessToken}`,
						},
						body: JSON.stringify(registerBody),
					});

					if (!res.ok) {
						if (storage.removePendingFlow)
							await storage.removePendingFlow(appUrl);
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
						appUrl,
						keypair,
						name,
						scopes: data.scopes,
						provider: providerName,
					});
					sessionAgentIds.add(data.agent_id);

					if (hostKeypair && data.host_id && storage.saveHostKeypair) {
						await storage.saveHostKeypair(appUrl, {
							keypair: hostKeypair,
							hostId: data.host_id,
						});
					}

					if (storage.removePendingFlow)
						await storage.removePendingFlow(appUrl);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${appUrl}. Agent ID: ${data.agent_id}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				} catch (err) {
					if (storage.removePendingFlow)
						await storage.removePendingFlow(appUrl);
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
			name: "call_tool",
			description:
				"Execute a capability/tool on a connected provider. " +
				"Call when the user asks you to: create an issue, list pull requests, " +
				"send a message, search repos, or any action on a connected service. " +
				"REQUIRES: (1) An Agent ID from connect_agent. " +
				"(2) The scope must be in your granted permissions. " +
				"Use list_capabilities to discover available capabilities first.",
			inputSchema: {
				agent_id: z.string().describe("Your Agent ID (from connect_agent)"),
				scope: z
					.string()
					.describe("Capability/tool to call (e.g. 'github.list_issues')"),
				input: z
					.string()
					.optional()
					.describe(
						'JSON arguments for the tool (e.g. \'{"owner":"org","repo":"app"}\')',
					),
			},
			handler: async (input) => {
				const agentId = input.agent_id as string;
				const scope = input.scope as string;
				const inputJson = input.input as string | undefined;

				if (!agentId || !sessionAgentIds.has(agentId)) {
					return {
						content: [
							{
								type: "text" as const,
								text: !agentId
									? "agent_id is required. Call connect_agent first."
									: `Agent ${agentId} was not created in this session. Call connect_agent first.`,
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
				if (inputJson) {
					try {
						toolArgs = JSON.parse(inputJson);
					} catch {
						return {
							content: [
								{
									type: "text" as const,
									text: `Invalid JSON in input: ${inputJson}`,
								},
							],
						};
					}
				}

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
					audience: new URL(connection.appUrl).origin,
				});

				try {
					const config = await findProviderConfig(
						connection.provider ?? connection.appUrl,
					);

					// Check capabilities cache for direct routing (§6.5)
					const providerName = config?.provider_name ?? connection.appUrl;
					const cached = capabilitiesCache.get(providerName);
					const capability = cached?.capabilities.find((c) => c.name === scope);

					let res: Response;

					const httpBlock = capability?.http as
						| { method?: string; url?: string }
						| undefined;

					if (
						capability?.type === "http" &&
						httpBlock?.method &&
						httpBlock?.url
					) {
						const hasBody = ["POST", "PUT", "PATCH"].includes(httpBlock.method);
						res = await globalThis.fetch(httpBlock.url, {
							method: httpBlock.method,
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${jwt}`,
							},
							body: hasBody ? JSON.stringify(toolArgs) : undefined,
						});
					} else {
						// Server-side proxy for MCP, unknown types, or when no cache
						const callUrl = resolveEndpointUrl(
							connection.appUrl,
							config,
							"gateway_call",
							"/agent/gateway/call",
						);

						res = await globalThis.fetch(callUrl, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${jwt}`,
							},
							body: JSON.stringify({
								tool: scope,
								args: toolArgs,
							}),
						});
					}

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
		},
		{
			name: "sign_jwt",
			description:
				"Sign an agent JWT for use in direct API calls. " +
				"Returns a short-lived JWT token that can be used in Authorization headers. " +
				"Use this when you need to make custom HTTP requests outside of call_tool.",
			inputSchema: {
				agent_id: z.string().describe("Your Agent ID (from connect_agent)"),
				scopes: z
					.array(z.string())
					.optional()
					.describe("Optional scope restriction for this token"),
			},
			handler: async (input) => {
				const agentId = input.agent_id as string;
				const scopesInput = input.scopes as string[] | undefined;
				const sessionErr = requireSessionAgent(agentId);
				if (sessionErr) {
					return {
						content: [{ type: "text" as const, text: sessionErr }],
					};
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

				if (scopesInput && scopesInput.length > 0) {
					const invalid = scopesInput.filter(
						(s) => !connection.scopes.includes(s),
					);
					if (invalid.length > 0) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Cannot restrict JWT to scopes not granted to this agent: ${invalid.join(", ")}`,
								},
							],
						};
					}
				}

				const additionalClaims: Record<string, unknown> = {};
				if (scopesInput && scopesInput.length > 0) {
					additionalClaims.scopes = scopesInput;
				}

				const token = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
					audience: new URL(connection.appUrl).origin,
					additionalClaims:
						Object.keys(additionalClaims).length > 0
							? additionalClaims
							: undefined,
				});

				const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({ token, expires_at: expiresAt }),
						},
					],
				};
			},
		},
		{
			name: "request_scope",
			description:
				"Request additional scopes for an existing agent connection. " +
				"The user must approve before the scopes are granted. " +
				"This tool will open the approval page and wait for the user's decision. " +
				"New scopes are MERGED with existing ones — nothing is removed. " +
				"ONLY call this if a call_tool returned 403.",
			inputSchema: {
				agent_id: z.string().describe("Your Agent ID (from connect_agent)"),
				scopes: z
					.array(z.string())
					.describe(
						"Additional scopes to request (e.g. ['github.create_issue'])",
					),
				reason: z
					.string()
					.optional()
					.describe("Why you need these scopes (shown to the user)"),
			},
			handler: async (input) => {
				const agentId = input.agent_id as string;
				const newScopes = input.scopes as string[];
				const reason = input.reason as string | undefined;

				if (!agentId || !sessionAgentIds.has(agentId)) {
					return {
						content: [
							{
								type: "text" as const,
								text: "agent_id is required. Call connect_agent first.",
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
								text: "No scopes provided. Pass an array of scopes to request.",
							},
						],
					};
				}

				const config = await findProviderConfig(
					connection.provider ?? connection.appUrl,
				);
				const requestScopeUrl = resolveEndpointUrl(
					connection.appUrl,
					config,
					"request_scope",
					"/agent/request-scope",
				);
				const scopeStatusUrl = resolveEndpointUrl(
					connection.appUrl,
					config,
					"scope_request_status",
					"/agent/scope-request-status",
				);

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
					audience: new URL(connection.appUrl).origin,
				});

				try {
					const res = await globalThis.fetch(requestScopeUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${jwt}`,
						},
					body: JSON.stringify({
						scopes: newScopes,
						reason: reason || undefined,
						preferredMethod: defaultPreferredMethod,
					}),
					});

					if (!res.ok) {
						if (res.status === 409) {
							return {
								content: [
									{
										type: "text" as const,
										text: `All requested scopes are already granted. Current scopes: ${connection.scopes.join(", ")}.`,
									},
								],
							};
						}
						const text = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to request scopes: ${res.status} ${text.slice(0, 300)}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						agent_id?: string;
						status: string;
						scopes?: string[] | string;
						pending_scopes?: string[] | string;
						approval?: {
							method?: string;
							verification_uri?: string;
							verification_uri_complete?: string;
							auth_req_id?: string;
							ciba_token_endpoint?: string;
							expires_in?: number;
							interval?: number;
						};
					};

					if (data.status === "granted" && data.scopes) {
						const dataScopes = toArray(data.scopes);
						await storage.saveConnection(agentId, {
							...connection,
							scopes: dataScopes,
						});
						return {
							content: [
								{
									type: "text" as const,
									text: `Scopes granted immediately. Current scopes: ${dataScopes.join(", ")}.`,
								},
							],
						};
					}

					const requestId = data.agent_id;
					const isCiba = data.approval?.method === "ciba";

					if (!requestId) {
						return {
							content: [
								{
									type: "text" as const,
									text: "Unexpected response from server.",
								},
							],
						};
					}

					if (!isCiba) {
						const verificationUrl =
							data.approval?.verification_uri_complete ??
							data.approval?.verification_uri;
						if (verificationUrl) {
							await openVerificationUrl(verificationUrl);
						}
					}

					// Poll scope-request-status until approved/denied.
					// Works for both CIBA and device_authorization — the server
					// auto-approves pending permissions when the CIBA request
					// is approved.
					const POLL_INTERVAL = isCiba ? 3000 : 2000;
					const MAX_WAIT = 5 * 60 * 1000;
					const start = Date.now();

					while (Date.now() - start < MAX_WAIT) {
						await new Promise((r) => setTimeout(r, POLL_INTERVAL));

						const pollJwt = await signAgentJWT({
							agentId,
							privateKey: connection.keypair.privateKey,
							audience: new URL(connection.appUrl).origin,
						});

						const pollRes = await globalThis.fetch(
							`${scopeStatusUrl}?requestId=${requestId}`,
							{
								headers: {
									Authorization: `Bearer ${pollJwt}`,
								},
							},
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
								await storage.saveConnection(agentId, {
									...connection,
									scopes,
								});
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
										text: "Scope request was denied by the user.",
									},
								],
							};
						}
					}

					const timeoutMsg = isCiba
						? "Timed out waiting for scope approval. Ask the user to approve in their dashboard."
						: `Timed out waiting for scope approval. Ask the user to approve at: ${data.approval?.verification_uri_complete ?? data.approval?.verification_uri ?? "the server dashboard"}`;

					return {
						content: [
							{
								type: "text" as const,
								text: timeoutMsg,
							},
						],
					};
				} catch (e) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error requesting scopes: ${e instanceof Error ? e.message : String(e)}`,
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
					return {
						content: [{ type: "text" as const, text: sessionErr }],
					};
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
					const config = await findProviderConfig(
						connection.provider ?? connection.appUrl,
					);
					const revokeUrl = resolveEndpointUrl(
						connection.appUrl,
						config,
						"revoke",
						"/agent/revoke",
					);
					const jwt = await signAgentJWT({
						agentId,
						privateKey: connection.keypair.privateKey,
						audience: new URL(connection.appUrl).origin,
					});
					await globalThis.fetch(revokeUrl, {
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
					return {
						content: [{ type: "text" as const, text: sessionErr }],
					};
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

				const config = await findProviderConfig(
					connection.provider ?? connection.appUrl,
				);
				const statusUrl = resolveEndpointUrl(
					connection.appUrl,
					config,
					"status",
					"/agent/status",
				);

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
					audience: new URL(connection.appUrl).origin,
				});

				const res = await globalThis.fetch(statusUrl, {
					headers: { Authorization: `Bearer ${jwt}` },
				});

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
			name: "connect_account",
			description:
				"Link an autonomous agent to a user account (§6.8). " +
				"Use when an agent registered in autonomous mode needs to connect to a specific user. " +
				"The user must approve the link. After approval, the agent gains access to user-specific capabilities.",
			inputSchema: {
				agent_id: z.string().describe("Your Agent ID (from connect_agent)"),
				identifier: z
					.string()
					.optional()
					.describe("User identifier (email, phone, etc.) for notification"),
			},
			handler: async (input) => {
				const agentId = input.agent_id as string;
				const identifier = input.identifier as string | undefined;
				const sessionErr = requireSessionAgent(agentId);
				if (sessionErr) {
					return {
						content: [{ type: "text" as const, text: sessionErr }],
					};
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

				const config = await findProviderConfig(
					connection.provider ?? connection.appUrl,
				);
				const connectUrl = resolveEndpointUrl(
					connection.appUrl,
					config,
					"connect_account",
					"/agent/connect-account",
				);

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
					audience: new URL(connection.appUrl).origin,
				});

				try {
					const res = await globalThis.fetch(connectUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${jwt}`,
						},
						body: JSON.stringify({
							identifier,
						}),
					});

					if (!res.ok) {
						const text = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to connect account: ${res.status} ${text.slice(0, 300)}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						agent_id: string;
						host_id: string;
						status: string;
						approval?: {
							verification_uri?: string;
							verification_uri_complete?: string;
							user_code?: string;
						};
					};

					if (
						data.status === "pending" &&
						data.approval?.verification_uri_complete
					) {
						await openVerificationUrl(data.approval.verification_uri_complete);
						return {
							content: [
								{
									type: "text" as const,
									text:
										`Account link pending. The user must approve at:\n${data.approval.verification_uri_complete}\n` +
										(data.approval.user_code
											? `Code: ${data.approval.user_code}\n`
											: "") +
										`Once approved, the agent will gain access to user-specific capabilities.`,
								},
							],
						};
					}

					return {
						content: [
							{
								type: "text" as const,
								text: `Account link status: ${data.status}`,
							},
						],
					};
				} catch (err) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to connect account: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}
			},
		},
		{
			name: "self_register",
			description:
				"Register as an autonomous agent WITHOUT user authentication. " +
				"The agent is created immediately and can start making requests right away. " +
				"Use when the user asks you to: create your own account, register autonomously, " +
				"operate independently, or self-register. " +
				"To link to a user account later, use connect_account.",
			inputSchema: {
				provider: z
					.string()
					.optional()
					.describe(
						"Provider name (from discover) or app URL. Uses default if omitted.",
					),
				url: z
					.string()
					.optional()
					.describe(
						"App URL (e.g. https://myapp.com). Alternative to provider.",
					),
				name: z
					.string()
					.describe(
						"A descriptive name for yourself (e.g. 'Autonomous Research Agent')",
					),
				scopes: z
					.array(z.string())
					.optional()
					.describe("Scopes to request (e.g. ['reports.read'])"),
			},
			handler: async (input) => {
				const providerInput =
					(input.provider as string) ||
					(input.url as string) ||
					defaultUrl ||
					"";
				if (!providerInput) {
					return {
						content: [
							{
								type: "text" as const,
								text: "A provider name or URL is required. Call discover(url=...) first, then use the provider name.",
							},
						],
					};
				}

				const { appUrl, config } = await resolveAppUrl(providerInput);
				if (!appUrl) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Could not resolve "${providerInput}" to an app URL. Call discover(url=...) first.`,
							},
						],
					};
				}
				const name = (input.name as string) ?? "Autonomous Agent";
				const scopes = (input.scopes as string[]) ?? [];

				const registerUrl = resolveEndpointUrl(
					appUrl,
					config,
					"register",
					"/agent/register",
				);

				try {
					const hostKeypair = await generateAgentKeypair();
					const agentKeypair = await generateAgentKeypair();

					const selfRegClaims: Record<string, unknown> = {
						host_public_key: hostKeypair.publicKey,
						agent_public_key: agentKeypair.publicKey,
					};
					if (resolvedHostName) {
						selfRegClaims.host_name = resolvedHostName;
					}
					const hostJwt = await signAgentJWT({
						agentId: hostKeypair.kid,
						privateKey: hostKeypair.privateKey,
						audience: new URL(appUrl).origin,
						expiresIn: 60,
						additionalClaims: selfRegClaims,
					});

					const selfRegBody: Record<string, unknown> = {
						name,
						scopes,
						mode: "autonomous",
					};
					if (resolvedHostName) {
						selfRegBody.hostName = resolvedHostName;
					}

					const res = await globalThis.fetch(registerUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${hostJwt}`,
						},
						body: JSON.stringify(selfRegBody),
					});

					if (!res.ok) {
						const text = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to self-register: ${res.status} ${text.slice(0, 300)}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						agent_id: string;
						name: string;
						status: string;
						host_id: string;
						scopes: string[];
					};

					await storage.saveConnection(data.agent_id, {
						appUrl,
						keypair: agentKeypair,
						name,
						scopes: data.scopes ?? [],
						provider: config?.provider_name,
					});
					sessionAgentIds.add(data.agent_id);

					const lines = [
						`Self-registered as autonomous agent on ${appUrl}.`,
						`Agent ID: ${data.agent_id}`,
						`Host ID: ${data.host_id}`,
						`Status: ${data.status}`,
						`Scopes: ${(data.scopes ?? []).join(", ") || "none"}`,
					];

					if (data.status === "active") {
						lines.push(
							"",
							"Agent is active. Use this Agent ID for agent_request and call_tool.",
							"To link to a user account later, use connect_account.",
						);
					} else {
						lines.push(
							"",
							`Agent is ${data.status}. It may need further action before making requests.`,
						);
					}

					return {
						content: [
							{
								type: "text" as const,
								text: lines.join("\n"),
							},
						],
					};
				} catch (e) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: ${e instanceof Error ? e.message : String(e)}`,
							},
						],
					};
				}
			},
		},
		{
			name: "agent_request",
			description:
				"Make an authenticated HTTP request to the app's own API endpoints. " +
				"Use when the user asks you to: fetch data, call an API, get information from the app, " +
				"submit data, or interact with the app's backend. " +
				"NOT for third-party tools — use call_tool for those. " +
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
					return {
						content: [{ type: "text" as const, text: sessionErr }],
					};
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
				url: z
					.string()
					.describe(
						"App URL or provider name (same one used in connect_agent)",
					),
			},
			handler: async (input) => {
				const rawInput = (input.url as string).replace(/\/+$/, "");
				const { appUrl } = await resolveAppUrl(rawInput);

				const pendingFlow = storage.getPendingFlow
					? await storage.getPendingFlow(appUrl)
					: null;
				if (!pendingFlow) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No pending connection for ${appUrl}. Run connect_agent first.`,
							},
						],
					};
				}

				const keypair = await generateAgentKeypair();
				const config = await findProviderConfig(rawInput);
				const registerUrl = resolveEndpointUrl(
					appUrl,
					config,
					"register",
					"/agent/register",
				);
				const deviceTokenUrl = resolveEndpointUrl(
					appUrl,
					config,
					"device_token",
					"/device/token",
				);

				// Poll for the token
				const maxAttempts = 60;
				const pollInterval = 5000;
				let accessToken: string | null = null;

				for (let i = 0; i < maxAttempts; i++) {
					const tokenRes = await globalThis.fetch(deviceTokenUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							grant_type: "urn:ietf:params:oauth:grant-type:device_code",
							device_code: pendingFlow.deviceCode,
							client_id: pendingFlow.clientId,
						}),
					});

					const resText = await tokenRes.text();
					let resJson: Record<string, unknown>;
					try {
						resJson = JSON.parse(resText);
					} catch {
						if (storage.removePendingFlow)
							await storage.removePendingFlow(appUrl);
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
						if (storage.removePendingFlow)
							await storage.removePendingFlow(appUrl);
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
						if (storage.removePendingFlow)
							await storage.removePendingFlow(appUrl);
						return {
							content: [
								{
									type: "text" as const,
									text: "Device code expired. Please run connect_agent again.",
								},
							],
						};
					}

					if (storage.removePendingFlow)
						await storage.removePendingFlow(appUrl);
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
					if (storage.removePendingFlow)
						await storage.removePendingFlow(appUrl);
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
					const data = await tryRegisterAgent(registerUrl, accessToken, {
						name: pendingFlow.name,
						publicKey: keypair.publicKey,
						scopes: pendingFlow.scopes,
					});

					if (!data) {
						if (storage.removePendingFlow)
							await storage.removePendingFlow(appUrl);
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
						appUrl,
						keypair,
						name: pendingFlow.name,
						scopes: data.scopes,
						provider: config?.provider_name,
					});
					sessionAgentIds.add(data.agent_id);

					if (storage.removePendingFlow)
						await storage.removePendingFlow(appUrl);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${appUrl}. Agent ID: ${data.agent_id}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				} catch (err) {
					if (storage.removePendingFlow)
						await storage.removePendingFlow(appUrl);
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
