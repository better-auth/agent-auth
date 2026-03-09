import { buildCli } from "./cli.js";
import { startMcpServer } from "./mcp.js";
import { getClientConfig } from "./client.js";

const args = process.argv.slice(2);

function mcpConfig() {
	return getClientConfig();
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
