import { Command } from "commander";
import { createClient, getClientConfig } from "./client.js";

function json(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

async function run(fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`Error: ${msg}`);
		process.exit(1);
	}
}

export function buildCli(): Command {
	const program = new Command();

	program
		.name("agent-auth")
		.description("CLI for the Agent Auth Protocol")
		.version("0.1.0")
		.option("--storage-dir <path>", "storage directory", process.env.AGENT_AUTH_STORAGE_DIR)
		.option("--registry-url <url>", "registry URL", process.env.AGENT_AUTH_REGISTRY_URL)
		.option("--host-name <name>", "host name", process.env.AGENT_AUTH_HOST_NAME)
		.option("--no-browser", "don't auto-open the browser for approval URLs");

	function client() {
		const opts = program.opts();
		return createClient({
			...getClientConfig(),
			storageDir: opts.storageDir,
			registryUrl: opts.registryUrl,
			hostName: opts.hostName,
			noBrowser: !opts.browser,
		});
	}

	program
		.command("discover <url>")
		.description("Discover a provider from a service URL")
		.action((url: string) =>
			run(async () => {
				const result = await client().discoverProvider(url);
				json(result);
			}),
		);

	program
		.command("search <intent>")
		.description("Search the registry for providers by intent")
		.action((intent: string) =>
			run(async () => {
				const results = await client().searchProviders(intent);
				json(results);
			}),
		);

	program
		.command("providers")
		.description("List known providers")
		.action(() =>
			run(async () => {
				const results = await client().listProviders();
				json(results);
			}),
		);

	program
		.command("capabilities")
		.description("List capabilities for a provider")
		.requiredOption("--provider <url>", "provider URL or name")
		.option("--query <query>", "search query to filter by name or description")
		.option("--agent-id <id>", "scope to agent (includes grant status)")
		.option("--cursor <cursor>", "pagination cursor")
		.action((opts) =>
			run(async () => {
				const result = await client().listCapabilities({
					provider: opts.provider,
					query: opts.query,
					agentId: opts.agentId,
					cursor: opts.cursor,
				});
				json(result);
			}),
		);

	program
		.command("connect")
		.description("Connect an agent to a provider")
		.requiredOption("--provider <url>", "provider URL or name")
		.option("--capabilities <ids...>", "capability IDs to request")
		.option("--mode <mode>", "agent mode (delegated|autonomous)", "delegated")
		.option("--name <name>", "agent name")
		.option("--reason <reason>", "reason for requesting capabilities")
		.action((opts) =>
			run(async () => {
				const result = await client().connectAgent({
					provider: opts.provider,
					capabilities: opts.capabilities,
					mode: opts.mode,
					name: opts.name,
					reason: opts.reason,
				});
				json(result);
			}),
		);

	program
		.command("status <agent-id>")
		.description("Check agent status")
		.action((agentId: string) =>
			run(async () => {
				const result = await client().agentStatus(agentId);
				json(result);
			}),
		);

	program
		.command("sign <agent-id>")
		.description("Sign an agent JWT")
		.option("--capabilities <ids...>", "scope to specific capability IDs")
		.action((agentId: string, opts) =>
			run(async () => {
				const result = await client().signJwt({
					agentId,
					capabilities: opts.capabilities,
				});
				json(result);
			}),
		);

	program
		.command("request <agent-id>")
		.description("Request additional capabilities for an agent")
		.requiredOption("--capabilities <ids...>", "capability IDs to request")
		.option("--reason <reason>", "reason for request")
		.action((agentId: string, opts) =>
			run(async () => {
				const result = await client().requestCapability({
					agentId,
					capabilities: opts.capabilities,
					reason: opts.reason,
				});
				json(result);
			}),
		);

	program
		.command("disconnect <agent-id>")
		.description("Disconnect (revoke) an agent")
		.action((agentId: string) =>
			run(async () => {
				await client().disconnectAgent(agentId);
				json({ ok: true, agentId });
			}),
		);

	program
		.command("reactivate <agent-id>")
		.description("Reactivate an expired agent")
		.action((agentId: string) =>
			run(async () => {
				const result = await client().reactivateAgent(agentId);
				json(result);
			}),
		);

	program
		.command("execute <agent-id> <capability-id>")
		.description("Execute a capability through the server's execute endpoint")
		.option("--args <json>", "arguments as JSON string")
		.action((agentId: string, capability: string, opts) =>
			run(async () => {
				const args = opts.args ? JSON.parse(opts.args) : undefined;
				const result = await client().executeCapability({
					agentId,
					capability,
					arguments: args,
				});
				json(result);
			}),
		);

	program
		.command("connections <issuer>")
		.description("List agent connections for a provider")
		.action((issuer: string) =>
			run(async () => {
				const conns = await client().listConnections(issuer);
				json(
					conns.map((c) => ({
						agentId: c.agentId,
						hostId: c.hostId,
						providerName: c.providerName,
						issuer: c.issuer,
						mode: c.mode,
						capabilityGrants: c.capabilityGrants,
						createdAt: c.createdAt,
					})),
				);
			}),
		);

	program
		.command("connection <agent-id>")
		.description("Get a stored agent connection")
		.action((agentId: string) =>
			run(async () => {
				const conn = await client().getConnection(agentId);
				if (!conn) {
					console.error(`No connection found for agent ${agentId}`);
					process.exit(1);
				}
				json({
					agentId: conn.agentId,
					hostId: conn.hostId,
					providerName: conn.providerName,
					issuer: conn.issuer,
					mode: conn.mode,
					capabilityGrants: conn.capabilityGrants,
					createdAt: conn.createdAt,
				});
			}),
		);

	program
		.command("rotate-agent-key <agent-id>")
		.description("Rotate an agent's keypair")
		.action((agentId: string) =>
			run(async () => {
				const result = await client().rotateAgentKey(agentId);
				json(result);
			}),
		);

	program
		.command("rotate-host-key <issuer>")
		.description("Rotate the host keypair for a provider")
		.action((issuer: string) =>
			run(async () => {
				const result = await client().rotateHostKey(issuer);
				json(result);
			}),
		);

	program
		.command("enroll-host")
		.description("Enroll a host using a one-time enrollment token")
		.requiredOption("--provider <url>", "provider URL or name")
		.requiredOption("--token <token>", "enrollment token")
		.option("--name <name>", "host name")
		.action((opts) =>
			run(async () => {
				const result = await client().enrollHost({
					provider: opts.provider,
					enrollmentToken: opts.token,
					name: opts.name,
				});
				json(result);
			}),
		);

	program
		.command("connect-account <agent-id>")
		.description("Initiate account linking for an autonomous agent")
		.action((agentId: string) =>
			run(async () => {
				const result = await client().connectAccount(agentId);
				json(result);
			}),
		);

	return program;
}
