import type { AgentConnection, HostIdentity, ProviderConfig, Storage } from "./types";

/**
 * In-memory storage. Suitable for short-lived processes, tests,
 * and environments where persistence isn't needed.
 * All data is lost when the process exits.
 */
export class MemoryStorage implements Storage {
  private host: HostIdentity | null = null;
  private agents = new Map<string, AgentConnection>();
  private providers = new Map<string, ProviderConfig>();

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

  async setAgentConnection(agentId: string, conn: AgentConnection): Promise<void> {
    this.agents.set(agentId, conn);
  }

  async deleteAgentConnection(agentId: string): Promise<void> {
    this.agents.delete(agentId);
  }

  async listAgentConnections(): Promise<AgentConnection[]> {
    return [...this.agents.values()];
  }

  async getProviderConfig(issuer: string): Promise<ProviderConfig | null> {
    return this.providers.get(issuer) ?? null;
  }

  async setProviderConfig(issuer: string, config: ProviderConfig): Promise<void> {
    this.providers.set(issuer, config);
  }

  async listProviderConfigs(): Promise<ProviderConfig[]> {
    return [...this.providers.values()];
  }
}
