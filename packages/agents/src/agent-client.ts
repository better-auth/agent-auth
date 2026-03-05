import type { AgentJWK } from "./crypto";
import { generateAgentKeypair, hashRequestBody, signAgentJWT } from "./crypto";
import { detectHostName } from "./host-name";
import type { AgentSession } from "./types";

export type { AgentJWK } from "./crypto";
export {
	generateAgentKeypair as generateKeypair,
	signAgentJWT,
} from "./crypto";

/**
 * Open a URL in the user's browser.
 *
 * - **Browser**: uses `window.open` (popup) with `window.location` fallback
 * - **Node.js**: shells out to `open` / `xdg-open` / `start`
 */
export async function openInBrowser(url: string): Promise<void> {
	if (typeof globalThis.window !== "undefined") {
		const w = globalThis.window.open(url, "_blank", "noopener,noreferrer");
		if (!w) globalThis.window.location.href = url;
		return;
	}
	const { exec } = await import("node:child_process");
	const { platform } = await import("node:os");
	const cmd =
		platform() === "darwin"
			? "open"
			: platform() === "win32"
				? "start"
				: "xdg-open";
	exec(`${cmd} "${url}"`);
}

// =========================================================================
// DEVICE AUTH CONNECT FLOW
// =========================================================================

export interface ConnectAgentOptions {
	/** Base URL of the app (e.g. "https://app-x.com") */
	appURL: string;
	/** Agent name. Default: "Agent" */
	name?: string;
	/** Scopes to request. */
	scopes?: string[];
	/** Role to request. */
	role?: string;
	/** Pre-generated keypair. If not provided, one will be generated. */
	keypair?: {
		publicKey: AgentJWK;
		privateKey: AgentJWK;
		kid: string;
	};
	/** Client ID for the device auth flow. Default: "agent-auth" */
	clientId?: string;
	/** Polling interval in ms. Default: 5000 */
	pollInterval?: number;
	/** Max wait time in ms before giving up. Default: 300000 (5 min) */
	timeout?: number;
	/**
	 * Called when the user code is ready.
	 * Show this to the user so they can approve in their browser.
	 */
	onUserCode?: (info: {
		userCode: string;
		verificationUri: string;
		verificationUriComplete: string;
		expiresIn: number;
	}) => void;
	/**
	 * Called on each poll attempt.
	 * Useful for showing a spinner or progress indicator.
	 */
	onPoll?: (attempt: number) => void;
	/**
	 * Automatically open the verification URL in the user's default browser.
	 * Uses the `verification_uri_complete` (with user code pre-filled).
	 * Default: true
	 */
	openBrowser?: boolean;
	/**
	 * Human-readable host name identifying the environment/device.
	 * Auto-detected if not provided. Set to `false` to disable.
	 */
	hostName?: string | false;
}

export interface ConnectAgentResult {
	agentId: string;
	name: string;
	scopes: string[];
	publicKey: AgentJWK;
	privateKey: AgentJWK;
	kid: string;
}

/**
 * Connect an agent to an app using the device authorization flow.
 *
 * 1. Generates a keypair (or uses the provided one)
 * 2. Requests a device code from the app
 * 3. Calls onUserCode so you can show the code to the user
 * 4. Polls until the user approves (or times out)
 * 5. Uses the session token to register the agent's public key
 * 6. Returns the agent ID, keypair, and scopes
 *
 * The app must have both `agentAuth()` and `deviceAuthorization()` plugins enabled.
 */
