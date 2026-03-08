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

	server.registerTool(
		"discover_provider",
		{
			description: "Discover a provider's Agent Auth configuration from a service URL. Returns the full discovery document including endpoints, capabilities, and modes.",
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
			description: "Search the registry for providers matching an intent. Requires a registry URL to be configured.",
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
			description: "List all providers that have been discovered or pre-configured.",
		},
		async () => {
			const results = await client.listProviders();
			return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
		},
	);

	server.registerTool(
		"list_capabilities",
		{
			description: "List capabilities offered by a provider. Optionally filter by intent or scope to an agent to see grant status.",
			inputSchema: {
				provider: z.string().describe("Provider URL, issuer, or name"),
				intent: z.string().optional().describe("Filter by intent keyword"),
				agent_id: z.string().optional().describe("Agent ID to see grant status"),
				cursor: z.string().optional().describe("Pagination cursor"),
			},
		},
		async ({ provider, intent, agent_id, cursor }) => {
			const result = await client.listCapabilities({
				provider,
				intent,
				agentId: agent_id,
				cursor,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"connect_agent",
		{
			description: "Connect a new agent to a provider. Creates a keypair, registers the agent, and handles approval flow if needed. Returns agent ID, host ID, status, and granted capabilities.",
			inputSchema: {
				provider: z.string().describe("Provider URL, issuer, or name"),
				capability_ids: z.array(z.string()).optional().describe("Capability IDs to request"),
				mode: z.enum(["delegated", "autonomous"]).optional().describe("Agent mode"),
				name: z.string().optional().describe("Agent name"),
				reason: z.string().optional().describe("Reason for requesting capabilities"),
			},
		},
		async ({ provider, capability_ids, mode, name, reason }) => {
			const result = await client.connectAgent({
				provider,
				capabilityIds: capability_ids,
				mode,
				name,
				reason,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"agent_status",
		{
			description: "Check the current status of an agent (active, pending, expired, revoked, etc.) and its capability grants.",
			inputSchema: { agent_id: z.string().describe("Agent ID") },
		},
		async ({ agent_id }) => {
			const result = await client.agentStatus(agent_id);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"sign_jwt",
		{
			description: "Sign an agent JWT for authenticating capability execution. Returns a short-lived token.",
			inputSchema: {
				agent_id: z.string().describe("Agent ID"),
				capability_ids: z.array(z.string()).optional().describe("Scope to specific capability IDs"),
			},
		},
		async ({ agent_id, capability_ids }) => {
			const result = await client.signJwt({
				agentId: agent_id,
				capabilityIds: capability_ids,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"request_capability",
		{
			description: "Request additional capabilities for an existing agent. Returns which capabilities were granted, are pending, or were denied.",
			inputSchema: {
				agent_id: z.string().describe("Agent ID"),
				capability_ids: z.array(z.string()).describe("Capability IDs to request"),
				reason: z.string().optional().describe("Reason for request"),
			},
		},
		async ({ agent_id, capability_ids, reason }) => {
			const result = await client.requestCapability({
				agentId: agent_id,
				capabilityIds: capability_ids,
				reason,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"disconnect_agent",
		{
			description: "Disconnect (revoke) an agent. Removes it from the server and deletes the local connection.",
			inputSchema: { agent_id: z.string().describe("Agent ID") },
		},
		async ({ agent_id }) => {
			await client.disconnectAgent(agent_id);
			return { content: [{ type: "text", text: JSON.stringify({ ok: true, agentId: agent_id }) }] };
		},
	);

	server.registerTool(
		"reactivate_agent",
		{
			description: "Reactivate an expired agent.",
			inputSchema: { agent_id: z.string().describe("Agent ID") },
		},
		async ({ agent_id }) => {
			const result = await client.reactivateAgent(agent_id);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"execute_capability",
		{
			description: "Execute a capability on behalf of an agent. Signs a scoped JWT and sends the capability ID and arguments to the server's execute endpoint. The server validates the JWT, checks grants, executes the capability, and returns the result.",
			inputSchema: {
				agent_id: z.string().describe("Agent ID"),
				capability_id: z.string().describe("Capability ID to execute"),
				arguments: z.record(z.string(), z.unknown()).optional().describe("Arguments for the capability, conforming to its input schema"),
			},
		},
		async ({ agent_id, capability_id, arguments: args }) => {
			const result = await client.executeCapability({
				agentId: agent_id,
				capabilityId: capability_id,
				arguments: args,
			});
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	server.registerTool(
		"list_connections",
		{
			description: "List all locally stored agent connections for a provider.",
			inputSchema: { issuer: z.string().describe("Provider issuer URL") },
		},
		async ({ issuer }) => {
			const conns = await client.listConnections(issuer);
			const sanitized = conns.map((c) => ({
				agentId: c.agentId,
				hostId: c.hostId,
				providerName: c.providerName,
				issuer: c.issuer,
				mode: c.mode,
				capabilityGrants: c.capabilityGrants,
				createdAt: c.createdAt,
			}));
			return { content: [{ type: "text", text: JSON.stringify(sanitized, null, 2) }] };
		},
	);

	server.registerTool(
		"get_connection",
		{
			description: "Get details of a locally stored agent connection.",
			inputSchema: { agent_id: z.string().describe("Agent ID") },
		},
		async ({ agent_id }) => {
			const conn = await client.getConnection(agent_id);
			if (!conn) {
				return { content: [{ type: "text", text: `No connection found for agent ${agent_id}` }], isError: true };
			}
			return {
				content: [{
					type: "text",
					text: JSON.stringify({
						agentId: conn.agentId,
						hostId: conn.hostId,
						providerName: conn.providerName,
						issuer: conn.issuer,
						mode: conn.mode,
						capabilityGrants: conn.capabilityGrants,
						createdAt: conn.createdAt,
					}, null, 2),
				}],
			};
		},
	);

	server.registerTool(
		"rotate_agent_key",
		{
			description: "Rotate an agent's keypair. Generates a new key and registers it with the server.",
			inputSchema: { agent_id: z.string().describe("Agent ID") },
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

	server.registerTool(
		"enroll_host",
		{
			description: "Enroll a host using a one-time enrollment token. Used when the host was pre-registered without a public key.",
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
		"connect_account",
		{
			description: "Initiate account linking for an autonomous agent. Creates a CIBA-style request for user approval.",
			inputSchema: { agent_id: z.string().describe("Agent ID") },
		},
		async ({ agent_id }) => {
			const result = await client.connectAccount(agent_id);
			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);

	const transport = new StdioServerTransport();
	await server.connect(transport);
}
