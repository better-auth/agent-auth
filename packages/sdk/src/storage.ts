import type {
	AgentConnection,
	HostIdentity,
	ProviderConfig,
	Storage,
} from "./types";

/**
 * In-memory storage. Suitable for short-lived processes, tests,
 * and environments where persistence isn't needed.
 * All data is lost when the process exits.
 */
export class MemoryStorage implements Storage {
	private host: HostIdentity | null = null;
	private readonly agents = new Map<string, AgentConnection>();
	private readonly providers = new Map<string, ProviderConfig>();

	async getHostIdentity(): Promise<HostIdentity | null> {
		return this.host;
	}

	async setHostIdentity(host: HostIdentity): Promise<void> {
		this.host = host;
	}

	async deleteHostIdentity(): Promise<void> {
		this.host = null;
	}

	async getAgentConnection(agentId: string): Promise<AgentConnection | null> {
		return this.agents.get(agentId) ?? null;
	}

	async setAgentConnection(
		agentId: string,
		conn: AgentConnection
	): Promise<void> {
		this.agents.set(agentId, conn);
	}

	async deleteAgentConnection(agentId: string): Promise<void> {
		this.agents.delete(agentId);
	}

	async listAgentConnections(issuer: string): Promise<AgentConnection[]> {
		const result: AgentConnection[] = [];
		for (const conn of this.agents.values()) {
			if (conn.issuer === issuer) {
				result.push(conn);
			}
		}
		return result;
	}

	async getProviderConfig(issuer: string): Promise<ProviderConfig | null> {
		return this.providers.get(issuer) ?? null;
	}

	async setProviderConfig(
		issuer: string,
		config: ProviderConfig
	): Promise<void> {
		this.providers.set(issuer, config);
	}

	async listProviderConfigs(): Promise<ProviderConfig[]> {
		return [...this.providers.values()];
	}
}
