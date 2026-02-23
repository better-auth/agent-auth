import { exec } from "node:child_process";
import { platform } from "node:os";
import chalk from "chalk";
import { Command } from "commander";

const resolveAppUrl = () =>
	(process.env.BETTER_AUTH_URL || process.env.BASE_URL || "").replace(
		/\/+$/,
		"",
	);

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

function openUrl(url: string): void {
	const cmd =
		platform() === "darwin"
			? "open"
			: platform() === "win32"
				? "start"
				: "xdg-open";
	exec(`${cmd} "${url}"`);
}

async function getStorage() {
	const { createFileStorage } = await import(
		"better-auth/plugins/agent-auth/mcp-storage-fs"
	);
	return createFileStorage({
		encryptionKey: process.env.BETTER_AUTH_ENCRYPTION_KEY || undefined,
	});
}

async function requireConnection(agentId: string) {
	const storage = await getStorage();
	const connection = await storage.getConnection(agentId);
	if (!connection) {
		console.error(
			chalk.red(
				`No connection found for agent ${agentId}. Run 'better-auth ai connect' first.`,
			),
		);
		process.exit(1);
	}
	const { createAgentClient } = await import(
		"better-auth/plugins/agent-auth/agent-client"
	);
	return {
		client: createAgentClient({
			baseURL: connection.appUrl,
			agentId,
			privateKey: connection.keypair.privateKey,
		}),
		connection,
		storage,
	};
}

// ── connect ─────────────────────────────────────────────────────────────

async function connectAction(
	url: string | undefined,
	options: { name?: string; scopes?: string; agentId?: string },
) {
	const appUrl = (url || resolveAppUrl()).replace(/\/+$/, "");
	if (!appUrl) {
		console.error(
			chalk.red(
				"App URL is required. Pass it as an argument or set BETTER_AUTH_URL.",
			),
		);
		process.exit(1);
	}

	const name = options.name ?? "CLI Agent";
	const scopes = options.scopes
		? options.scopes.split(",").map((s) => s.trim())
		: [];

	const storage = await getStorage();

	if (options.agentId) {
		const existing = await storage.getConnection(options.agentId);
		if (existing) {
			console.log(
				JSON.stringify(
					{
						agentId: options.agentId,
						name: existing.name,
						scopes: existing.scopes,
						appUrl: existing.appUrl,
						status: "reused",
					},
					null,
					2,
				),
			);
			return;
		}
	}

	const { connectAgent } = await import(
		"better-auth/plugins/agent-auth/agent-client"
	);

	console.error(chalk.blue(`Connecting to ${appUrl}...`));

	try {
		const result = await connectAgent({
			appURL: appUrl,
			name,
			scopes,
			openBrowser: true,
			onUserCode: ({ userCode, verificationUri, verificationUriComplete }) => {
				console.error(chalk.bold("Approve the connection in your browser:"));
				console.error(chalk.cyan(`  ${verificationUriComplete}`));
				console.error(
					chalk.gray(
						`Or go to ${verificationUri} and enter: ${chalk.bold.white(userCode)}`,
					),
				);
				console.error(chalk.gray("Waiting for approval..."));
			},
			onPoll: (attempt) => {
				if (attempt % 6 === 0) {
					console.error(chalk.gray(`  Still waiting... (${attempt * 5}s)`));
				}
			},
		});

		await storage.saveConnection(result.agentId, {
			appUrl,
			keypair: {
				publicKey: result.publicKey,
				privateKey: result.privateKey,
				kid: result.kid,
			},
			name: result.name,
			scopes: result.scopes,
		});

		console.error(chalk.green("Connected!"));
		console.log(
			JSON.stringify(
				{
					agentId: result.agentId,
					name: result.name,
					scopes: result.scopes,
					appUrl,
				},
				null,
				2,
			),
		);
	} catch (err) {
		console.error(
			chalk.red(`Failed: ${err instanceof Error ? err.message : String(err)}`),
		);
		process.exit(1);
	}
}

// ── disconnect ──────────────────────────────────────────────────────────

async function disconnectAction(agentId: string) {
	const { client, storage } = await requireConnection(agentId);

	try {
		await client.fetch("/api/auth/agent/revoke", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ agentId }),
		});
	} catch {
		// best-effort server-side revocation
	}

	await storage.removeConnection(agentId);
	console.log(`Disconnected agent ${agentId}.`);
}

// ── list-tools ──────────────────────────────────────────────────────────

