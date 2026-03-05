import { anthropic } from "@ai-sdk/anthropic";
import { generateAgentKeypair } from "@auth/agents";
import { createAgentMCPTools } from "@auth/agents/mcp-tools";
import type { AgentConnectionData, MCPAgentStorage } from "@auth/agents/mcp-tools";
import type { Tool, UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText, zodSchema } from "ai";
import { headers } from "next/headers";
import * as z from "zod";
import { auth } from "@/lib/auth/auth";
import { createDbStorage } from "@/lib/db/mcp-storage";
import { env } from "@/lib/env";

const sharedStorage = createDbStorage();

const SESSION_TTL_MS = 60 * 60 * 1000;

interface SessionEntry {
	connections: Map<string, AgentConnectionData>;
	lastAccess: number;
}

const sessions = new Map<string, SessionEntry>();

function getSessionStorage(
	sessionId: string,
	shared: MCPAgentStorage,
): MCPAgentStorage {
	const now = Date.now();
	for (const [id, entry] of sessions) {
		if (now - entry.lastAccess > SESSION_TTL_MS) sessions.delete(id);
	}

	let session = sessions.get(sessionId);
	if (!session) {
		session = { connections: new Map(), lastAccess: now };
		sessions.set(sessionId, session);
	}
	session.lastAccess = now;
	const connections = session.connections;

	return {
		async getConnection(agentId) {
			return connections.get(agentId) ?? null;
		},
		async saveConnection(agentId, connection) {
			connections.set(agentId, connection);
		},
		async removeConnection(agentId) {
			connections.delete(agentId);
		},
		async listConnections() {
			return [...connections.entries()].map(([agentId, data]) => ({
				agentId,
				appUrl: data.appUrl,
				name: data.name,
				scopes: data.scopes,
				provider: data.provider,
			}));
		},
		saveHostKeypair: shared.saveHostKeypair,
		getHostKeypair: shared.getHostKeypair,
		saveProviderConfig: shared.saveProviderConfig,
		getProviderConfig: shared.getProviderConfig,
		listProviderConfigs: shared.listProviderConfigs,
		removeProviderConfig: shared.removeProviderConfig,
	};
}

async function ensureHost(appUrl: string, reqHeaders: Headers) {
	const existing = await sharedStorage.getHostKeypair?.(appUrl);

	if (existing) {
		try {
			const hostRes = await auth.api.getHost({
				query: { hostId: existing.hostId },
				headers: reqHeaders,
			});
			if (hostRes.status === "active") return;
		} catch {
			// host is gone or invalid — fall through to recreate
		}

		const connections = await sharedStorage.listConnections();
		for (const conn of connections) {
			if (conn.appUrl.replace(/\/+$/, "") === appUrl.replace(/\/+$/, "")) {
				await sharedStorage.removeConnection(conn.agentId);
			}
		}
	}

	const keypair = await generateAgentKeypair();
	const res = await auth.api.createHost({
		body: {
			name: "Dashboard Chat Host",
			publicKey: keypair.publicKey as Record<string, string>,
		},
		headers: reqHeaders,
	});

	await sharedStorage.saveHostKeypair?.(appUrl, {
		keypair,
		hostId: res.hostId,
	});
}

const CHAT_TOOLS = new Set([
	"connect_agent",
	"list_capabilities",
	"call_tool",
	"request_scope",
	"disconnect_agent",
	"agent_status",
]);

