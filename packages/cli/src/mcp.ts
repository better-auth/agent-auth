import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import { getAgentAuthTools, type ToolParameters } from "@better-auth/agent-auth-sdk";
import { createClient, type ClientConfig } from "./client.js";

const zodTypeMap: Record<string, () => z.ZodTypeAny> = {
	string: () => z.string(),
	number: () => z.number(),
	boolean: () => z.boolean(),
	object: () => z.record(z.string(), z.unknown()),
};

interface PropertyDescriptor {
	type?: string;
	items?: { type?: string };
	enum?: [string, ...string[]];
	description?: string;
}

function jsonSchemaToZod(params: ToolParameters): ZodRawShape | undefined {
	const { properties, required } = params;
	const entries = Object.entries(properties);
	if (entries.length === 0) return undefined;

	const shape: ZodRawShape = {};
	const requiredSet = new Set(required ?? []);

	for (const [key, value] of entries) {
		const prop = value as PropertyDescriptor;
		let schema: z.ZodTypeAny;

		if (prop.type === "array") {
			schema = z.array(prop.items?.type === "string" ? z.string() : z.unknown());
		} else if (prop.enum) {
			schema = z.enum(prop.enum);
		} else {
			schema = (zodTypeMap[prop.type ?? "string"] ?? (() => z.unknown()))();
		}

		if (prop.description) {
			schema = schema.describe(prop.description);
		}

		shape[key] = requiredSet.has(key) ? schema : schema.optional();
	}

	return shape;
}

export async function startMcpServer(config: ClientConfig): Promise<void> {
	const client = createClient(config);

	if (config.urls?.length) {
		await Promise.all(
			config.urls.map(async (url) => {
				try {
					await client.discoverProvider(url);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error(`Warning: could not discover ${url}: ${msg}`);
				}
			}),
		);
	}

	const tools = getAgentAuthTools(client);

	const server = new McpServer({
		name: "agent-auth",
		version: "0.1.0",
	});

	for (const tool of tools) {
		const zodShape = jsonSchemaToZod(tool.parameters);
		const toolOpts: { description: string; inputSchema?: ZodRawShape } = {
			description: tool.description,
		};
		if (zodShape) {
			toolOpts.inputSchema = zodShape;
		}

		server.registerTool(
			tool.name,
			toolOpts,
			async (args: Record<string, unknown>, extra?: { signal?: AbortSignal }) => {
				const result = await tool.execute(args, { signal: extra?.signal });
				return {
					content: [
						{ type: "text" as const, text: JSON.stringify(result, null, 2) },
					],
				};
			},
		);
	}

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
