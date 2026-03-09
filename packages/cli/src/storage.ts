import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
	AgentConnection,
	HostIdentity,
	ProviderConfig,
	Storage,
} from "@better-auth/agent-auth-sdk";

const DEFAULT_DIR = path.join(os.homedir(), ".agent-auth");

/**
 * File-based storage that persists data to disk as JSON files.
 * Data is stored in ~/.agent-auth/ by default, organized as:
 *   host.json              — single host identity (shared across providers)
 *   agents/<agent-id>.json
 *   providers/<encoded-issuer>.json
 */
export class FileStorage implements Storage {
	private readonly dir: string;

	constructor(dir?: string) {
		this.dir = dir ?? DEFAULT_DIR;
		for (const sub of ["agents", "providers"]) {
			fs.mkdirSync(path.join(this.dir, sub), { recursive: true });
		}
		fs.mkdirSync(this.dir, { recursive: true });
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

	private writeJSON(filePath: string, data: unknown): void {
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
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

	// ─── Host Identity ──────────────────────────────────────────

	private get hostPath(): string {
		return path.join(this.dir, "host.json");
	}

	async getHostIdentity(): Promise<HostIdentity | null> {
		return this.readJSON(this.hostPath);
	}

	async setHostIdentity(host: HostIdentity): Promise<void> {
		this.writeJSON(this.hostPath, host);
	}

	async deleteHostIdentity(): Promise<void> {
		this.deleteFile(this.hostPath);
	}

	// ─── Agent Connection ───────────────────────────────────────

	async getAgentConnection(agentId: string): Promise<AgentConnection | null> {
		return this.readJSON(
			path.join(this.dir, "agents", `${this.encode(agentId)}.json`),
		);
	}

	async setAgentConnection(
		agentId: string,
		conn: AgentConnection,
	): Promise<void> {
		this.writeJSON(
			path.join(this.dir, "agents", `${this.encode(agentId)}.json`),
			conn,
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
			const conn = this.readJSON<AgentConnection>(
				path.join(this.dir, "agents", file),
			);
			if (conn && conn.issuer === issuer) {
				result.push(conn);
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