export async function connectAgent(
	options: ConnectAgentOptions,
): Promise<ConnectAgentResult> {
	const {
		appURL,
		name = "Agent",
		scopes = [],
		role,
		clientId = "agent-auth",
		pollInterval = 5000,
		timeout = 300_000,
		onUserCode,
		onPoll,
		openBrowser = true,
	} = options;

	const resolvedHostName =
		options.hostName === false ? null : (options.hostName ?? detectHostName());

	const base = appURL.replace(/\/+$/, "");

	// Step 1: Generate or reuse keypair
	const keypair = options.keypair ?? (await generateAgentKeypair());

	// Step 2: Request a device code
	const codeRes = await globalThis.fetch(`${base}/api/auth/device/code`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_id: clientId,
			scope: scopes.join(" "),
		}),
	});

	if (!codeRes.ok) {
		const err = await codeRes.text();
		throw new Error(`Failed to request device code: ${err}`);
	}

	const codeData = (await codeRes.json()) as {
		device_code: string;
		user_code: string;
		verification_uri: string;
		verification_uri_complete: string;
		expires_in: number;
		interval: number;
	};

	// Step 3: Notify caller to show the code
	if (onUserCode) {
		onUserCode({
			userCode: codeData.user_code,
			verificationUri: codeData.verification_uri,
			verificationUriComplete: codeData.verification_uri_complete,
			expiresIn: codeData.expires_in,
		});
	}

	// Step 3b: Auto-open browser if requested
	if (openBrowser) {
		openInBrowser(codeData.verification_uri_complete).catch(() => {});
	}

	// Step 4: Poll for approval
	const effectiveInterval = Math.max(pollInterval, codeData.interval * 1000);
	const deadline = Date.now() + timeout;
	let attempt = 0;
	let accessToken: string | null = null;

	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, effectiveInterval));
		attempt++;
		if (onPoll) onPoll(attempt);

		const tokenRes = await globalThis.fetch(`${base}/api/auth/device/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: codeData.device_code,
				client_id: clientId,
			}),
		});

		if (tokenRes.ok) {
			const tokenData = (await tokenRes.json()) as {
				access_token: string;
			};
			accessToken = tokenData.access_token;
			break;
		}

		const errorData = (await tokenRes.json()) as {
			error: string;
			error_description?: string;
		};

		if (errorData.error === "authorization_pending") {
			continue;
		}
		if (errorData.error === "slow_down") {
			// Back off by adding the interval
			await new Promise((resolve) => setTimeout(resolve, effectiveInterval));
			continue;
		}
		if (errorData.error === "access_denied") {
			throw new Error("User denied the agent connection.");
		}
		if (errorData.error === "expired_token") {
			throw new Error("Device code expired. Please try again.");
		}

		throw new Error(
			`Device auth failed: ${errorData.error} — ${errorData.error_description ?? ""}`,
		);
	}

	if (!accessToken) {
		throw new Error("Timed out waiting for user approval.");
	}

	// Step 5: Register the agent with the app using the session token
	const registerBody: Record<string, unknown> = {
		name,
		publicKey: keypair.publicKey,
		scopes,
		role,
	};
	if (resolvedHostName) {
		registerBody.hostName = resolvedHostName;
	}
	const createRes = await globalThis.fetch(`${base}/api/auth/agent/register`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify(registerBody),
	});

	if (!createRes.ok) {
		const err = await createRes.text();
		throw new Error(`Failed to register agent: ${err}`);
	}

	const createData = (await createRes.json()) as {
		agent_id: string;
		name: string;
		scopes: string[];
	};

	return {
		agentId: createData.agent_id,
		name: createData.name,
		scopes: createData.scopes,
		publicKey: keypair.publicKey,
		privateKey: keypair.privateKey,
		kid: keypair.kid,
	};
}

// =========================================================================
// CIBA CONNECT FLOW
// =========================================================================

export interface ConnectAgentViaCibaOptions {
	/** Base URL of the app (e.g. "https://app-x.com") */
	appURL: string;
	/** User identifier (email) to send the authentication request to. */
	loginHint: string;
	/** Agent name. Default: "Agent" */
	name?: string;
	/** Scopes to request. */
	scopes?: string[];
	/** Role to request. */
	role?: string;
	/** Pre-generated keypair. If not provided, one will be generated. */
	keypair?: {
		publicKey: AgentJWK;
		privateKey: AgentJWK;
		kid: string;
	};
	/** Client ID. Default: "agent-auth" */
	clientId?: string;
	/** Polling interval in ms. Default: 5000 */
	pollInterval?: number;
	/** Max wait time in ms before giving up. Default: 300000 (5 min) */
	timeout?: number;
	/** Human-readable binding message shown to the user during approval. */
	bindingMessage?: string;
	/**
	 * Called when the CIBA auth request is created.
	 * The user must approve it (e.g. in their dashboard).
	 */
	onAuthRequest?: (info: {
		authReqId: string;
		expiresIn: number;
		interval: number;
	}) => void;
	/**
	 * Called on each poll attempt.
	 */
	onPoll?: (attempt: number) => void;
	/**
	 * Human-readable host name identifying the environment/device.
	 * Auto-detected if not provided. Set to `false` to disable.
	 */
	hostName?: string | false;
}

/**
 * Connect an agent to an app using the CIBA (Client Initiated Backchannel
 * Authentication) flow.
 */
export async function connectAgentViaCiba(
	options: ConnectAgentViaCibaOptions,
): Promise<ConnectAgentResult> {
	const {
		appURL,
		loginHint,
		name = "Agent",
		scopes = [],
		role,
		clientId = "agent-auth",
		pollInterval = 5000,
		timeout = 300_000,
		bindingMessage,
		onAuthRequest,
		onPoll,
	} = options;

	const resolvedCibaHostName =
		options.hostName === false ? null : (options.hostName ?? detectHostName());

	const base = appURL.replace(/\/+$/, "");

	const keypair = options.keypair ?? (await generateAgentKeypair());

	const authRes = await globalThis.fetch(
		`${base}/api/auth/agent/ciba/authorize`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				login_hint: loginHint,
				scope: scopes.join(" "),
				client_id: clientId,
				binding_message:
					bindingMessage ?? `Agent "${name}" requesting connection`,
			}),
		},
	);

	if (!authRes.ok) {
		const err = await authRes.text();
		throw new Error(`Failed to initiate CIBA request: ${err}`);
	}

	const authData = (await authRes.json()) as {
		auth_req_id: string;
		expires_in: number;
		interval: number;
	};

	if (onAuthRequest) {
		onAuthRequest({
			authReqId: authData.auth_req_id,
			expiresIn: authData.expires_in,
			interval: authData.interval,
		});
	}

	const effectiveInterval = Math.max(pollInterval, authData.interval * 1000);
	const deadline = Date.now() + timeout;
	let attempt = 0;
	let accessToken: string | null = null;

	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, effectiveInterval));
		attempt++;
		if (onPoll) onPoll(attempt);

		const tokenRes = await globalThis.fetch(
			`${base}/api/auth/agent/ciba/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					grant_type: "urn:openid:params:grant-type:ciba",
					auth_req_id: authData.auth_req_id,
					client_id: clientId,
				}),
			},
		);

		if (tokenRes.ok) {
			const tokenData = (await tokenRes.json()) as {
				access_token: string;
			};
			accessToken = tokenData.access_token;
			break;
		}

		const errorData = (await tokenRes.json()) as {
			error: string;
			error_description?: string;
		};

		if (errorData.error === "authorization_pending") {
			continue;
		}
		if (errorData.error === "slow_down") {
			await new Promise((resolve) => setTimeout(resolve, effectiveInterval));
			continue;
		}
		if (errorData.error === "access_denied") {
			throw new Error("User denied the agent connection.");
		}
		if (errorData.error === "expired_token") {
			throw new Error("CIBA request expired. Please try again.");
		}

		throw new Error(
			`CIBA auth failed: ${errorData.error} — ${errorData.error_description ?? ""}`,
		);
	}

	if (!accessToken) {
		throw new Error("Timed out waiting for user approval.");
	}

	const cibaRegisterBody: Record<string, unknown> = {
		name,
		publicKey: keypair.publicKey,
		scopes,
		role,
	};
	if (resolvedCibaHostName) {
		cibaRegisterBody.hostName = resolvedCibaHostName;
	}
	const createRes = await globalThis.fetch(`${base}/api/auth/agent/register`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify(cibaRegisterBody),
	});

	if (!createRes.ok) {
		const err = await createRes.text();
		throw new Error(`Failed to register agent: ${err}`);
	}

	const createData = (await createRes.json()) as {
		agent_id: string;
		name: string;
		scopes: string[];
	};

	return {
		agentId: createData.agent_id,
		name: createData.name,
		scopes: createData.scopes,
		publicKey: keypair.publicKey,
		privateKey: keypair.privateKey,
		kid: keypair.kid,
	};
}

