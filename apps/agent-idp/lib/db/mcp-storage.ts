import type {
	AgentKeypair,
	MCPAgentStorage,
	ProviderConfig,
} from "@auth/agents/mcp-tools";
import { eq } from "drizzle-orm";
import { db } from "./drizzle";
import {
	mcpAgentConnection,
	mcpHostKeypair,
	mcpPendingFlow,
	mcpProviderConfig,
} from "./schema";

export function createDbStorage(): MCPAgentStorage {
	return {
		async getConnection(agentId) {
			const [row] = await db
				.select()
				.from(mcpAgentConnection)
				.where(eq(mcpAgentConnection.agentId, agentId))
				.limit(1);
			if (!row) return null;
			return {
				appUrl: row.appUrl,
				keypair: row.keypair as AgentKeypair,
				name: row.name,
				scopes: row.scopes,
				provider: row.provider ?? undefined,
			};
		},

		async saveConnection(agentId, connection) {
			await db
				.insert(mcpAgentConnection)
				.values({
					agentId,
					appUrl: connection.appUrl,
					name: connection.name,
					scopes: connection.scopes,
					provider: connection.provider,
					keypair: connection.keypair as unknown as {
						privateKey: Record<string, unknown>;
						publicKey: Record<string, unknown>;
						kid: string;
					},
				})
				.onConflictDoUpdate({
					target: mcpAgentConnection.agentId,
					set: {
						appUrl: connection.appUrl,
						name: connection.name,
						scopes: connection.scopes,
						provider: connection.provider,
						keypair: connection.keypair as unknown as {
							privateKey: Record<string, unknown>;
							publicKey: Record<string, unknown>;
							kid: string;
						},
					},
				});
		},

		async removeConnection(agentId) {
			await db
				.delete(mcpAgentConnection)
				.where(eq(mcpAgentConnection.agentId, agentId));
		},

		async listConnections() {
			const rows = await db.select().from(mcpAgentConnection);
			return rows.map((row) => ({
				agentId: row.agentId,
				appUrl: row.appUrl,
				name: row.name,
				scopes: row.scopes,
				provider: row.provider ?? undefined,
			}));
		},

		async savePendingFlow(appUrl, flow) {
			await db
				.insert(mcpPendingFlow)
				.values({
					appUrl,
					deviceCode: flow.deviceCode,
					clientId: flow.clientId,
					name: flow.name,
					scopes: flow.scopes,
				})
				.onConflictDoUpdate({
					target: mcpPendingFlow.appUrl,
					set: {
						deviceCode: flow.deviceCode,
						clientId: flow.clientId,
						name: flow.name,
						scopes: flow.scopes,
					},
				});
		},

		async getPendingFlow(appUrl) {
			const [row] = await db
				.select()
				.from(mcpPendingFlow)
				.where(eq(mcpPendingFlow.appUrl, appUrl))
				.limit(1);
			if (!row) return null;
			return {
				deviceCode: row.deviceCode,
				clientId: row.clientId,
				name: row.name,
				scopes: row.scopes,
			};
		},

		async removePendingFlow(appUrl) {
			await db.delete(mcpPendingFlow).where(eq(mcpPendingFlow.appUrl, appUrl));
		},

		async saveHostKeypair(appUrl, data) {
			await db
				.insert(mcpHostKeypair)
				.values({
					appUrl,
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

		async getHostKeypair(appUrl) {
			const [row] = await db
				.select()
				.from(mcpHostKeypair)
				.where(eq(mcpHostKeypair.appUrl, appUrl))
				.limit(1);
			if (!row) return null;
			return {
				keypair: row.keypair as AgentKeypair,
				hostId: row.hostId,
			};
		},

		async saveProviderConfig(name, config) {
			await db
				.insert(mcpProviderConfig)
				.values({
					name,
					config: config as unknown as Record<string, unknown>,
				})
				.onConflictDoUpdate({
					target: mcpProviderConfig.name,
					set: { config: config as unknown as Record<string, unknown> },
				});
		},

		async getProviderConfig(name) {
			const [row] = await db
				.select()
				.from(mcpProviderConfig)
				.where(eq(mcpProviderConfig.name, name))
				.limit(1);
			if (!row) return null;
			return row.config as unknown as ProviderConfig;
		},

		async listProviderConfigs() {
			const rows = await db.select().from(mcpProviderConfig);
			return rows.map((row) => ({
				name: row.name,
				config: row.config as unknown as ProviderConfig,
			}));
		},

		async removeProviderConfig(name) {
			await db
				.delete(mcpProviderConfig)
				.where(eq(mcpProviderConfig.name, name));
		},
	};
}
