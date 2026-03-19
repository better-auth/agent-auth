import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { AgentAuthClient } from "@auth/agent";
import { FileStorage } from "./storage.js";

export interface ClientConfig {
  storageDir?: string;
  directoryUrl?: string;
  hostName?: string;
  noBrowser?: boolean;
  providers?: Array<Record<string, unknown>>;
  urls?: string[];
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}

export function createClient(config: ClientConfig = {}): AgentAuthClient {
  const storage = new FileStorage(config.storageDir);
  return new AgentAuthClient({
    storage,
    directoryUrl: config.directoryUrl ?? process.env.AGENT_AUTH_DIRECTORY_URL,
    hostName: config.hostName ?? process.env.AGENT_AUTH_HOST_NAME,
    providers: config.providers as any,
    onApprovalRequired(info) {
      const url = info.verification_uri_complete ?? info.verification_uri;
      if (url) {
        if (config.noBrowser) {
          console.error(`\nApproval required. Open: ${url}`);
        } else {
          console.error(`\nApproval required — opening browser…`);
          openBrowser(url);
        }
        if (info.user_code) {
          console.error(`  Code: ${info.user_code}`);
        }
      } else {
        console.error(`\nApproval required (method: ${info.method}). Waiting…`);
      }
    },
    onApprovalStatusChange(status) {
      console.error(`  Status: ${status}`);
    },
  });
}

function normalizeProviders(raw: unknown): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return [raw as Record<string, unknown>];
  return undefined;
}

function loadProviders(): Array<Record<string, unknown>> | undefined {
  const filePath = process.env.AGENT_AUTH_PROVIDERS_FILE;
  if (filePath) {
    try {
      return normalizeProviders(JSON.parse(readFileSync(filePath, "utf-8")));
    } catch (err) {
      console.error(`Warning: could not load providers from ${filePath}:`, err);
    }
  }
  if (process.env.AGENT_AUTH_PROVIDERS) {
    try {
      return normalizeProviders(JSON.parse(process.env.AGENT_AUTH_PROVIDERS));
    } catch {
      console.error("Warning: could not parse AGENT_AUTH_PROVIDERS env var");
    }
  }
  return undefined;
}

function loadUrls(): string[] | undefined {
  const raw = process.env.AGENT_AUTH_URLS;
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

export function getClientConfig(): ClientConfig {
  return {
    storageDir: process.env.AGENT_AUTH_STORAGE_DIR,
    directoryUrl: process.env.AGENT_AUTH_DIRECTORY_URL,
    hostName: process.env.AGENT_AUTH_HOST_NAME,
    noBrowser: process.env.AGENT_AUTH_NO_BROWSER === "1",
    providers: loadProviders(),
    urls: loadUrls(),
  };
}
