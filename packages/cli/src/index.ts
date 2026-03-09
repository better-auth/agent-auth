import { buildCli } from "./cli.js";
import { startMcpServer } from "./mcp.js";
import { getClientConfig } from "./client.js";

const args = process.argv.slice(2);

/**
 * Parse global CLI flags from process.argv for the MCP early-exit path.
 * Commander is not used here to avoid interfering with stdio transport.
 */
function parseGlobalFlags(): Record<string, string | undefined> {
	const flags: Record<string, string | undefined> = {};
	const argv = process.argv.slice(2);
	const flagMap: Record<string, string> = {
		"--registry-url": "registryUrl",
		"--storage-dir": "storageDir",
		"--host-name": "hostName",
	};
	for (let i = 0; i < argv.length; i++) {
		const key = flagMap[argv[i]];
		if (key && i + 1 < argv.length) {
			flags[key] = argv[++i];
		}
	}
	if (argv.includes("--no-browser")) {
		flags.noBrowser = "1";
	}
	return flags;
}

function mcpConfig() {
	const flags = parseGlobalFlags();
	const config = getClientConfig();
	return {
		...config,
		storageDir: flags.storageDir ?? config.storageDir,
		registryUrl: flags.registryUrl ?? config.registryUrl,
		hostName: flags.hostName ?? config.hostName,
		noBrowser: flags.noBrowser === "1" || config.noBrowser,
	};
}

if (args[0] === "mcp") {
	startMcpServer(mcpConfig()).catch((err) => {
		console.error("MCP server error:", err);
		process.exit(1);
	});
} else {
	const program = buildCli();

	program
		.command("mcp")
		.description("Start the Agent Auth MCP server (stdio)")
		.action(() => {
			startMcpServer(mcpConfig()).catch((err) => {
				console.error("MCP server error:", err);
				process.exit(1);
			});
		});

	program.parse();
}
