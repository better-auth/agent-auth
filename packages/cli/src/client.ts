import { exec } from "node:child_process";
import { AgentAuthClient } from "@better-auth/agent-auth-sdk";
import { FileStorage } from "./storage.js";

export interface ClientConfig {
	storageDir?: string;
	registryUrl?: string;
	hostName?: string;
	noBrowser?: boolean;
}

function openBrowser(url: string): void {
	const cmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "start"
				: "xdg-open";
	exec(`${cmd} ${JSON.stringify(url)}`);
}

export function createClient(config: ClientConfig = {}): AgentAuthClient {
	const storage = new FileStorage(config.storageDir);
	return new AgentAuthClient({
		storage,
		registryUrl: config.registryUrl ?? process.env.AGENT_AUTH_REGISTRY_URL,
		hostName: config.hostName ?? process.env.AGENT_AUTH_HOST_NAME,
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

export function getClientConfig(): ClientConfig {
	return {
		storageDir: process.env.AGENT_AUTH_STORAGE_DIR,
		registryUrl: process.env.AGENT_AUTH_REGISTRY_URL,
		hostName: process.env.AGENT_AUTH_HOST_NAME,
		noBrowser: process.env.AGENT_AUTH_NO_BROWSER === "1",
	};
}