async function listToolsAction(agentId: string) {
	const { client } = await requireConnection(agentId);

	const res = await client.fetch("/api/agent/gateway/tools");
	if (!res.ok) {
		const text = await res.text();
		console.error(
			chalk.red(`Failed to fetch tools: ${res.status} ${text.slice(0, 500)}`),
		);
		process.exit(1);
	}

	const data = (await res.json()) as {
		providers: Array<{
			name: string;
			tools: Array<{ name: string; description: string }>;
		}>;
	};

	if (data.providers.length === 0) {
		console.log(
			"No providers connected. Connect an account on the web app first.",
		);
		return;
	}

	const lines: string[] = ["Available gateway tools:", ""];
	for (const provider of data.providers) {
		lines.push(`## ${provider.name} (${provider.tools.length} tools)`);
		for (const t of provider.tools) {
			lines.push(`  - ${t.name}: ${t.description}`);
		}
		lines.push("");
	}

	console.log(lines.join("\n"));
}

// ── call-tool ───────────────────────────────────────────────────────────

async function callToolAction(
	agentId: string,
	options: { tool: string; args?: string },
) {
	if (!options.tool) {
		console.error(chalk.red("--tool is required"));
		process.exit(1);
	}

	const { client } = await requireConnection(agentId);

	let toolArgs: Record<string, unknown> = {};
	if (options.args) {
		try {
			toolArgs = JSON.parse(options.args);
		} catch {
			console.error(chalk.red(`Invalid JSON in --args: ${options.args}`));
			process.exit(1);
		}
	}

	const res = await client.fetch("/api/agent/gateway/call", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ tool: options.tool, args: toolArgs }),
	});

	if (!res.ok) {
		const text = await res.text();
		let errorMsg: string;
		try {
			const errJson = JSON.parse(text);
			errorMsg = errJson.error ?? text;
		} catch {
			errorMsg = text;
		}
		console.error(chalk.red(`Tool call failed (${res.status}): ${errorMsg}`));
		process.exit(1);
	}

	const result = (await res.json()) as {
		content: Array<{ type: string; text: string }>;
		isError?: boolean;
	};

	const text = (result.content ?? [])
		.map((c) => c.text ?? JSON.stringify(c))
		.join("\n");
	console.log(text);
}

// ── add-scopes ──────────────────────────────────────────────────────────

async function addScopesAction(
	agentId: string,
	options: { scopes: string; name?: string },
) {
	if (!options.scopes) {
		console.error(chalk.red("--scopes is required"));
		process.exit(1);
	}

	const newScopes = options.scopes.split(",").map((s) => s.trim());
	const { client, connection, storage } = await requireConnection(agentId);

	const body: Record<string, unknown> = { scopes: newScopes };
	if (options.name) body.name = options.name;

	const res = await client.fetch("/api/auth/agent/request-scope", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		console.error(
			chalk.red(`Failed to add scopes: ${res.status} ${text.slice(0, 500)}`),
		);
		process.exit(1);
	}

	const data = (await res.json()) as {
		requestId?: string;
		status: string;
		verificationUrl?: string;
		message?: string;
		scopes?: string[];
		added?: string[];
	};

	if (data.status === "approved" && data.scopes) {
		await storage.saveConnection(agentId, {
			...connection,
			scopes: data.scopes,
		});
		console.log(
			`All requested scopes were already present. Current scopes: ${data.scopes.join(", ")}.`,
		);
		return;
	}

	if (!data.requestId || !data.verificationUrl) {
		console.error(chalk.red("Unexpected response from server"));
		process.exit(1);
	}

	console.error(
		`Scope escalation requires approval. Opening browser...\nApprove at: ${data.verificationUrl}`,
	);
	openUrl(data.verificationUrl);

	const POLL_INTERVAL = 2000;
	const MAX_WAIT = 5 * 60 * 1000;
	const start = Date.now();

	while (Date.now() - start < MAX_WAIT) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL));

		const pollRes = await globalThis.fetch(
			`${connection.appUrl}/api/auth/agent/scope-request-status?requestId=${data.requestId}`,
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
			const updated = { ...connection };
			if (scopes.length > 0) updated.scopes = scopes;
			if (options.name) updated.name = options.name;
			await storage.saveConnection(agentId, updated);

			const addedMsg = added.length > 0 ? `Added: ${added.join(", ")}.` : "";
			const nameMsg = options.name
				? ` Agent renamed to "${options.name}".`
				: "";
			console.log(
				`Scopes approved. ${addedMsg}${nameMsg}${scopes.length > 0 ? ` Current scopes: ${scopes.join(", ")}.` : ""}`,
			);
			return;
		}

		if (poll.status === "denied") {
			console.error(chalk.red("Scope escalation was denied by the user."));
			process.exit(1);
		}
	}

	console.error(chalk.red("Timed out waiting for scope approval."));
	process.exit(1);
}

