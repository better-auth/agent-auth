/**
 * Auto-detect names for the host (device) and the AI tool running on it.
 *
 * The host name is the device's friendly name — the host identity is
 * shared across all tools on the same machine (via shared file storage),
 * so including the tool name would be misleading.
 *
 * The tool name is detected separately and can be used for agent names.
 *
 * Examples (host):
 *   "Bereket's MacBook Pro"
 *   "ubuntu-server"
 *
 * Examples (tool):
 *   "Cursor"
 *   "Claude Code"
 *   "OpenCode"
 */

export interface ToolDetection {
	name: string;
	identifier?: string;
}

export function detectTool(): ToolDetection | null {
	const env = typeof process !== "undefined" ? process.env : {};

	if (env.CURSOR_SESSION_ID || env.CURSOR_TRACE_ID) {
		return { name: "Cursor", identifier: env.CURSOR_SESSION_ID };
	}

	if (env.CLAUDE_CODE === "1" || env.CLAUDE_CODE_ENTRYPOINT) {
		return { name: "Claude Code" };
	}

	if (env.OPENCODE === "1" || env.OPENCODE_SESSION_ID) {
		return { name: "OpenCode", identifier: env.OPENCODE_SESSION_ID };
	}

	if (
		env.WINDSURF_SESSION_ID ||
		env.WINDSURF_EXTENSION_ID ||
		env.CODEIUM_WINDSURF
	) {
		return { name: "Windsurf" };
	}

	if (env.CLINE_TASK_ID || env.CLINE === "1") {
		return { name: "Cline" };
	}

	if (env.AIDER === "1" || env.AIDER_SESSION) {
		return { name: "Aider" };
	}

	if (env.CONTINUE_GLOBAL_DIR || env.CONTINUE_SESSION_ID) {
		return { name: "Continue" };
	}

	if (env.CODEX_HOME || env.CODEX_SESSION_ID) {
		return { name: "Codex CLI" };
	}

	if (env.VSCODE_PID || env.VSCODE_IPC_HOOK) {
		return { name: "VS Code" };
	}

	return null;
}

/**
 * Try to get the user-friendly device name.
 *
 * - macOS: `scutil --get ComputerName` → "Bereket's MacBook Pro"
 * - Linux: falls through to os.hostname()
 * - Windows: COMPUTERNAME env var → "DESKTOP-ABC123"
 *
 * Falls back to os.hostname() if nothing better is available.
 */
function getDeviceName(): string | null {
	try {
		const env = typeof process !== "undefined" ? process.env : {};

		if (env.HOSTNAME && env.HOSTNAME !== "localhost") return env.HOSTNAME;
		if (env.COMPUTERNAME) return env.COMPUTERNAME;

		const { execSync } = require("node:child_process") as typeof import("node:child_process");
		const { hostname, platform } = require("node:os") as typeof import("node:os");
		const p = platform();

		if (p === "darwin") {
			try {
				const name = new TextDecoder()
					.decode(
						execSync("scutil --get ComputerName", {
							timeout: 1000,
							stdio: ["ignore", "pipe", "ignore"],
						}),
					)
					.trim();
				if (name) return name;
			} catch {
				// scutil failed, fall through
			}
		}

		const h = hostname();
		if (h && h !== "localhost") {
			return h;
		}
	} catch {
		// Not in a Node.js environment (edge, browser) or unexpected failure
	}
	return null;
}

/**
 * Auto-detect the host (device) name.
 *
 * Since the host identity is shared across all AI tools on the same
 * machine, this returns only the device name — not the tool name.
 */
export function detectHostName(): string | null {
	return getDeviceName();
}
