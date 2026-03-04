import type { AgentJWK } from "@auth/agents";
import { createAgentClient, generateAgentKeypair } from "@auth/agents";

export interface AgentAuthCredential {
	agentId: string;
	keypair: {
		privateKey: AgentJWK;
		publicKey: AgentJWK;
		kid: string;
	};
	providerUrl: string;
}

interface AgentAuthDiscovery {
	provider_name: string;
	provider_description: string;
	agent_registration: string;
	agent_capabilities: string;
	endpoints: {
		gateway_tools?: string;
		gateway_call?: string;
	};
}

export async function discoverAgentAuth(
	baseUrl: string,
): Promise<AgentAuthDiscovery | null> {
	const url = baseUrl.replace(/\/+$/, "");
	try {
		const res = await fetch(`${url}/.well-known/agent-configuration`, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(5_000),
		});
		if (!res.ok) return null;
		return (await res.json()) as AgentAuthDiscovery;
	} catch {
		return null;
	}
}

export async function listAgentAuthTools(
	credential: AgentAuthCredential,
): Promise<
	Array<{
		name: string;
		description: string;
		inputSchema?: Record<string, unknown>;
	}>
> {
	const client = createAgentClient({
		baseURL: credential.providerUrl,
		agentId: credential.agentId,
		privateKey: credential.keypair.privateKey,
	});

	try {
		const res = await client.fetch("/api/auth/agent/gateway/tools", {
			method: "GET",
		});
		if (!res.ok) return [];
		const data = (await res.json()) as {
			providers: Array<{
				name: string;
				tools: Array<{
					name: string;
					description: string;
					inputSchema?: Record<string, unknown>;
				}>;
			}>;
		};
		const tools: Array<{
			name: string;
			description: string;
			inputSchema?: Record<string, unknown>;
		}> = [];
		for (const provider of data.providers ?? []) {
			for (const t of provider.tools) {
				tools.push({
					name: `${provider.name}.${t.name}`,
					description: t.description,
					inputSchema: t.inputSchema,
				});
			}
		}
		return tools;
	} catch {
		return [];
	}
}

export async function callAgentAuthTool(
	credential: AgentAuthCredential,
	tool: string,
	args: Record<string, unknown>,
): Promise<{
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}> {
	const client = createAgentClient({
		baseURL: credential.providerUrl,
		agentId: credential.agentId,
		privateKey: credential.keypair.privateKey,
	});

	const res = await client.fetch("/api/auth/agent/gateway/call", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ tool, args }),
	});

	if (!res.ok) {
		const errText = await res.text();
		return {
			content: [{ type: "text", text: `Error (${res.status}): ${errText}` }],
			isError: true,
		};
	}

	const result = (await res.json()) as {
		content?: Array<{ type: string; text: string }>;
		isError?: boolean;
	};

	return {
		content: (result.content ?? []).map((c) => ({
			type: c.type ?? "text",
			text: c.text ?? JSON.stringify(c),
		})),
		isError: result.isError ?? false,
	};
}

export async function registerAgentWithProvider(
	providerUrl: string,
	sessionToken: string,
	name: string,
	scopes: string[],
): Promise<AgentAuthCredential> {
	const url = providerUrl.replace(/\/+$/, "");
	const keypair = await generateAgentKeypair();

	const res = await fetch(`${url}/api/auth/agent/register`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${sessionToken}`,
		},
		body: JSON.stringify({
			name,
			publicKey: keypair.publicKey,
			kid: keypair.kid,
			scopes,
		}),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Failed to register agent: ${err}`);
	}

	const data = (await res.json()) as { agent: { id: string } };

	return {
		agentId: data.agent.id,
		keypair,
		providerUrl: url,
	};
}

export function parseAgentAuthCredential(
	metadata: string | null,
	providerUrl: string,
): AgentAuthCredential | null {
	if (!metadata) return null;
	try {
		const parsed = JSON.parse(metadata) as {
			agentId?: string;
			keypair?: AgentAuthCredential["keypair"];
		};
		if (!parsed.agentId || !parsed.keypair) return null;
		return {
			agentId: parsed.agentId,
			keypair: parsed.keypair,
			providerUrl,
		};
	} catch {
		return null;
	}
}

export function serializeAgentAuthCredential(
	credential: AgentAuthCredential,
): string {
	return JSON.stringify({
		agentId: credential.agentId,
		keypair: credential.keypair,
	});
}