// ── request ─────────────────────────────────────────────────────────────

async function requestAction(
	agentId: string,
	options: { path: string; method?: string; body?: string },
) {
	if (!options.path) {
		console.error(chalk.red("--path is required"));
		process.exit(1);
	}

	const { client } = await requireConnection(agentId);
	const method = (options.method || "GET").toUpperCase();

	const fetchOptions: RequestInit = { method };
	if (options.body && method !== "GET" && method !== "HEAD") {
		fetchOptions.headers = { "Content-Type": "application/json" };
		fetchOptions.body = options.body;
	}

	const res = await client.fetch(options.path, fetchOptions);
	const text = await res.text();

	if (!res.ok) {
		console.error(
			chalk.red(`Request failed (${res.status}): ${text.slice(0, 1000)}`),
		);
		process.exit(1);
	}

	try {
		console.log(JSON.stringify(JSON.parse(text), null, 2));
	} catch {
		console.log(text);
	}
}

// ── list ─────────────────────────────────────────────────────────────────

async function listAction() {
	const storage = await getStorage();
	const connections = await storage.listConnections();

	if (connections.length === 0) {
		console.log("No active connections.");
		return;
	}

	console.log(JSON.stringify(connections, null, 2));
}

// ── status ───────────────────────────────────────────────────────────────

async function statusAction(agentId: string) {
	const { client } = await requireConnection(agentId);
	const session = await client.getSession();

	if (!session) {
		console.error(chalk.red("Connection unhealthy or expired."));
		process.exit(1);
	}

	console.log(JSON.stringify(session, null, 2));
}

// ── command tree ─────────────────────────────────────────────────────────

const aiConnect = new Command("connect")
	.description(
		"Connect an agent to an app via device authorization (opens browser for approval)",
	)
	.argument("[url]", "App URL (default: BETTER_AUTH_URL env)")
	.option("--name <name>", "Agent name", "CLI Agent")
	.option(
		"--scopes <scopes>",
		"Comma-separated scopes (e.g. github.list_issues,github.create_issue)",
	)
	.option("--agent-id <id>", "Reuse an existing agent ID")
	.action(connectAction);

const aiDisconnect = new Command("disconnect")
	.description("Disconnect and revoke an agent")
	.argument("<agentId>", "Agent ID to disconnect")
	.action(disconnectAction);

const aiListTools = new Command("list-tools")
	.description("List available gateway tools for an agent")
	.argument("<agentId>", "Agent ID")
	.action(listToolsAction);

const aiCallTool = new Command("call-tool")
	.description("Call a gateway tool")
	.argument("<agentId>", "Agent ID")
	.requiredOption("--tool <name>", "Tool name (e.g. github.list_issues)")
	.option("--args <json>", "JSON arguments for the tool")
	.action(callToolAction);

const aiAddScopes = new Command("add-scopes")
	.description("Request additional scopes (requires user approval in browser)")
	.argument("<agentId>", "Agent ID")
	.requiredOption("--scopes <scopes>", "Comma-separated scopes to add")
	.option("--name <name>", "New agent name reflecting expanded role")
	.action(addScopesAction);

const aiRequest = new Command("request")
	.description("Make an authenticated HTTP request to the app")
	.argument("<agentId>", "Agent ID")
	.requiredOption("--path <path>", "Request path (e.g. /api/data)")
	.option("--method <method>", "HTTP method", "GET")
	.option("--body <json>", "Request body as JSON string")
	.action(requestAction);

const aiList = new Command("list")
	.description("List all active agent connections")
	.action(listAction);

const aiStatus = new Command("status")
	.description("Check if an agent connection is healthy")
	.argument("<agentId>", "Agent ID")
	.action(statusAction);

export const ai = new Command("ai")
	.description(
		"CLI interface for AI agents to authenticate and call tools via shell commands",
	)
	.addCommand(aiConnect)
	.addCommand(aiDisconnect)
	.addCommand(aiListTools)
	.addCommand(aiCallTool)
	.addCommand(aiAddScopes)
	.addCommand(aiRequest)
	.addCommand(aiList)
	.addCommand(aiStatus);
