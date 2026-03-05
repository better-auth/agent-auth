/**
 * AI SDK adapter for Agent Auth.
 *
 * Provides a single `agentAuth()` function that connects to one or more
 * Agent Auth providers, discovers capabilities, and returns tool
 * definitions compatible with Vercel AI SDK's `generateText` / `streamText`.
 *
 * The AI model sees real capability tools (e.g. `transfer_domestic`,
 * `github.create_issue`) — it never sees protocol tools like
 * `connect_agent` or `call_tool`. Agent Auth is invisible plumbing.
 *
 * @example
 * ```ts
 * import { agentAuth } from "@auth/agents/ai";
 * import { generateText } from "ai";
 * import { openai } from "@ai-sdk/openai";
 * import { createFileStorage } from "@auth/agents/mcp-storage-fs";
 *
 * const { tools, cleanup } = await agentAuth({
 *   providers: [
 *     { url: "https://bank.com", scopes: ["transfer_domestic"] },
 *     { url: "https://github-gateway.com" },
 *   ],
 *   storage: createFileStorage({ encryptionKey: process.env.KEY! }),
 *   onApprovalNeeded: ({ url }) => console.log(`Approve: ${url}`),
 * });
 *
 * const result = await generateText({
 *   model: openai("gpt-4o"),
 *   tools,
 *   prompt: "Transfer $100 to Bob",
 * });
 *
 * await cleanup();
 * ```
 */

import { openInBrowser } from "./agent-client";
import type { AgentJWK } from "./crypto";
import { generateAgentKeypair, signAgentJWT } from "./crypto";
import { detectHostName } from "./host-name";
import type {
	AgentKeypair,
	Capability,
	MCPAgentStorage,
	ProviderConfig,
} from "./mcp-tools";

// ---------------------------------------------------------------------------
// AI SDK compatible schema wrapper
// ---------------------------------------------------------------------------

const SCHEMA_SYMBOL = Symbol.for("vercel.ai.schema");

/**
 * Wrap a JSON Schema object so the AI SDK recognises it as a valid
 * `parameters` / `inputSchema` value. Works without importing `ai`.
 */