// =========================================================================
// ENROLLMENT TOKEN FLOW
// =========================================================================

export interface EnrollHostOptions {
	/** Base URL of the app (e.g. "https://app-x.com") */
	appURL: string;
	/** One-time enrollment token from the dashboard. */
	token: string;
	/**
	 * Human-readable host name identifying the environment/device.
	 * Auto-detected if not provided. Set to `false` to disable.
	 */
	hostName?: string | false;
}

export interface EnrollHostResult {
	hostId: string;
	name: string | null;
	scopes: string[];
	publicKey: AgentJWK;
	privateKey: AgentJWK;
	kid: string;
}

/**
 * Enroll a device as a host using a one-time enrollment token.
 *
 * 1. Generates an Ed25519 keypair locally
 * 2. Sends the public key + enrollment token to the server
 * 3. Server validates token, activates the host, clears the token
 * 4. Returns the host ID, scopes, and keypair for local storage
 *
 * Use this after provisioning a host from the dashboard.
 * The private key never leaves the device.
 */
export async function enrollHost(
	options: EnrollHostOptions,
): Promise<EnrollHostResult> {
	const { appURL, token } = options;

	const resolvedHostName =
		options.hostName === false ? null : (options.hostName ?? detectHostName());

	const base = appURL.replace(/\/+$/, "");
	const keypair = await generateAgentKeypair();

	const enrollBody: Record<string, unknown> = {
		token,
		publicKey: keypair.publicKey,
	};
	if (resolvedHostName) {
		enrollBody.name = resolvedHostName;
	}

	const res = await globalThis.fetch(`${base}/api/auth/agent/host/enroll`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(enrollBody),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Host enrollment failed: ${err}`);
	}

	const data = (await res.json()) as {
		hostId: string;
		name: string | null;
		scopes: string[];
		status: string;
	};

	return {
		hostId: data.hostId,
		name: data.name,
		scopes: data.scopes,
		publicKey: keypair.publicKey,
		privateKey: keypair.privateKey,
		kid: keypair.kid,
	};
}

export interface AgentClientOptions {
	/** Base URL of the app (e.g. "https://app-x.com") */
	baseURL: string;
	/** The agent's ID (returned from /agent/register) */
	agentId: string;
	/** The agent's Ed25519 private key as JWK */
	privateKey: AgentJWK;
	/** JWT expiration in seconds. Default: 60 */
	jwtExpiresIn?: number;
	/** JWT claim format. Default: "simple" */
	jwtFormat?: "simple" | "aap";
}

/**
 * Create an authenticated client for an agent runtime.
 *
 * Signs a fresh JWT for every request using the agent's private key.
 * The JWT is short-lived (default 60s) and includes the agent's ID as `sub`.
 */
export function createAgentClient(options: AgentClientOptions) {
	const {
		baseURL,
		agentId,
		privateKey,
		jwtExpiresIn = 60,
		jwtFormat = "simple",
	} = options;

	const base = baseURL.replace(/\/+$/, "");
	const audience = new URL(base).origin;

	async function signRequest(
		method: string,
		path: string,
		body?: string,
	): Promise<string> {
		const bodyHash = body ? await hashRequestBody(body) : undefined;
		const jwt = await signAgentJWT({
			agentId,
			privateKey,
			audience,
			expiresIn: jwtExpiresIn,
			format: jwtFormat,
			requestBinding: { method: method.toUpperCase(), path, bodyHash },
		});
		return `Bearer ${jwt}`;
	}

	return {
		/**
		 * Make an authenticated fetch to the app.
		 * Automatically signs a request-bound JWT and attaches it as a Bearer token.
		 */
		async fetch(path: string, init?: RequestInit): Promise<Response> {
			const url = path.startsWith("http") ? path : `${base}${path}`;
			const requestPath = path.startsWith("http")
				? new URL(path).pathname
				: path;
			const method = init?.method ?? "GET";
			const body = typeof init?.body === "string" ? init.body : undefined;
			const auth = await signRequest(method, requestPath, body);
			return globalThis.fetch(url, {
				...init,
				headers: {
					...init?.headers,
					Authorization: auth,
				},
			});
		},

		/**
		 * Resolve the agent's own session by calling GET /api/auth/agent/get-session.
		 * Returns the agent session or null if auth fails.
		 */
		async getSession(): Promise<AgentSession | null> {
			const sessionPath = "/api/auth/agent/get-session";
			const auth = await signRequest("GET", sessionPath);
			const res = await globalThis.fetch(`${base}${sessionPath}`, {
				headers: { Authorization: auth },
			});
			if (!res.ok) return null;
			return res.json();
		},

		/** The base URL this client is configured for */
		baseURL: base,

		/** The agent ID this client authenticates as */
		agentId,
	};
}