export async function POST(request: Request) {
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as {
		messages: UIMessage[];
		sessionId?: string;
	};
	const messages = body.messages ?? [];
	const sessionId = body.sessionId ?? crypto.randomUUID();

	try {
		const appUrl = env.BETTER_AUTH_URL;
		await ensureHost(appUrl, reqHeaders);

		const storage = getSessionStorage(sessionId, sharedStorage);
		const { tools: mcpToolDefs, sessionAgentIds } = createAgentMCPTools({
			storage,
			defaultUrl: appUrl,
			hostName: "Agent Auth Dashboard",
		});

		// Pre-populate session with existing agent connections so the
		// model can reuse agents from previous messages in this session.
		const existingConns = await storage.listConnections();
		for (const conn of existingConns) {
			sessionAgentIds.add(conn.agentId);
		}

		const activeConn = existingConns[0] ?? null;

		const aiTools: Record<string, Tool> = {};
		for (const mcpTool of mcpToolDefs) {
			if (!CHAT_TOOLS.has(mcpTool.name)) continue;

			aiTools[mcpTool.name] = {
				description: mcpTool.description,
				inputSchema: zodSchema(z.object(mcpTool.inputSchema)),
				execute: async (args: Record<string, unknown>) => {
					const result = await mcpTool.handler(
						args as Record<string, string | string[]>,
					);
					return result.content.map((c) => c.text).join("\n");
				},
			};
		}

		const systemPrompt = activeConn
			? `You are a helpful AI assistant in the Agent Auth dashboard.
You are already connected as agent "${activeConn.name}" (Agent ID: ${activeConn.agentId}).

DO NOT call connect_agent — you are already registered. Use your Agent ID directly with call_tool, request_scope, and other tools.

SCOPE FLOW — ALWAYS follow this before calling any provider tool:
1. Call request_scope with the scopes you need (e.g. ["acme-bank.*"]).
2. WAIT for the result. request_scope blocks until the user approves or denies.
3. ONLY if request_scope returns "approved" or "granted", proceed to call_tool.
4. If request_scope returns "denied", tell the user and STOP. Do NOT retry.

HANDLING ERRORS:
- If call_tool returns a 403 error, your scopes were REVOKED. You must call request_scope again, wait for approval, and only then retry call_tool.
- NEVER retry call_tool after a 403 without first getting a successful request_scope approval.
- If the user denies the scope request, inform them and stop. Do not keep requesting.

RULES:
- Use list_capabilities to discover available tools before calling them.
- Be concise. Explain what you're doing and present results clearly.`
			: `You are a helpful AI assistant in the Agent Auth dashboard.

FIRST STEP — you must register before doing anything:
1. Call connect_agent with a short, task-based name that describes what you're doing (e.g. "Bank Transfer Helper", "Issue Tracker", "Smart Home Controller"). Pick a name the user would recognize from their request.
2. Save the Agent ID returned — pass it to every subsequent tool call.

SCOPE FLOW — ALWAYS follow this before calling any provider tool:
1. Call request_scope with the scopes you need (e.g. ["acme-bank.*"]).
2. WAIT for the result. request_scope blocks until the user approves or denies.
3. ONLY if request_scope returns "approved" or "granted", proceed to call_tool.
4. If request_scope returns "denied", tell the user and STOP. Do NOT retry.

HANDLING ERRORS:
- If call_tool returns a 403 error, your scopes were REVOKED. You must call request_scope again, wait for approval, and only then retry call_tool.
- NEVER retry call_tool after a 403 without first getting a successful request_scope approval.
- If the user denies the scope request, inform them and stop. Do not keep requesting.

RULES:
- NEVER use a generic name like "Agent" — always name yourself after the task.
- Use list_capabilities to discover available tools before calling them.
- Be concise. Explain what you're doing and present results clearly.`;

		const modelMessages = await convertToModelMessages(messages, {
			tools: aiTools,
		});

		const result = streamText({
			model: anthropic("claude-sonnet-4-20250514"),
			system: systemPrompt,
			messages: modelMessages,
			tools: aiTools,
			stopWhen: stepCountIs(10),
			abortSignal: request.signal,
		});

		return result.toUIMessageStreamResponse({
			originalMessages: messages,
			sendStart: true,
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : "Internal server error";
		console.error("[chat/route] Error:", msg);
		return new Response(msg, { status: 500 });
	}
}
