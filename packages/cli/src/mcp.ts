import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient, type ClientConfig } from "./client.js";

export async function startMcpServer(config: ClientConfig): Promise<void> {
	const client = createClient(config);

	const server = new McpServer({
		name: "agent-auth",
		version: "0.1.0",
	});

	// ── Step 1: Find a provider ──

	server.registerTool(
		"discover_provider",
		{
			description: "Step 1a: Discover a provider's Agent Auth configuration from a service URL. Call this first when you know the provider's URL. Returns endpoints, capabilities, and modes.",
			inputSchema: { url: z.string().describe("Service URL to discover (e.g. https://api.example.com)") },
		},
		async ({ url }) => {
			const result = await client.discoverProvider(url);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"search_providers",
		{
			description: "Step 1b: Search the registry for providers matching an intent. Use when you don't have a specific provider URL.",
			inputSchema: { intent: z.string().describe("What you want to do (e.g. 'deploy web apps', 'send emails')") },
		},
		async ({ intent }) => {
			const results = await client.searchProviders(intent);
			return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
		},
	);

	server.registerTool(
		"list_providers",
		{
			description: "Step 1c: List providers that have already been discovered or pre-configured. Use to see what's available before connecting.",
		},
		async () => {
			const results = await client.listProviders();
			return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
		},
	);

	// ── Step 2: Browse capabilities ──

	server.registerTool(
		"list_capabilities",
		{
			description: "Step 2: List capabilities offered by a provider. Call after discovering a provider to see what it offers before connecting an agent.",
		inputSchema: {
			provider: z.string().describe("Provider URL, issuer, or name"),
			query: z.string().optional().describe("Search query to filter capabilities by name or description"),
			agent_id: z.string().optional().describe("Agent ID to see grant status (only after connect_agent)"),
			cursor: z.string().optional().describe("Pagination cursor"),
		},
	},
	async ({ provider, query, agent_id, cursor }) => {
		const result = await client.listCapabilities({
			provider,
			query,
			agentId: agent_id,
			cursor,
		});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	// ── Step 3: Connect an agent ──

	server.registerTool(
		"connect_agent",
		{
			description: "Step 3: Connect a new agent to a provider. YOU MUST CALL THIS before using any tool that requires an agent_id. Creates a keypair, registers the agent, and handles approval flow. Returns the agent_id you'll need for all subsequent operations (execute_capability, agent_status, sign_jwt, etc.).",
			inputSchema: {
				provider: z.string().describe("Provider URL, issuer, or name"),
				capabilities: z.array(z.string()).optional().describe("Capabilities to request"),
				mode: z.enum(["delegated", "autonomous"]).optional().describe("Agent mode"),
				name: z.string().optional().describe("Agent name"),
				reason: z.string().optional().describe("Reason for requesting capabilities"),
			},
		},
		async ({ provider, capabilities, mode, name, reason }, extra) => {
			const result = await client.connectAgent({
				provider,
				capabilities,
				mode,
				name,
				reason,
				signal: extra.signal,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	// ── Step 4: Use the agent (all require agent_id from connect_agent) ──

	server.registerTool(
		"execute_capability",
		{
			description: "Step 4: Execute a capability on behalf of an agent. Requires an agent_id from connect_agent. Signs a scoped JWT and sends the request to the provider.",
			inputSchema: {
				agent_id: z.string().describe("Agent ID returned by connect_agent"),
				capability: z.string().describe("Capability to execute"),
				arguments: z.record(z.string(), z.unknown()).optional().describe("Arguments for the capability, conforming to its input schema"),
			},
		},
		async ({ agent_id, capability, arguments: args }) => {
			const result = await client.executeCapability({
				agentId: agent_id,
				capability,
				arguments: args,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"agent_status",
		{
			description: "Check the status of an agent (active, pending, expired, revoked) and its capability grants. Requires an agent_id from connect_agent.",
			inputSchema: { agent_id: z.string().describe("Agent ID returned by connect_agent") },
		},
		async ({ agent_id }) => {
			const result = await client.agentStatus(agent_id);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"sign_jwt",
		{
			description: "Sign an agent JWT for manual authentication. Requires an agent_id from connect_agent. Usually not needed — execute_capability handles signing automatically.",
			inputSchema: {
				agent_id: z.string().describe("Agent ID returned by connect_agent"),
				capabilities: z.array(z.string()).optional().describe("Scope to specific capabilities"),
			},
		},
		async ({ agent_id, capabilities }) => {
			const result = await client.signJwt({
				agentId: agent_id,
				capabilities,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"request_capability",
		{
			description: "Request additional capabilities for an existing agent. Requires an agent_id from connect_agent.",
			inputSchema: {
				agent_id: z.string().describe("Agent ID returned by connect_agent"),
				capabilities: z.array(z.string()).describe("Capabilities to request"),
				reason: z.string().optional().describe("Reason for request"),
			},
		},
		async ({ agent_id, capabilities, reason }, extra) => {
			const result = await client.requestCapability({
				agentId: agent_id,
				capabilities,
				reason,
				signal: extra.signal,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"disconnect_agent",
		{
			description: "Disconnect and revoke an agent. Requires an agent_id from connect_agent.",
			inputSchema: { agent_id: z.string().describe("Agent ID returned by connect_agent") },
		},
		async ({ agent_id }) => {
			await client.disconnectAgent(agent_id);
			return { content: [{ type: "text", text: JSON.stringify({ ok: true, agentId: agent_id }) }] };
		},
	);

	server.registerTool(
		"reactivate_agent",
		{
			description: "Reactivate an expired agent. Requires an agent_id from connect_agent.",
			inputSchema: { agent_id: z.string().describe("Agent ID returned by connect_agent") },
		},
		async ({ agent_id }, extra) => {
			const result = await client.reactivateAgent(agent_id, { signal: extra.signal });
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"connect_account",
		{
			description: "Initiate account linking for an autonomous agent. Requires an agent_id from connect_agent.",
			inputSchema: { agent_id: z.string().describe("Agent ID returned by connect_agent") },
		},
		async ({ agent_id }) => {
			const result = await client.connectAccount(agent_id);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	// ── Host management ──

	server.registerTool(
		"enroll_host",
		{
			description: "Enroll a host using a one-time enrollment token. Only needed when the host was pre-registered without a public key.",
			inputSchema: {
				provider: z.string().describe("Provider URL, issuer, or name"),
				enrollment_token: z.string().describe("One-time enrollment token"),
				name: z.string().optional().describe("Host name"),
			},
		},
		async ({ provider, enrollment_token, name }) => {
			const result = await client.enrollHost({
				provider,
				enrollmentToken: enrollment_token,
				name,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"rotate_agent_key",
		{
			description: "Rotate an agent's keypair. Requires an agent_id from connect_agent.",
			inputSchema: { agent_id: z.string().describe("Agent ID returned by connect_agent") },
		},
		async ({ agent_id }) => {
			const result = await client.rotateAgentKey(agent_id);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"rotate_host_key",
		{
			description: "Rotate the host keypair for a provider.",
			inputSchema: { issuer: z.string().describe("Provider issuer URL") },
		},
		async ({ issuer }) => {
			const result = await client.rotateHostKey(issuer);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	const transport = new StdioServerTransport();
	await server.connect(transport);

	const cleanup = () => {
		client.destroy();
	};
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
	process.on("SIGHUP", cleanup);
	server.server.onclose = cleanup;
}
