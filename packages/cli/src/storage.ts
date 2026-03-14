import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import type {
  AgentConnection,
  HostIdentity,
  ProviderConfig,
  Storage,
} from "@auth/agent";

const DEFAULT_DIR = path.join(os.homedir(), ".agent-auth");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(data: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(data, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decrypt(encoded: string, secret: string): string {
  const key = deriveKey(secret);
  const buf = Buffer.from(encoded, "base64url");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf-8");
}

export interface FileStorageOptions {
  /**
   * Custom directory for storing agent data.
   * @default ~/.agent-auth
   */
  directory?: string;
  /**
   * Encryption key for private keys at rest.
   *
   * When set, private keys in host identity and agent connection files
   * are encrypted with AES-256-GCM before writing to disk and decrypted
   * transparently on read.
   *
   * Set via env: `AGENT_AUTH_ENCRYPTION_KEY`.
   * Existing unencrypted files are read normally and re-encrypted on
   * next write.
   */
  encryptionKey?: string;
}

/**
 * File-based storage that persists data to disk as JSON files.
 * Data is stored in ~/.agent-auth/ by default, organized as:
 *   host.json              — single host identity (shared across providers)
 *   agents/<agent-id>.json
 *   providers/<encoded-issuer>.json
 *
 * Private keys are encrypted at rest when an encryption key is provided.
 * Files containing secrets are written with mode 0o600.
 */
export class FileStorage implements Storage {
  private readonly dir: string;
  private readonly encKey: string | null;

  constructor(dir?: string, encryptionKey?: string) {
    this.dir = dir ?? DEFAULT_DIR;
    this.encKey =
      encryptionKey ??
      process.env.AGENT_AUTH_ENCRYPTION_KEY ??
      null;
    for (const sub of ["agents", "providers"]) {
      fs.mkdirSync(path.join(this.dir, sub), { recursive: true });
    }
    fs.mkdirSync(this.dir, { recursive: true });

    if (!this.encKey) {
      const hint = "Set AGENT_AUTH_ENCRYPTION_KEY or pass encryptionKey to FileStorage.";
      process.stderr.write(
        `[agent-auth] WARNING: Private keys will be stored unencrypted. ${hint}\n`,
      );
    }
  }

  private encode(key: string): string {
    return encodeURIComponent(key).replace(/%/g, "_");
  }

  private readJSON<T>(filePath: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    } catch {
      return null;
    }
  }

  private writeJSON(filePath: string, data: unknown, secret = false): void {
    const tmpPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), {
      encoding: "utf-8",
      mode: secret ? 0o600 : undefined,
    });
    fs.renameSync(tmpPath, filePath);
  }

  private deleteFile(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* noop */
    }
  }

  private listDir(dir: string): string[] {
    try {
      return fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
  }

  private encryptKeypair(keypair: unknown): unknown {
    if (!this.encKey) return keypair;
    return { __encrypted: encrypt(JSON.stringify(keypair), this.encKey) };
  }

  private decryptKeypair<T>(stored: unknown): T {
    if (
      stored &&
      typeof stored === "object" &&
      "__encrypted" in stored
    ) {
      if (!this.encKey) {
        throw new Error(
          "Private key is encrypted but no AGENT_AUTH_ENCRYPTION_KEY is set.",
        );
      }
      const raw = (stored as { __encrypted: string }).__encrypted;
      return JSON.parse(decrypt(raw, this.encKey)) as T;
    }
    return stored as T;
  }

  // ─── Host Identity ──────────────────────────────────────────

  private get hostPath(): string {
    return path.join(this.dir, "host.json");
  }

  async getHostIdentity(): Promise<HostIdentity | null> {
    const stored = this.readJSON<{
      keypair: unknown;
      createdAt: number;
    }>(this.hostPath);
    if (!stored) return null;
    return {
      ...stored,
      keypair: this.decryptKeypair(stored.keypair),
    } as HostIdentity;
  }

  async setHostIdentity(host: HostIdentity): Promise<void> {
    this.writeJSON(
      this.hostPath,
      { ...host, keypair: this.encryptKeypair(host.keypair) },
      true,
    );
  }

  async deleteHostIdentity(): Promise<void> {
    this.deleteFile(this.hostPath);
  }

  // ─── Agent Connection ───────────────────────────────────────

  async getAgentConnection(agentId: string): Promise<AgentConnection | null> {
    const stored = this.readJSON<AgentConnection & { agentKeypair: unknown }>(
      path.join(this.dir, "agents", `${this.encode(agentId)}.json`),
    );
    if (!stored) return null;
    return {
      ...stored,
      agentKeypair: this.decryptKeypair(stored.agentKeypair),
    } as AgentConnection;
  }

  async setAgentConnection(
    agentId: string,
    conn: AgentConnection,
  ): Promise<void> {
    this.writeJSON(
      path.join(this.dir, "agents", `${this.encode(agentId)}.json`),
      { ...conn, agentKeypair: this.encryptKeypair(conn.agentKeypair) },
      true,
    );
  }

  async deleteAgentConnection(agentId: string): Promise<void> {
    this.deleteFile(
      path.join(this.dir, "agents", `${this.encode(agentId)}.json`),
    );
  }

  async listAgentConnections(issuer: string): Promise<AgentConnection[]> {
    const files = this.listDir(path.join(this.dir, "agents"));
    const result: AgentConnection[] = [];
    for (const file of files) {
      const stored = this.readJSON<AgentConnection & { agentKeypair: unknown }>(
        path.join(this.dir, "agents", file),
      );
      if (stored && stored.issuer === issuer) {
        result.push({
          ...stored,
          agentKeypair: this.decryptKeypair(stored.agentKeypair),
        } as AgentConnection);
      }
    }
    return result;
  }

  // ─── Provider Config ────────────────────────────────────────

  async getProviderConfig(issuer: string): Promise<ProviderConfig | null> {
    return this.readJSON(
      path.join(this.dir, "providers", `${this.encode(issuer)}.json`),
    );
  }

  async setProviderConfig(
    issuer: string,
    config: ProviderConfig,
  ): Promise<void> {
    this.writeJSON(
      path.join(this.dir, "providers", `${this.encode(issuer)}.json`),
      config,
    );
  }

  async listProviderConfigs(): Promise<ProviderConfig[]> {
    const files = this.listDir(path.join(this.dir, "providers"));
    const result: ProviderConfig[] = [];
    for (const file of files) {
      const config = this.readJSON<ProviderConfig>(
        path.join(this.dir, "providers", file),
      );
      if (config) result.push(config);
    }
    return result;
  }
}
