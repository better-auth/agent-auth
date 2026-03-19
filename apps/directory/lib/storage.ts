import type { Sql } from "postgres";
import type { Storage, HostIdentity, AgentConnection, ProviderConfig } from "@auth/agent";

let _initialized = false;

async function ensureTables(sql: Sql) {
  if (_initialized) return;
  await sql`
		CREATE TABLE IF NOT EXISTS aa_host_identity (
			user_id   TEXT PRIMARY KEY,
			data      JSONB NOT NULL
		)
	`;
  await sql`
		CREATE TABLE IF NOT EXISTS aa_agent_connections (
			user_id   TEXT NOT NULL,
			agent_id  TEXT NOT NULL,
			issuer    TEXT NOT NULL,
			data      JSONB NOT NULL,
			PRIMARY KEY (user_id, agent_id)
		)
	`;
  await sql`
		CREATE TABLE IF NOT EXISTS aa_provider_configs (
			user_id   TEXT NOT NULL,
			issuer    TEXT NOT NULL,
			data      JSONB NOT NULL,
			PRIMARY KEY (user_id, issuer)
		)
	`;
  _initialized = true;
}

/**
 * Per-user Storage adapter backed by Postgres (via postgres.js).
 *
 * All rows are scoped by the authenticated user's ID so each
 * user gets their own host identity, agents, and provider configs.
 */
export function createUserStorage(sql: Sql, userId: string): Storage {
  const init = ensureTables(sql);

  return {
    async getHostIdentity(): Promise<HostIdentity | null> {
      await init;
      const rows = await sql`
				SELECT data FROM aa_host_identity WHERE user_id = ${userId}
			`;
      return (rows[0]?.data as HostIdentity) ?? null;
    },

    async setHostIdentity(host: HostIdentity): Promise<void> {
      await init;
      await sql`
				INSERT INTO aa_host_identity (user_id, data)
				VALUES (${userId}, ${JSON.stringify(host)})
				ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data
			`;
    },

    async deleteHostIdentity(): Promise<void> {
      await init;
      await sql`DELETE FROM aa_host_identity WHERE user_id = ${userId}`;
    },

    async getAgentConnection(agentId: string): Promise<AgentConnection | null> {
      await init;
      const rows = await sql`
				SELECT data FROM aa_agent_connections
				WHERE user_id = ${userId} AND agent_id = ${agentId}
			`;
      return (rows[0]?.data as AgentConnection) ?? null;
    },

    async setAgentConnection(agentId: string, conn: AgentConnection): Promise<void> {
      await init;
      await sql`
				INSERT INTO aa_agent_connections (user_id, agent_id, issuer, data)
				VALUES (${userId}, ${agentId}, ${conn.issuer}, ${JSON.stringify(conn)})
				ON CONFLICT (user_id, agent_id)
				DO UPDATE SET issuer = EXCLUDED.issuer, data = EXCLUDED.data
			`;
    },

    async deleteAgentConnection(agentId: string): Promise<void> {
      await init;
      await sql`
				DELETE FROM aa_agent_connections
				WHERE user_id = ${userId} AND agent_id = ${agentId}
			`;
    },

    async listAgentConnections(): Promise<AgentConnection[]> {
      await init;
      const rows = await sql`
				SELECT data FROM aa_agent_connections WHERE user_id = ${userId}
			`;
      return rows.map((r) => r.data as AgentConnection);
    },

    async getProviderConfig(issuer: string): Promise<ProviderConfig | null> {
      await init;
      const rows = await sql`
				SELECT data FROM aa_provider_configs
				WHERE user_id = ${userId} AND issuer = ${issuer}
			`;
      return (rows[0]?.data as ProviderConfig) ?? null;
    },

    async setProviderConfig(issuer: string, config: ProviderConfig): Promise<void> {
      await init;
      await sql`
				INSERT INTO aa_provider_configs (user_id, issuer, data)
				VALUES (${userId}, ${issuer}, ${JSON.stringify(config)})
				ON CONFLICT (user_id, issuer) DO UPDATE SET data = EXCLUDED.data
			`;
    },

    async listProviderConfigs(): Promise<ProviderConfig[]> {
      await init;
      const rows = await sql`
				SELECT data FROM aa_provider_configs WHERE user_id = ${userId}
			`;
      return rows.map((r) => r.data as ProviderConfig);
    },
  };
}
