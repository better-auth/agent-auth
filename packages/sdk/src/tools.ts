import type { AgentAuthClient } from "./client";
import type { CapabilityRequestItem } from "./types";

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
				"Step 2: List capabilities offered by a provider. Call after discovering a provider to see what it offers before connecting an agent. Some providers require authentication — if you get an 'authentication_required' error, call connect_agent first, then retry with the agent_id.",
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
					limit: {
						type: "number",
						description: "Maximum number of capabilities to return",
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
					limit: args.limit as number | undefined,
					cursor: args.cursor as string | undefined,
				});
			},
		},

		{
			name: "describe_capability",
			description:
				"Get the full definition (including input schema) for a single capability by name. Use when you need to check what arguments a capability accepts before calling execute_capability.",
			parameters: {
				type: "object",
				properties: {
					provider: {
						type: "string",
						description: "Provider URL, issuer, or name",
					},
					name: {
						type: "string",
						description: "Capability name to describe",
					},
					agent_id: {
						type: "string",
						description: "Agent ID to include grant_status context",
					},
				},
				required: ["provider", "name"],
			},
			async execute(args) {
				return client.describeCapability({
					provider: args.provider as string,
					name: args.name as string,
					agentId: args.agent_id as string | undefined,
				});
			},
		},

		// ── Step 3: Connect an agent ──

		{
			name: "connect_agent",
			description:
				"Step 3: Connect an agent to a provider. Reuses an existing identity if one is already active for this provider (requesting any missing capabilities automatically). Only creates a new agent if none exists or all are expired/revoked. Returns the agent_id you'll need for all subsequent operations.",
			parameters: {
				type: "object",
				properties: {
					provider: {
						type: "string",
						description: "Provider URL, issuer, or name",
					},
					capabilities: {
						type: "array",
						items: {
							oneOf: [
								{ type: "string" },
								{
									type: "object",
									properties: {
										name: { type: "string" },
										constraints: { type: "object", description: "Scoped constraints (§2.13), e.g. { amount: { max: 1000 } }" },
									},
									required: ["name"],
								},
							],
						},
						description: "Capabilities to request (strings or objects with constraints)",
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
					preferred_method: {
						type: "string",
						description: "Preferred approval method (e.g. device_authorization, ciba)",
					},
					login_hint: {
						type: "string",
						description: "Login hint for CIBA approval (e.g. user email)",
					},
					binding_message: {
						type: "string",
						description: "Binding message shown during approval",
					},
					force_new: {
						type: "boolean",
						description: "Skip identity reuse and always register a new agent",
					},
				},
				required: ["provider"],
			},
			async execute(args, ctx) {
				return client.connectAgent({
					provider: args.provider as string,
					capabilities: args.capabilities as CapabilityRequestItem[] | undefined,
					mode: args.mode as "delegated" | "autonomous" | undefined,
					name: args.name as string | undefined,
					reason: args.reason as string | undefined,
					preferredMethod: args.preferred_method as string | undefined,
					loginHint: args.login_hint as string | undefined,
					bindingMessage: args.binding_message as string | undefined,
					forceNew: args.force_new as boolean | undefined,
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
						items: {
							oneOf: [
								{ type: "string" },
								{
									type: "object",
									properties: {
										name: { type: "string" },
										constraints: { type: "object", description: "Scoped constraints (§2.13)" },
									},
									required: ["name"],
								},
							],
						},
						description: "Capabilities to request (strings or objects with constraints)",
					},
					reason: {
						type: "string",
						description: "Reason for request",
					},
					preferred_method: {
						type: "string",
						description: "Preferred approval method",
					},
					login_hint: {
						type: "string",
						description: "Login hint for CIBA approval",
					},
					binding_message: {
						type: "string",
						description: "Binding message shown during approval",
					},
				},
				required: ["agent_id", "capabilities"],
			},
			async execute(args, ctx) {
				return client.requestCapability({
					agentId: args.agent_id as string,
					capabilities: args.capabilities as CapabilityRequestItem[],
					reason: args.reason as string | undefined,
					preferredMethod: args.preferred_method as string | undefined,
					loginHint: args.login_hint as string | undefined,
					bindingMessage: args.binding_message as string | undefined,
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

// ─── Tool Filtering ─────────────────────────────────────────

export type FilterToolsOptions =
	| { only: string[]; exclude?: never }
	| { only?: never; exclude: string[] };

/**
 * Filter tools to a subset by name.
 *
 * ```ts
 * filterTools(tools, { only: ["execute_capability", "agent_status"] });
 * filterTools(tools, { exclude: ["sign_jwt", "rotate_host_key"] });
 * ```
 */
export function filterTools(
	tools: AgentAuthTool[],
	opts: FilterToolsOptions,
): AgentAuthTool[] {
	const knownNames = new Set(tools.map((t) => t.name));

	if (opts.only) {
		const nameSet = new Set(opts.only);
		for (const name of nameSet) {
			if (!knownNames.has(name)) {
				console.warn(`filterTools: unknown tool name "${name}" in "only" list`);
			}
		}
		return tools.filter((t) => nameSet.has(t.name));
	}
	if (opts.exclude) {
		const nameSet = new Set(opts.exclude);
		for (const name of nameSet) {
			if (!knownNames.has(name)) {
				console.warn(`filterTools: unknown tool name "${name}" in "exclude" list`);
			}
		}
		return tools.filter((t) => !nameSet.has(t.name));
	}
	return tools;
}

// ─── Safe execution wrapper ─────────────────────────────────

export interface ToolErrorResult {
	error: string;
	code?: string;
}

async function safeExecute(
	tool: AgentAuthTool,
	args: Record<string, unknown>,
	context?: ToolContext,
): Promise<unknown> {
	try {
		return await tool.execute(args, context);
	} catch (err: unknown) {
		if (
			err &&
			typeof err === "object" &&
			"code" in err &&
			"message" in err
		) {
			const e = err as { code: string; message: string };
			return { error: e.message, code: e.code } satisfies ToolErrorResult;
		}
		const message =
			err instanceof Error ? err.message : "Unknown error";
		return { error: message } satisfies ToolErrorResult;
	}
}

// ─── Framework Adapters ─────────────────────────────────────

export interface OpenAIToolDefinition {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: ToolParameters;
		strict?: boolean;
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

export interface OpenAIToolsOptions {
	/**
	 * Enable OpenAI strict mode (structured outputs).
	 * Adds `strict: true` and `additionalProperties: false`
	 * to each function definition, preventing the model from
	 * hallucinating arguments.
	 */
	strict?: boolean;
}

/**
 * Convert agent auth tools to OpenAI function calling format.
 *
 * ```ts
 * const { definitions, execute } = toOpenAITools(tools, { strict: true });
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
function addAdditionalPropertiesFalse(schema: ToolParameters): ToolParameters {
	const props: ToolParameters["properties"] = {};
	for (const [key, prop] of Object.entries(schema.properties)) {
		if (prop.type === "object" && prop.properties && typeof prop.properties === "object") {
			const nested = addAdditionalPropertiesFalse({
				type: "object",
				properties: prop.properties as ToolParameters["properties"],
			});
			props[key] = { ...prop, properties: nested.properties, additionalProperties: false };
		} else {
			props[key] = prop;
		}
	}
	return { ...schema, properties: props, additionalProperties: false } as ToolParameters;
}

export function toOpenAITools(
	tools: AgentAuthTool[],
	opts?: OpenAIToolsOptions,
): OpenAITools {
	const handlerMap = new Map<string, AgentAuthTool>();
	const definitions: OpenAIToolDefinition[] = [];
	const strict = opts?.strict ?? false;

	for (const tool of tools) {
		handlerMap.set(tool.name, tool);
		const params = strict
			? addAdditionalPropertiesFalse(tool.parameters)
			: tool.parameters;

		definitions.push({
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: params,
				...(strict ? { strict: true } : {}),
			},
		});
	}

	return {
		definitions,
		async execute(name, args, context) {
			const tool = handlerMap.get(name);
			if (!tool) {
				return { error: `Unknown tool: ${name}`, code: "unknown_tool" } satisfies ToolErrorResult;
			}
			return safeExecute(tool, args, context);
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

export interface AISDKToolsOptions {
	/**
	 * The `jsonSchema` function from the `ai` package.
	 * Wraps raw JSON Schema into the AI SDK's schema type.
	 *
	 * If omitted, the adapter will attempt to auto-import
	 * `jsonSchema` from `"ai"`. Pass it explicitly to avoid
	 * the dynamic import or if using a non-standard bundle.
	 */
	jsonSchema?: (schema: ToolParameters) => unknown;
}

/**
 * Convert agent auth tools to Vercel AI SDK format.
 *
 * The adapter auto-imports `jsonSchema` from `"ai"` if not provided.
 * Pass it explicitly if you want to avoid the dynamic import:
 *
 * ```ts
 * import { generateText, jsonSchema } from "ai";
 * import { AgentAuthClient, getAgentAuthTools, toAISDKTools } from "@auth/agent";
 *
 * const client = new AgentAuthClient();
 * const tools = await toAISDKTools(getAgentAuthTools(client));
 *
 * const { text } = await generateText({
 *   model: openai("gpt-4o"),
 *   tools,
 *   prompt: "Deploy my app to vercel",
 * });
 * ```
 */
export async function toAISDKTools(
	tools: AgentAuthTool[],
	opts?: AISDKToolsOptions,
): Promise<Record<string, AISDKTool>> {
	let wrapSchema = opts?.jsonSchema;
	if (!wrapSchema) {
		try {
			const mod = "ai";
			const ai = await (import(/* webpackIgnore: true */ mod) as Promise<{ jsonSchema: (s: ToolParameters) => unknown }>);
			wrapSchema = ai.jsonSchema;
		} catch {
			throw new Error(
				'toAISDKTools: could not import "ai" package. ' +
					"Install it (`npm i ai`) or pass { jsonSchema } explicitly.",
			);
		}
	}

	const wrap = wrapSchema;
	const result: Record<string, AISDKTool> = {};
	for (const tool of tools) {
		result[tool.name] = {
			description: tool.description,
			parameters: wrap(tool.parameters),
			execute: (args, context) => safeExecute(tool, args, context),
		};
	}
	return result;
}

// ─── Anthropic Adapter ──────────────────────────────────────

export interface AnthropicToolDefinition {
	name: string;
	description: string;
	input_schema: ToolParameters;
}

export interface AnthropicToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
	type: "tool_result";
	tool_use_id: string;
	content: string;
}

export interface AnthropicTools {
	definitions: AnthropicToolDefinition[];
	/**
	 * Process `tool_use` blocks from an assistant response.
	 * Executes each tool call and returns `tool_result` blocks
	 * ready to append to the next user message.
	 *
	 * ```ts
	 * const response = await anthropic.messages.create({
	 *   model: "claude-sonnet-4-20250514",
	 *   tools: definitions,
	 *   messages,
	 * });
	 *
	 * const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
	 * const results = await processToolUse(toolUseBlocks);
	 * messages.push(
	 *   { role: "assistant", content: response.content },
	 *   { role: "user", content: results },
	 * );
	 * ```
	 */
	processToolUse: (
		blocks: AnthropicToolUseBlock[],
		context?: ToolContext,
	) => Promise<AnthropicToolResultBlock[]>;
}

/**
 * Convert agent auth tools to Anthropic Claude format.
 *
 * ```ts
 * const { definitions, processToolUse } = toAnthropicTools(tools);
 *
 * const res = await anthropic.messages.create({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   tools: definitions,
 *   messages: [{ role: "user", content: "List my Vercel domains" }],
 * });
 * ```
 */
export function toAnthropicTools(tools: AgentAuthTool[]): AnthropicTools {
	const handlerMap = new Map<string, AgentAuthTool>();
	const definitions: AnthropicToolDefinition[] = [];

	for (const tool of tools) {
		handlerMap.set(tool.name, tool);
		definitions.push({
			name: tool.name,
			description: tool.description,
			input_schema: tool.parameters,
		});
	}

	return {
		definitions,
		async processToolUse(blocks, context) {
			return Promise.all(
				blocks.map(async (block) => {
					const tool = handlerMap.get(block.name);
					const result = tool
						? await safeExecute(tool, block.input, context)
						: { error: `Unknown tool: ${block.name}`, code: "unknown_tool" };
					return {
						type: "tool_result" as const,
						tool_use_id: block.id,
						content: JSON.stringify(result),
					};
				}),
			);
		},
	};
}
