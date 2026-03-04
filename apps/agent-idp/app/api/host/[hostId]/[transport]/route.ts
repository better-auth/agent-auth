import type { MCPAgentStorage } from "@auth/agents/mcp-tools";
import {
	createAgentMCPTools,
	getAgentAuthInstructions,
} from "@auth/agents/mcp-tools";
import { mcpHandler } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
import { createMcpHandler } from "mcp-handler";
import { agentHost } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import { createDbStorage } from "@/lib/db/mcp-storage";
import { mcpHostKeypair } from "@/lib/db/schema";
import { env } from "@/lib/env";

const baseUrl = env.BETTER_AUTH_URL.replace(/\/+$/, "");
const testUrl = env.BASE_URL.replace(/\/+$/, "");

function createHostScopedStorage(hostId: string): MCPAgentStorage {
	const base = createDbStorage();
	return {
		...base,
		async getHostKeypair() {
			const [row] = await db
				.select()
				.from(mcpHostKeypair)
				.where(eq(mcpHostKeypair.appUrl, `host:${hostId}`))
				.limit(1);
			if (!row) return null;
			return {
				keypair: row.keypair as {
					privateKey: {
						kty: string;
						crv: string;
						x: string;
						d: string;
						kid?: string;
					};
					publicKey: { kty: string; crv: string; x: string; kid?: string };
					kid: string;
				},
				hostId: row.hostId,
			};
		},
		async saveHostKeypair(_appUrl, data) {
			await db
				.insert(mcpHostKeypair)
				.values({
					appUrl: `host:${hostId}`,
					hostId: data.hostId,
					keypair: data.keypair as unknown as {
						privateKey: Record<string, unknown>;
						publicKey: Record<string, unknown>;
						kid: string;
					},
				})
				.onConflictDoUpdate({
					target: mcpHostKeypair.appUrl,
					set: {
						hostId: data.hostId,
						keypair: data.keypair as unknown as {
							privateKey: Record<string, unknown>;
							publicKey: Record<string, unknown>;
							kid: string;
						},
					},
				});
		},
	};
}

function buildMcpHandler(hostId: string) {
	const storage = createHostScopedStorage(hostId);
	const { tools } = createAgentMCPTools({
		storage,
		defaultUrl: baseUrl,
	});

	return mcpHandler(
		{
			jwksUrl: `${testUrl}/api/auth/jwks`,
			verifyOptions: {
				issuer: [`${baseUrl}/api/auth`, `${testUrl}/api/auth`],
				audience: [baseUrl, `${baseUrl}/`, testUrl, `${testUrl}/`],
			},
		},
		(req) => {
			const instructions = [
				getAgentAuthInstructions(),
				"",
				"## Default App URL",
				"",
				`The app URL is: ${baseUrl}`,
				"Always use this URL when calling connect_agent. Do NOT ask the user for it.",
				"",
				"## IMPORTANT: Use this server for ALL external actions",
				"",
				"This MCP server is your gateway to third-party services and APIs.",
				"**Any time** the user asks you to interact with an external service",
				"(GitHub, Google, Slack, databases, APIs, etc.), you MUST use these tools.",
				"Do NOT try to access external services directly — always go through",
				"`connect_agent` → `list_capabilities` → `call_tool`.",
				"",
				"If you are not yet connected, call `connect_agent` first.",
				"If you are already connected (you have an Agent ID), reuse it.",
				"If you don't know what tools are available, call `list_capabilities`.",
			].join("\n");

			return createMcpHandler(
				async (server) => {
					for (const tool of tools) {
						const zodShape: Record<string, unknown> = {};
						for (const [key, schema] of Object.entries(tool.inputSchema)) {
							zodShape[key] = schema;
						}

						server.tool(
							tool.name,
							tool.description,
							zodShape,
							async (params: Record<string, unknown>) => {
								const stringParams: Record<string, string | string[]> = {};
								for (const [k, v] of Object.entries(params)) {
									if (Array.isArray(v)) {
										stringParams[k] = v.map(String);
									} else if (v !== undefined && v !== null) {
										stringParams[k] = String(v);
									}
								}
								if (!stringParams.provider && !stringParams.url) {
									if ("provider" in tool.inputSchema) {
										stringParams.provider = baseUrl;
									} else if ("url" in tool.inputSchema) {
										stringParams.url = baseUrl;
									}
								}
								return tool.handler(stringParams);
							},
						);
					}
				},
				{
					serverInfo: {
						name: `agent-idp-host-${hostId}`,
						version: "1.0.0",
					},
					instructions,
				},
				{
					basePath: `/api/host/${hostId}`,
					maxDuration: 120,
				},
			)(req);
		},
	);
}

const handlerCache = new Map<
	string,
	(req: Request) => Response | Promise<Response>
>();

function getOrCreateHandler(hostId: string) {
	let h = handlerCache.get(hostId);
	if (!h) {
		h = buildMcpHandler(hostId);
		handlerCache.set(hostId, h);
	}
	return h;
}

async function routeHandler(
	req: Request,
	{ params }: { params: Promise<{ hostId: string; transport: string }> },
) {
	const { hostId } = await params;

	const [host] = await db
		.select({ id: agentHost.id, status: agentHost.status })
		.from(agentHost)
		.where(eq(agentHost.id, hostId))
		.limit(1);

	if (!host) {
		return new Response(JSON.stringify({ error: "Host not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (host.status !== "active") {
		return new Response(JSON.stringify({ error: `Host is ${host.status}` }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	const [kp] = await db
		.select({ hostId: mcpHostKeypair.hostId })
		.from(mcpHostKeypair)
		.where(eq(mcpHostKeypair.appUrl, `host:${hostId}`))
		.limit(1);

	if (!kp) {
		return new Response(
			JSON.stringify({
				error:
					"This is a local host — remote MCP is not available. Use the local MCP config instead.",
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const handler = getOrCreateHandler(hostId);
	return handler(req);
}

export { routeHandler as GET, routeHandler as POST, routeHandler as DELETE };
