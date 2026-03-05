#!/usr/bin/env node

/**
 * CLI entry point for @auth/agents.
 *
 * Usage:
 *   npx @auth/agents agent --url "https://myapp.com"
 *   npx @auth/agents serve --url "https://myapp.com"
 */

import { createFileStorage } from "./mcp-storage-fs";

function collectArgs(args: string[], flag: string): string[] {
	const values: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === flag && i + 1 < args.length) {
			values.push(args[i + 1]);
			i++;
		}
	}
	return values;
}

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === "--help" || command === "-h") {
		printHelp();
		process.exit(0);
	}

	const urls = collectArgs(args, "--url");
	if (urls.length === 0 && process.env.BETTER_AUTH_URL) {
		urls.push(process.env.BETTER_AUTH_URL);
	}
	const url = urls[0];

	const encKeyIndex = args.indexOf("--encryption-key");
	const encryptionKey =
		encKeyIndex !== -1
			? args[encKeyIndex + 1]
			: process.env.AGENT_ENCRYPTION_KEY;

	const registryIndex = args.indexOf("--registry");
	const registryUrl =
		registryIndex !== -1
			? args[registryIndex + 1]
			: process.env.AGENT_REGISTRY_URL;

	const storage = createFileStorage({ encryptionKey });

	switch (command) {
		case "agent":
		case "connect": {
			if (!url) {
				console.error(
					"Error: --url is required. Example: npx @auth/agents agent --url https://myapp.com",
				);
				process.exit(1);
			}

			const { connectAgent } = await import("./agent-client");
			const nameIndex = args.indexOf("--name");
			const name = nameIndex !== -1 ? args[nameIndex + 1] : "CLI Agent";

			console.log(`Connecting to ${url}...`);

			const result = await connectAgent({
				appURL: url,
				name,
				openBrowser: true,
				onUserCode: (info) => {
					console.log("\nPlease approve the agent connection:");
					console.log(`  Code: ${info.userCode}`);
					console.log(`  URL:  ${info.verificationUriComplete}`);
					console.log("\nOpening browser...");
				},
				onPoll: (attempt) => {
					if (attempt % 3 === 0) {
						process.stdout.write(".");
					}
				},
			});

			await storage.saveConnection(result.agentId, {
				appUrl: url,
				keypair: {
					privateKey: result.privateKey,
					publicKey: result.publicKey,
					kid: result.kid,
				},
				name,
				scopes: result.scopes,
			});

			console.log(`\nConnected! Agent ID: ${result.agentId}`);
			console.log(`Scopes: ${result.scopes.join(", ") || "none"}`);
			break;
		}

		case "enroll": {
			if (!url) {
				console.error(
					"Error: --url is required. Example: npx @auth/agents enroll --token <token> --url https://myapp.com",
				);
				process.exit(1);
			}

			const tokenIndex = args.indexOf("--token");
			const enrollToken = tokenIndex !== -1 ? args[tokenIndex + 1] : undefined;

			if (!enrollToken) {
				console.error(
					"Error: --token is required. Get an enrollment token from the dashboard.",
				);
				process.exit(1);
			}

			const { enrollHost } = await import("./agent-client");

			console.log(`Enrolling device with ${url}...`);

			const existingHost = storage.getHostKeypair
				? await storage.getHostKeypair(url)
				: null;
			if (existingHost) {
				console.log(
					"Found an existing local host credential. Reusing it so enrollment can claim that host.",
				);
			}

			const enrollResult = await enrollHost({
				appURL: url,
				token: enrollToken,
				keypair: existingHost?.keypair,
			});

			if (storage.saveHostKeypair) {
				await storage.saveHostKeypair(url, {
					keypair: {
						privateKey: enrollResult.privateKey,
						publicKey: enrollResult.publicKey,
						kid: enrollResult.kid,
					},
					hostId: enrollResult.hostId,
				});
			}

			console.log(`\nEnrolled! Host ID: ${enrollResult.hostId}`);
			if (enrollResult.name) {
				console.log(`Name: ${enrollResult.name}`);
			}
			console.log(`Scopes: ${enrollResult.scopes.join(", ") || "none"}`);
			if (enrollResult.reusedExistingKeypair) {
				console.log(
					"Claimed the existing device host, so prior autonomous activity from this host now belongs to your account.",
				);
			}
			console.log(
				"\nThis device is now a trusted host. Agents created from here will be auto-approved.",
			);
			break;
		}

		case "serve": {
			const { createMCPServer } = await import("./mcp-server");
			await createMCPServer({
				storage,
				appUrl: urls.length > 1 ? urls : url,
				serverName: "auth-agents",
				registryUrl,
			});
			break;
		}

		case "list": {
			const connections = await storage.listConnections();
			if (connections.length === 0) {
				console.log("No agent connections found.");
			} else {
				console.log(`Found ${connections.length} connection(s):\n`);
				for (const conn of connections) {
					console.log(`  ${conn.agentId}`);
					console.log(`    App:    ${conn.appUrl}`);
					console.log(`    Name:   ${conn.name}`);
					console.log(`    Scopes: ${conn.scopes.join(", ") || "none"}\n`);
				}
			}
			break;
		}

		default:
			console.error(`Unknown command: ${command}`);
			printHelp();
			process.exit(1);
	}
}

function printHelp() {
	console.log(`
@auth/agents - AI Agent Authentication CLI

Usage:
  auth agent   --url <app-url> [--name <name>]    Connect an agent via device flow
  auth enroll  --url <app-url> --token <token>     Enroll device using dashboard token
  auth serve   --url <url> [--url <url2> ...]      Start MCP server (stdio)
  auth list                                        List stored connections

Options:
  --url <url>              App URL (repeatable for serve; or set BETTER_AUTH_URL)
  --name <name>            Agent name (default: "CLI Agent")
  --token <token>          Enrollment token from dashboard (for enroll command)
  --registry <url>         Registry URL for intent-based discovery (or set AGENT_REGISTRY_URL)
  --encryption-key <key>   Encrypt stored keypairs (or set AGENT_ENCRYPTION_KEY)
  -h, --help               Show this help
`);
}

main().catch((err) => {
	console.error("Fatal:", err instanceof Error ? err.message : err);
	process.exit(1);
});
