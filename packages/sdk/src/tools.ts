import type { AgentAuthClient } from "./client";

export interface ToolParameters {
	type: "object";
	properties: Record<string, Record<string, unknown>>;
	required?: string[];
}

export interface ToolContext {
	signal?: AbortSignal;
}

export interface AgentAuthTool {
	name: string;
	description: string;
	parameters: ToolParameters;
	execute: (
		args: Record<string, unknown>,
		context?: ToolContext,
	) => Promise<unknown>;
}

/**
 * Returns a protocol-agnostic list of agent auth tools backed by
 * an `AgentAuthClient` instance.
 *
 * Each tool has a JSON Schema `parameters` object and an `execute`
 * handler. Adapters (MCP, Vercel AI SDK, OpenAI function calling,
 * LangChain, etc.) can consume these directly.
 */
export function getAgentAuthTools(
	client: AgentAuthClient,
): AgentAuthTool[] {
	return [
		// ── Step 1: Find a provider ──

		{
			name: "list_providers",
			description:
				"Step 1a — ALWAYS call this first. Lists providers that have already been discovered, connected, or pre-configured. Check here before searching or discovering. If the provider you need is already listed, skip straight to Step 2.",
			parameters: { type: "object", properties: {} },
			async execute() {
				return client.listProviders();
			},
		},

		{
			name: "search_providers",
			description:
				"Step 1b: Search the registry for providers by name or intent. Call this when list_providers doesn't have what you need. Use the provider name (e.g. 'vercel', 'github') or describe what you want to do (e.g. 'deploy web apps'). Found providers are automatically cached so you can use them immediately.",
			parameters: {
				type: "object",
				properties: {
					intent: {
						type: "string",
						description:
							"Provider name or what you want to do (e.g. 'vercel', 'deploy web apps', 'send emails')",
					},
				},
				required: ["intent"],
			},
			async execute(args) {
				return client.searchProviders(args.intent as string);
			},
		},

		{
			name: "discover_provider",
			description:
				"Step 1c — Last resort. Look up a provider by URL. When a registry is configured (default), this only resolves providers through the registry — it will NOT fetch from arbitrary URLs. Only use this if list_providers and search_providers didn't find what you need.",
			parameters: {
				type: "object",
				properties: {
					url: {
						type: "string",
						description:
							"Service URL or domain to look up (e.g. https://api.example.com, vercel.com)",
					},
				},
				required: ["url"],
			},
			async execute(args) {
				return client.discoverProvider(args.url as string);
			},
		},

		// ── Step 2: Browse capabilities ──

		{
			name: "list_capabilities",
			description:
				"Step 2: List capabilities offered by a provider. Call after discovering a provider to see what it offers before connecting an agent.",
			parameters: {
				type: "object",
				properties: {
					provider: {
						type: "string",
						description: "Provider URL, issuer, or name",
					},
					query: {
						type: "string",
						description:
							"Search query to filter capabilities by name or description",
					},
					agent_id: {
						type: "string",
						description:
							"Agent ID to see grant status (only after connect_agent)",
					},
					cursor: {
						type: "string",
						description: "Pagination cursor",
					},
				},
				required: ["provider"],
			},
			async execute(args) {
				return client.listCapabilities({
					provider: args.provider as string,
					query: args.query as string | undefined,
					agentId: args.agent_id as string | undefined,
					cursor: args.cursor as string | undefined,
				});
			},
		},

		// ── Step 3: Connect an agent ──

		{
			name: "connect_agent",
			description:
				"Step 3: Connect a new agent to a provider. YOU MUST CALL THIS before using any tool that requires an agent_id. Creates a keypair, registers the agent, and handles approval flow. Returns the agent_id you'll need for all subsequent operations (execute_capability, agent_status, sign_jwt, etc.).",
			parameters: {
				type: "object",
				properties: {
					provider: {
						type: "string",
						description: "Provider URL, issuer, or name",
					},
					capabilities: {
						type: "array",
						items: { type: "string" },
						description: "Capabilities to request",
					},
					mode: {
						type: "string",
						enum: ["delegated", "autonomous"],
						description: "Agent mode",
					},
					name: {
						type: "string",
						description: "Agent name",
					},
					reason: {
						type: "string",
						description: "Reason for requesting capabilities",
					},
				},
				required: ["provider"],
			},
			async execute(args, ctx) {
				return client.connectAgent({
					provider: args.provider as string,
					capabilities: args.capabilities as string[] | undefined,
					mode: args.mode as "delegated" | "autonomous" | undefined,
					name: args.name as string | undefined,
					reason: args.reason as string | undefined,
					signal: ctx?.signal,
				});
			},
		},

		// ── Step 4: Use the agent ──

		{
			name: "execute_capability",
			description:
				"Step 4: Execute a capability on behalf of an agent. Requires an agent_id from connect_agent. Signs a scoped JWT and sends the request to the provider.",
			parameters: {
				type: "object",
				properties: {
					agent_id: {
						type: "string",
						description: "Agent ID returned by connect_agent",
					},
					capability: {
						type: "string",
						description: "Capability to execute",
					},
					arguments: {
						type: "object",
						description:
							"Arguments for the capability, conforming to its input schema",
					},
				},
				required: ["agent_id", "capability"],
			},
			async execute(args) {
				return client.executeCapability({
					agentId: args.agent_id as string,
					capability: args.capability as string,
					arguments: args.arguments as
						| Record<string, unknown>
						| undefined,
				});
			},
		},

		{
			name: "agent_status",
			description:
				"Check the status of an agent (active, pending, expired, revoked) and its capability grants. Requires an agent_id from connect_agent.",
			parameters: {
				type: "object",
				properties: {
					agent_id: {
						type: "string",
						description: "Agent ID returned by connect_agent",
					},
				},
				required: ["agent_id"],
			},
			async execute(args) {
				return client.agentStatus(args.agent_id as string);
			},
		},

		{
			name: "sign_jwt",
			description:
				"Sign an agent JWT for manual authentication. Requires an agent_id from connect_agent. Usually not needed — execute_capability handles signing automatically.",
			parameters: {
				type: "object",
				properties: {
					agent_id: {
						type: "string",
						description: "Agent ID returned by connect_agent",
					},
					capabilities: {
						type: "array",
						items: { type: "string" },
						description: "Scope to specific capabilities",
					},
				},
				required: ["agent_id"],
			},
			async execute(args) {
				return client.signJwt({
					agentId: args.agent_id as string,
					capabilities: args.capabilities as string[] | undefined,
				});
			},
		},

		{
			name: "request_capability",
			description:
				"Request additional capabilities for an existing agent. Requires an agent_id from connect_agent.",
			parameters: {
				type: "object",
				properties: {
					agent_id: {
						type: "string",
						description: "Agent ID returned by connect_agent",
					},
					capabilities: {
						type: "array",
						items: { type: "string" },
						description: "Capabilities to request",
					},
					reason: {
						type: "string",
						description: "Reason for request",
					},
				},
				required: ["agent_id", "capabilities"],
			},
			async execute(args, ctx) {
				return client.requestCapability({
					agentId: args.agent_id as string,
					capabilities: args.capabilities as string[],
					reason: args.reason as string | undefined,
					signal: ctx?.signal,
				});
			},
		},

		{
			name: "disconnect_agent",
			description:
				"Disconnect and revoke an agent. Requires an agent_id from connect_agent.",
			parameters: {
				type: "object",
				properties: {
					agent_id: {
						type: "string",
						description: "Agent ID returned by connect_agent",
					},
				},
				required: ["agent_id"],
			},
			async execute(args) {
				await client.disconnectAgent(args.agent_id as string);
				return { ok: true, agentId: args.agent_id };
			},
		},

		{
			name: "reactivate_agent",
			description:
				"Reactivate an expired agent. Requires an agent_id from connect_agent.",
			parameters: {
				type: "object",
				properties: {
					agent_id: {
						type: "string",
						description: "Agent ID returned by connect_agent",
					},
				},
				required: ["agent_id"],
			},
			async execute(args, ctx) {
				return client.reactivateAgent(args.agent_id as string, {
					signal: ctx?.signal,
				});
			},
		},

		// ── Host management ──

		{
			name: "enroll_host",
			description:
				"Enroll a host using a one-time enrollment token. Only needed when the host was pre-registered without a public key.",
			parameters: {
				type: "object",
				properties: {
					provider: {
						type: "string",
						description: "Provider URL, issuer, or name",
					},
					enrollment_token: {
						type: "string",
						description: "One-time enrollment token",
					},
					name: {
						type: "string",
						description: "Host name",
					},
				},
				required: ["provider", "enrollment_token"],
			},
			async execute(args) {
				return client.enrollHost({
					provider: args.provider as string,
					enrollmentToken: args.enrollment_token as string,
					name: args.name as string | undefined,
				});
			},
		},

		{
			name: "rotate_agent_key",
			description:
				"Rotate an agent's keypair. Requires an agent_id from connect_agent.",
			parameters: {
				type: "object",
				properties: {
					agent_id: {
						type: "string",
						description: "Agent ID returned by connect_agent",
					},
				},
				required: ["agent_id"],
			},
			async execute(args) {
				return client.rotateAgentKey(args.agent_id as string);
			},
		},

		{
			name: "rotate_host_key",
			description:
				"Rotate the host keypair for a provider.",
			parameters: {
				type: "object",
				properties: {
					issuer: {
						type: "string",
						description: "Provider issuer URL",
					},
				},
				required: ["issuer"],
			},
			async execute(args) {
				return client.rotateHostKey(args.issuer as string);
			},
		},
	];
}