function jsonSchema<T = unknown>(
	schema: Record<string, unknown>,
): {
	readonly [key: symbol]: string;
	readonly jsonSchema: Record<string, unknown>;
	validate(value: unknown): { success: true; value: T };
} {
	return {
		[SCHEMA_SYMBOL]: "json-schema",
		jsonSchema: schema,
		validate: (value: unknown) => ({
			success: true as const,
			value: value as T,
		}),
	};
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AgentAuthProvider {
	/** URL of the Agent Auth server (e.g. "https://bank.com") */
	url: string;
	/** Scopes to request. If omitted, the server grants the host's defaults. */
	scopes?: string[];
	/** Registration mode. Default: "delegated" */
	mode?: "delegated" | "autonomous";
	/** Client ID for device auth flow. Default: "agent-auth" */
	clientId?: string;
}

export interface AgentAuthOptions {
	/** One or more providers to connect to. */
	providers: AgentAuthProvider | AgentAuthProvider[];
	/** Storage for persisting agent connections and host keypairs. */
	storage: MCPAgentStorage;
	/**
	 * Called when user approval is needed (device auth flow).
	 * Open the URL in a browser so the user can approve.
	 */
	onApprovalNeeded?: (info: {
		url: string;
		userCode: string;
		providerUrl: string;
	}) => void | Promise<void>;
	/** Max time to wait for approval per provider (ms). Default: 300_000 */
	approvalTimeout?: number;
	/** Polling interval for device auth (ms). Default: 5_000 */
	pollInterval?: number;
	/**
	 * Agent name used during registration.
	 * When connecting to multiple providers a numeric suffix is appended.
	 * Default: "Agent"
	 */
	name?: string;
	/**
	 * Namespace tool names by provider to avoid collisions.
	 * Default: true when more than one provider is given.
	 */
	namespaceTools?: boolean;
	/**
	 * Human-readable host name sent during registration.
	 * Auto-detected if not provided. Set to `false` to disable.
	 */
	hostName?: string | false;
	/**
	 * Include `request_scope` and `check_scope_status` tools so the AI
	 * model can request additional permissions at runtime via CIBA.
	 * When enabled, the model can escalate scopes and the user approves
	 * via the browser extension or dashboard.
	 * Default: false
	 */
	includeScopeTools?: boolean;
}

export interface AgentAuthConnection {
	providerUrl: string;
	providerName: string;
	agentId: string;
	scopes: string[];
}

export interface AgentAuthTool {
	description: string;
	parameters: ReturnType<typeof jsonSchema>;
	execute: (
		args: Record<string, unknown>,
	) => Promise<Record<string, unknown> | string>;
}

export interface AgentAuthResult {
	/** Tools keyed by capability name, ready for AI SDK generateText/streamText. */
	tools: Record<string, AgentAuthTool>;
	/** Active connections created or reused during setup. */
	connections: AgentAuthConnection[];
	/** Disconnect all agents and clean up. */
	cleanup: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * LLM providers (Anthropic, OpenAI) restrict tool names to `[a-zA-Z0-9_-]`.
 * Capability names use dots as namespace separators (e.g. `acme-bank.list_accounts`),
 * so we replace dots with double underscores for the tool name.
 */
function sanitizeToolName(name: string): string {
	return name.replace(/\./g, "__").replace(/[^a-zA-Z0-9_-]/g, "_");
}

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

async function discoverConfig(baseUrl: string): Promise<ProviderConfig | null> {
	try {
		const wellKnownRes = await globalThis
			.fetch(`${baseUrl}/.well-known/agent-configuration`)
			.catch(() => null);
		if (wellKnownRes?.ok) {
			return (await wellKnownRes.json()) as ProviderConfig;
		}
		for (const prefix of ["/api/auth", "/auth", "/api"]) {
			try {
				const res = await globalThis.fetch(
					`${baseUrl}${prefix}/agent/discover`,
				);
				if (res.ok) return (await res.json()) as ProviderConfig;
			} catch {}
		}
	} catch {}
	return null;
}

async function fetchCapabilities(
	appUrl: string,
	config: ProviderConfig | null,
	agentId: string,
	privateKey: AgentJWK,
): Promise<Capability[]> {
	const url = resolveEndpointUrl(
		appUrl,
		config,
		"capabilities",
		"/agent/capabilities",
	);
	const jwt = await signAgentJWT({
		agentId,
		privateKey,
		audience: new URL(appUrl).origin,
	});
	const res = await globalThis.fetch(url, {
		headers: { Authorization: `Bearer ${jwt}` },
	});
	if (!res.ok) {
		throw new Error(
			`Failed to fetch capabilities from ${appUrl}: ${res.status}`,
		);
	}
	const data = (await res.json()) as {
		capabilities: Capability[];
		has_more?: boolean;
	};
	return data.capabilities ?? [];
}

async function executeCapability(
	appUrl: string,
	config: ProviderConfig | null,
	agentId: string,
	privateKey: AgentJWK,
	capability: Capability,
	args: Record<string, unknown>,
): Promise<Record<string, unknown> | string> {
	const jwt = await signAgentJWT({
		agentId,
		privateKey,
		audience: new URL(appUrl).origin,
	});

	const httpBlock = capability.http as
		| { method?: string; url?: string }
		| undefined;

	let res: Response;

	if (capability.type === "http" && httpBlock?.method && httpBlock?.url) {
		const hasBody = ["POST", "PUT", "PATCH"].includes(httpBlock.method);
		res = await globalThis.fetch(httpBlock.url, {
			method: httpBlock.method,
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${jwt}`,
			},
			body: hasBody ? JSON.stringify(args) : undefined,
		});
	} else {
		const callUrl = resolveEndpointUrl(
			appUrl,
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
			body: JSON.stringify({ tool: capability.name, args }),
		});
	}

	if (!res.ok) {
		const text = await res.text();
		let msg: string;
		try {
			const errJson = JSON.parse(text);
			msg = (errJson.error as string) ?? text;
		} catch {
			msg = text;
		}
		throw new Error(`Tool ${capability.name} failed (${res.status}): ${msg}`);
	}

	const result = (await res.json()) as {
		content?: Array<{ type: string; text: string }>;
		[key: string]: unknown;
	};

	if (result.content && Array.isArray(result.content)) {
		const texts = result.content
			.filter((c) => c.type === "text" || !c.type)
			.map((c) => c.text);
		if (texts.length === 1) return texts[0];
		if (texts.length > 1) return texts.join("\n");
	}

	return result;
}

// ---------------------------------------------------------------------------
// Scope request tools (CIBA flow)
// ---------------------------------------------------------------------------

function buildScopeTools(
	agents: ConnectedAgent[],
): Record<string, AgentAuthTool> {
	const tools: Record<string, AgentAuthTool> = {};

	tools.request_scope = {
		description:
			"Request permission to use provider tools. Call this BEFORE calling any provider tool for the first time. " +
			"Use scopes like 'provider.*' for all tools from a provider, or specific ones like 'acme-bank.list_accounts'. " +
			"After calling, tell the user to approve in their browser extension or approvals page, then call check_scope_status.",
		parameters: jsonSchema({
			type: "object",
			properties: {
				scopes: {
					type: "array",
					items: { type: "string" },
					description:
						"Scope strings to request, e.g. ['acme-bank.*'] or ['github.list_repos']",
				},
				reason: {
					type: "string",
					description:
						"Brief human-readable reason shown in the approval prompt",
				},
			},
			required: ["scopes", "reason"],
		}),
		execute: async (args: Record<string, unknown>) => {
			const scopes = args.scopes as string[];
			const reason = args.reason as string;
			const results: Record<string, unknown>[] = [];

			for (const agent of agents) {
				const jwt = await signAgentJWT({
					agentId: agent.agentId,
					privateKey: agent.keypair.privateKey,
					audience: new URL(agent.appUrl).origin,
				});
				const url = resolveEndpointUrl(
					agent.appUrl,
					agent.config,
					"request_scope",
					"/agent/request-scope",
				);
				const res = await globalThis.fetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({ scopes, reason, preferredMethod: "device_authorization" }),
				});
				const data = (await res.json()) as {
					status?: string;
					approval?: {
						method?: string;
						verification_uri?: string;
						verification_uri_complete?: string;
					};
					[key: string]: unknown;
				};

				if (
					data.approval?.method === "device_authorization" &&
					(data.approval.verification_uri_complete ??
						data.approval.verification_uri)
				) {
					const verificationUrl =
						data.approval.verification_uri_complete ??
						data.approval.verification_uri;
					if (verificationUrl) {
						await openInBrowser(verificationUrl).catch(() => {});
					}
				}

				results.push(data);
			}

			return results.length === 1
				? (results[0] as Record<string, unknown>)
				: { results };
		},
	};

	tools.check_scope_status = {
		description:
			'Check whether the user has approved the pending scope request. Returns status "approved" when the scopes are granted and you can proceed to call provider tools.',
		parameters: jsonSchema({
			type: "object",
			properties: {},
		}),
		execute: async () => {
			const results: Record<string, unknown>[] = [];

			for (const agent of agents) {
				const url = resolveEndpointUrl(
					agent.appUrl,
					agent.config,
					"scope_request_status",
					"/agent/scope-request-status",
				);
				const res = await globalThis.fetch(`${url}?requestId=${agent.agentId}`);
				const data = await res.json();
				results.push(data as Record<string, unknown>);
			}

			return results.length === 1
				? (results[0] as Record<string, unknown>)
				: { results };
		},
	};

	return tools;
}

async function revokeAgent(
	appUrl: string,
	agentId: string,
	privateKey: AgentJWK,
): Promise<void> {
	try {
		const jwt = await signAgentJWT({
			agentId,
			privateKey,
			audience: new URL(appUrl).origin,
		});
		await globalThis.fetch(`${appUrl}/api/auth/agent/revoke`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${jwt}`,
			},
			body: JSON.stringify({ agentId }),
		});
	} catch {}
}

// ---------------------------------------------------------------------------
// Connection: reuse stored or create via host JWT / device auth
// ---------------------------------------------------------------------------

interface ConnectedAgent {
	agentId: string;
	keypair: AgentKeypair;
	appUrl: string;
	config: ProviderConfig | null;
	scopes: string[];
	providerName: string;
}

/**
 * Try to reuse an existing connection from storage for the given appUrl.
 * Performs a health check to verify the agent is still active.
 */
async function tryReuseStoredConnection(
	appUrl: string,
	storage: MCPAgentStorage,
): Promise<ConnectedAgent | null> {
	const connections = await storage.listConnections();
	for (const conn of connections) {
		if (conn.appUrl.replace(/\/+$/, "") !== appUrl) continue;
		const full = await storage.getConnection(conn.agentId);
		if (!full) continue;
		try {
			const config = await discoverConfig(appUrl);
			const statusUrl = resolveEndpointUrl(
				appUrl,
				config,
				"status",
				"/agent/status",
			);
			const jwt = await signAgentJWT({
				agentId: conn.agentId,
				privateKey: full.keypair.privateKey,
				audience: new URL(appUrl).origin,
			});
			const res = await globalThis.fetch(statusUrl, {
				headers: { Authorization: `Bearer ${jwt}` },
			});
			if (res.ok) {
				return {
					agentId: conn.agentId,
					keypair: full.keypair,
					appUrl,
					config,
					scopes: full.scopes,
					providerName: config?.provider_name ?? full.provider ?? appUrl,
				};
			}
		} catch {}
	}
	return null;
}

async function connectProvider(
	provider: AgentAuthProvider,
	storage: MCPAgentStorage,
	opts: {
		name: string;
		hostName: string | null;
		onApprovalNeeded?: AgentAuthOptions["onApprovalNeeded"];
		approvalTimeout: number;
		pollInterval: number;
	},
): Promise<ConnectedAgent> {
	const appUrl = provider.url.replace(/\/+$/, "");
	const clientId = provider.clientId ?? "agent-auth";

	// 1. Check storage for existing connection
	const reused = await tryReuseStoredConnection(appUrl, storage);
	if (reused) return reused;

	// 3. Discover provider config
	const config = await discoverConfig(appUrl);
	const providerName = config?.provider_name ?? appUrl;

	const registerUrl = resolveEndpointUrl(
		appUrl,
		config,
		"register",
		"/agent/register",
	);

	const agentKeypair = await generateAgentKeypair();
	const scopes = provider.scopes ?? [];
	const mode = provider.mode ?? "delegated";
	const name = opts.name;

	// 4. Try host JWT registration (trusted host path)
	if (storage.getHostKeypair) {
		const hostData = await storage.getHostKeypair(appUrl);
		if (hostData) {
			const additionalClaims: Record<string, unknown> = {
				host_public_key: hostData.keypair.publicKey,
				agent_public_key: agentKeypair.publicKey,
			};
			if (opts.hostName) additionalClaims.host_name = opts.hostName;

			const hostJwt = await signAgentJWT({
				agentId: hostData.hostId,
				privateKey: hostData.keypair.privateKey,
				audience: new URL(appUrl).origin,
				expiresIn: 60,
				additionalClaims,
			});

			const regBody: Record<string, unknown> = { name, scopes, mode, preferredMethod: "device_authorization" };
			if (opts.hostName) regBody.hostName = opts.hostName;

			const res = await globalThis.fetch(registerUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${hostJwt}`,
				},
				body: JSON.stringify(regBody),
			});

			if (res.ok) {
				const data = (await res.json()) as {
					agent_id: string;
					scopes: string[];
					status: string;
				};
				if (data.status === "active") {
					await storage.saveConnection(data.agent_id, {
						appUrl,
						keypair: agentKeypair,
						name,
						scopes: data.scopes,
						provider: providerName,
					});
					return {
						agentId: data.agent_id,
						keypair: agentKeypair,
						appUrl,
						config,
						scopes: data.scopes,
						providerName,
					};
				}
			}
		}
	}

	// 5. Device authorization flow
	const deviceCodeUrl = resolveEndpointUrl(
		appUrl,
		config,
		"device_code",
		"/device/code",
	);
	const deviceTokenUrl = resolveEndpointUrl(
		appUrl,
		config,
		"device_token",
		"/device/token",
	);

	const codeRes = await globalThis.fetch(deviceCodeUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_id: clientId,
			scope: scopes.join(" "),
			client_name: name,
		}),
	});

	if (!codeRes.ok) {
		const err = await codeRes.text();
		throw new Error(`Device auth failed for ${appUrl}: ${err}`);
	}

	const codeData = (await codeRes.json()) as {
		device_code: string;
		user_code: string;
		verification_uri: string;
		verification_uri_complete: string;
		expires_in: number;
		interval: number;
	};

	if (opts.onApprovalNeeded) {
		await opts.onApprovalNeeded({
			url: codeData.verification_uri_complete,
			userCode: codeData.user_code,
			providerUrl: appUrl,
		});
	} else {
		await openInBrowser(codeData.verification_uri_complete).catch(() => {});
	}

	const effectiveInterval = Math.max(
		opts.pollInterval,
		(codeData.interval ?? 5) * 1000,
	);
	const deadline = Date.now() + opts.approvalTimeout;
	let accessToken: string | null = null;

	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, effectiveInterval));

		const tokenRes = await globalThis.fetch(deviceTokenUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: codeData.device_code,
				client_id: clientId,
			}),
		});

		if (tokenRes.ok) {
			const tokenData = (await tokenRes.json()) as {
				access_token: string;
			};
			accessToken = tokenData.access_token;
			break;
		}

		const errData = (await tokenRes.json()) as { error: string };
		if (errData.error === "authorization_pending") continue;
		if (errData.error === "slow_down") {
			await new Promise((r) => setTimeout(r, effectiveInterval));
			continue;
		}
		if (errData.error === "access_denied") {
			throw new Error(`User denied agent connection for ${appUrl}`);
		}
		if (errData.error === "expired_token") {
			throw new Error(`Device code expired for ${appUrl}. Try again.`);
		}
		throw new Error(`Device auth error for ${appUrl}: ${errData.error}`);
	}

	if (!accessToken) {
		throw new Error(`Approval timed out for ${appUrl}`);
	}

	// Register agent with the session token
	const hostKeypair = storage.saveHostKeypair
		? await generateAgentKeypair()
		: null;

	const regBody: Record<string, unknown> = {
		name,
		publicKey: agentKeypair.publicKey,
		scopes,
		mode,
		preferredMethod: "device_authorization",
	};
	if (hostKeypair) regBody.hostPublicKey = hostKeypair.publicKey;
	if (opts.hostName) regBody.hostName = opts.hostName;

	const regRes = await globalThis.fetch(registerUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify(regBody),
	});

	if (!regRes.ok) {
		const err = await regRes.text();
		throw new Error(`Agent registration failed for ${appUrl}: ${err}`);
	}

	const regData = (await regRes.json()) as {
		agent_id: string;
		host_id?: string;
		scopes: string[];
	};

	await storage.saveConnection(regData.agent_id, {
		appUrl,
		keypair: agentKeypair,
		name,
		scopes: regData.scopes,
		provider: providerName,
	});

	if (hostKeypair && regData.host_id && storage.saveHostKeypair) {
		await storage.saveHostKeypair(appUrl, {
			keypair: hostKeypair,
			hostId: regData.host_id,
		});
	}

	return {
		agentId: regData.agent_id,
		keypair: agentKeypair,
		appUrl,
		config,
		scopes: regData.scopes,
		providerName,
	};
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Connect to one or more Agent Auth providers and return AI-SDK-compatible
 * tools derived from their capabilities.
 *
 * Each capability becomes a tool the AI model can call directly.
 * Connection, JWT signing, and routing are handled automatically.
 */
export async function agentAuth(
	options: AgentAuthOptions,
): Promise<AgentAuthResult> {
	const providers = Array.isArray(options.providers)
		? options.providers
		: [options.providers];

	if (providers.length === 0) {
		throw new Error("At least one provider is required");
	}

	const resolvedHostName =
		options.hostName === false ? null : (options.hostName ?? detectHostName());
	const baseName = options.name ?? "Agent";
	const approvalTimeout = options.approvalTimeout ?? 300_000;
	const pollInterval = options.pollInterval ?? 5_000;
	const namespaceTools = options.namespaceTools ?? providers.length > 1;

	// Connect to all providers
	const agents: ConnectedAgent[] = [];
	for (let i = 0; i < providers.length; i++) {
		const agentName = providers.length > 1 ? `${baseName} ${i + 1}` : baseName;
		const agent = await connectProvider(providers[i], options.storage, {
			name: agentName,
			hostName: resolvedHostName,
			onApprovalNeeded: options.onApprovalNeeded,
			approvalTimeout,
			pollInterval,
		});
		agents.push(agent);
	}

	// Discover capabilities and build tools
	const tools: Record<string, AgentAuthTool> = {};
	const connections: AgentAuthConnection[] = [];

	for (const agent of agents) {
		const capabilities = await fetchCapabilities(
			agent.appUrl,
			agent.config,
			agent.agentId,
			agent.keypair.privateKey,
		);

		connections.push({
			providerUrl: agent.appUrl,
			providerName: agent.providerName,
			agentId: agent.agentId,
			scopes: agent.scopes,
		});

		for (const cap of capabilities) {
			const rawName = namespaceTools
				? `${agent.providerName}.${cap.name}`
				: cap.name;
			const toolName = sanitizeToolName(rawName);

			const schema = (cap.input_schema as Record<string, unknown>) ?? {
				type: "object",
				properties: {},
			};

			tools[toolName] = {
				description: cap.description,
				parameters: jsonSchema(schema),
				execute: async (args: Record<string, unknown>) => {
					return executeCapability(
						agent.appUrl,
						agent.config,
						agent.agentId,
						agent.keypair.privateKey,
						cap,
						args,
					);
				},
			};
		}
	}

	if (options.includeScopeTools) {
		const scopeTools = buildScopeTools(agents);
		for (const [name, tool] of Object.entries(scopeTools)) {
			tools[name] = tool;
		}
	}

	const cleanup = async () => {
		for (const agent of agents) {
			await revokeAgent(agent.appUrl, agent.agentId, agent.keypair.privateKey);
			await options.storage.removeConnection(agent.agentId);
		}
	};

	return { tools, connections, cleanup };
}
