import { anthropic } from "@ai-sdk/anthropic";
import { generateAgentKeypair } from "@auth/agents";
import { agentAuth } from "@auth/agents/ai";
import type { Tool, UIMessage } from "ai";
import {
	convertToModelMessages,
	jsonSchema,
	stepCountIs,
	streamText,
} from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { createDbStorage } from "@/lib/db/mcp-storage";
import { env } from "@/lib/env";

const storage = createDbStorage();

async function ensureHost(appUrl: string, reqHeaders: Headers) {
	const existing = await storage.getHostKeypair?.(appUrl);
	if (existing) return;

	const keypair = await generateAgentKeypair();
	const res = await auth.api.createHost({
		body: {
			name: "Dashboard Chat Host",
			publicKey: keypair.publicKey as Record<string, string>,
		},
		headers: reqHeaders,
	});

	await storage.saveHostKeypair?.(appUrl, {
		keypair,
		hostId: res.hostId,
	});
}

export async function POST(request: Request) {
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const appUrl = env.BETTER_AUTH_URL;
	await ensureHost(appUrl, reqHeaders);

	const { tools: sdkTools, connections } = await agentAuth({
		providers: { url: appUrl },
		storage,
		hostName: "Agent Auth Dashboard",
		includeScopeTools: true,
	});

	const body = (await request.json()) as { messages: UIMessage[] };

	const aiTools: Record<string, Tool> = {};
	for (const [name, sdkTool] of Object.entries(sdkTools)) {
		aiTools[name] = {
			description: sdkTool.description,
			inputSchema: jsonSchema(
				sdkTool.parameters?.jsonSchema ?? {
					type: "object",
					properties: {},
				},
			),
			execute: async (args: Record<string, unknown>) => {
				const result = await sdkTool.execute(args);
				return typeof result === "string" ? result : JSON.stringify(result);
			},
		};
	}

	const providerNames = connections.map((c) => c.providerName).join(", ");
	const capabilityTools = Object.keys(sdkTools).filter(
		(n) => n !== "request_scope" && n !== "check_scope_status",
	);

	const systemPrompt = `You are a helpful AI assistant in the Agent Auth dashboard.
You are authenticated as an agent via the Agent Auth SDK with Ed25519 keypair identity.

PERMISSION MODEL:
You start with NO permissions. Before calling any provider tool you MUST:
1. Call request_scope with the scopes you need (e.g. ["acme-bank.*"])
2. Tell the user to approve in their browser extension or the Approvals page
3. Call check_scope_status — wait for status "approved"
4. Then call the provider tool

This demonstrates the Agent Auth CIBA flow — scope grants require user approval via the extension.

Connected providers: ${providerNames || "none"}
Available tools (need scope approval): ${capabilityTools.length > 0 ? capabilityTools.join(", ") : "none — add connections in the dashboard first"}

Be concise. Explain what you're doing and present results clearly.`;

	const modelMessages = await convertToModelMessages(body.messages, {
		tools: aiTools,
	});

	const result = streamText({
		model: anthropic("claude-sonnet-4-20250514"),
		system: systemPrompt,
		messages: modelMessages,
		tools: aiTools,
		stopWhen: stepCountIs(10),
	});

	return result.toUIMessageStreamResponse();
}
