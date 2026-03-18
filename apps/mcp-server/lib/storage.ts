import type { Pool } from "pg";
import type {
  Storage,
  HostIdentity,
  AgentConnection,
  ProviderConfig,
} from "@auth/agent";

let _initialized = false;

async function ensureTables(pool: Pool) {
  if (_initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aa_host_identity (
      user_id   TEXT PRIMARY KEY,
      data      JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS aa_agent_connections (
      user_id   TEXT NOT NULL,
      agent_id  TEXT NOT NULL,
      issuer    TEXT NOT NULL,
      data      JSONB NOT NULL,
      PRIMARY KEY (user_id, agent_id)
    );
    CREATE TABLE IF NOT EXISTS aa_provider_configs (
      user_id   TEXT NOT NULL,
      issuer    TEXT NOT NULL,
      data      JSONB NOT NULL,
      PRIMARY KEY (user_id, issuer)
    );
  `);
  _initialized = true;
}

/**
 * Per-user Storage adapter backed by Vercel Postgres.
 *
 * All rows are scoped by the authenticated user's ID so each
 * user gets their own host identity, agents, and provider configs.
 * Implements the SDK Storage interface from @auth/agent.
 */
export function createUserStorage(pool: Pool, userId: string): Storage {
  const init = ensureTables(pool);

  return {
    // ── Host identity ──────────────────────────────────────────

    async getHostIdentity(): Promise<HostIdentity | null> {
      await init;
      const { rows } = await pool.query(
        `SELECT data FROM aa_host_identity WHERE user_id = $1`,
        [userId],
      );
      return rows[0]?.data ?? null;
    },

    async setHostIdentity(host: HostIdentity): Promise<void> {
      await init;
      await pool.query(
        `INSERT INTO aa_host_identity (user_id, data)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data`,
        [userId, JSON.stringify(host)],
      );
    },

    async deleteHostIdentity(): Promise<void> {
      await init;
      await pool.query(
        `DELETE FROM aa_host_identity WHERE user_id = $1`,
        [userId],
      );
    },

    // ── Agent connections ──────────────────────────────────────

    async getAgentConnection(agentId: string): Promise<AgentConnection | null> {
      await init;
      const { rows } = await pool.query(
        `SELECT data FROM aa_agent_connections WHERE user_id = $1 AND agent_id = $2`,
        [userId, agentId],
      );
      return rows[0]?.data ?? null;
    },

    async setAgentConnection(
      agentId: string,
      conn: AgentConnection,
    ): Promise<void> {
      await init;
      await pool.query(
        `INSERT INTO aa_agent_connections (user_id, agent_id, issuer, data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, agent_id) DO UPDATE SET issuer = EXCLUDED.issuer, data = EXCLUDED.data`,
        [userId, agentId, conn.issuer, JSON.stringify(conn)],
      );
    },

    async deleteAgentConnection(agentId: string): Promise<void> {
      await init;
      await pool.query(
        `DELETE FROM aa_agent_connections WHERE user_id = $1 AND agent_id = $2`,
        [userId, agentId],
      );
    },

    // ── Provider configs ──────────────────────────────────────

    async getProviderConfig(issuer: string): Promise<ProviderConfig | null> {
      await init;
      const { rows } = await pool.query(
        `SELECT data FROM aa_provider_configs WHERE user_id = $1 AND issuer = $2`,
        [userId, issuer],
      );
      return rows[0]?.data ?? null;
    },

    async setProviderConfig(
      issuer: string,
      config: ProviderConfig,
    ): Promise<void> {
      await init;
      await pool.query(
        `INSERT INTO aa_provider_configs (user_id, issuer, data)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, issuer) DO UPDATE SET data = EXCLUDED.data`,
        [userId, issuer, JSON.stringify(config)],
      );
    },

    async listProviderConfigs(): Promise<ProviderConfig[]> {
      await init;
      const { rows } = await pool.query(
        `SELECT data FROM aa_provider_configs WHERE user_id = $1`,
        [userId],
      );
      return rows.map((r) => r.data as ProviderConfig);
    },
  };
}