// ─── Framework Adapters ─────────────────────────────────────

export interface OpenAIToolDefinition {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: ToolParameters;
	};
}

export interface OpenAITools {
	definitions: OpenAIToolDefinition[];
	execute: (
		name: string,
		args: Record<string, unknown>,
		context?: ToolContext,
	) => Promise<unknown>;
}

/**
 * Convert agent auth tools to OpenAI function calling format.
 *
 * ```ts
 * const { definitions, execute } = toOpenAITools(tools);
 *
 * const res = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   tools: definitions,
 *   messages,
 * });
 *
 * for (const call of res.choices[0].message.tool_calls ?? []) {
 *   const result = await execute(
 *     call.function.name,
 *     JSON.parse(call.function.arguments),
 *   );
 * }
 * ```
 */
export function toOpenAITools(tools: AgentAuthTool[]): OpenAITools {
	const handlerMap = new Map<string, AgentAuthTool>();
	const definitions: OpenAIToolDefinition[] = [];

	for (const tool of tools) {
		handlerMap.set(tool.name, tool);
		definitions.push({
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			},
		});
	}

	return {
		definitions,
		async execute(name, args, context) {
			const tool = handlerMap.get(name);
			if (!tool) {
				throw new Error(`Unknown tool: ${name}`);
			}
			return tool.execute(args, context);
		},
	};
}

export interface AISDKTool {
	description: string;
	parameters: unknown;
	execute: (
		args: Record<string, unknown>,
		context?: ToolContext,
	) => Promise<unknown>;
}

/**
 * Convert agent auth tools to Vercel AI SDK format.
 *
 * Pass the `jsonSchema` function from the `ai` package to wrap
 * the JSON Schema parameters into the AI SDK's schema type.
 *
 * ```ts
 * import { generateText } from "ai";
 * import { jsonSchema } from "ai";
 *
 * const tools = toAISDKTools(agentAuthTools, { jsonSchema });
 *
 * const { text } = await generateText({
 *   model: openai("gpt-4o"),
 *   tools,
 *   prompt: "Deploy my app to vercel",
 * });
 * ```
 */
export function toAISDKTools(
	tools: AgentAuthTool[],
	opts: {
		jsonSchema: (schema: ToolParameters) => unknown;
	},
): Record<string, AISDKTool> {
	const result: Record<string, AISDKTool> = {};
	for (const tool of tools) {
		result[tool.name] = {
			description: tool.description,
			parameters: opts.jsonSchema(tool.parameters),
			execute: (args, context) => tool.execute(args, context),
		};
	}
	return result;
}
