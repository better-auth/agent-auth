import { generateKeypair, signAgentJWT, signHostJWT } from "./crypto";
import { discoverProvider, searchProviders } from "./discovery";
import { executeHttpCapability } from "./http";
import { MemoryStorage } from "./storage";
import type {
	AgentAuthClientOptions,
	AgentConnection,
	AgentMode,
	AgentStatus,
	ApprovalInfo,
	CapabilitiesResponse,
	Capability,
	CapabilityGrant,
	EnrollHostResponse,
	ExecuteCapabilityResponse,
	HostIdentity,
	Keypair,
	ProviderConfig,
	ProviderInfo,
	RegisterResponse,
	RequestCapabilityResponse,
	StatusResponse,
	Storage,
} from "./types";
import { AgentAuthSDKError } from "./types";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
			},
			{ once: true },
		);
	});
}

/**
 * Agent Auth SDK client — §7.
 *
 * Manages host identities, agent connections, JWT signing,
 * discovery, registration, approval flows, and capability execution.
 */
export class AgentAuthClient {
	private readonly storage: Storage;
	private readonly fetchFn: typeof globalThis.fetch;
	private readonly registryUrl: string | null;
	private readonly jwtExpirySeconds: number;
	private readonly hostName: string | null;
	private readonly onApprovalRequired:
		| ((info: ApprovalInfo) => void | Promise<void>)
		| null;
	private readonly onApprovalStatusChange:
		| ((status: AgentStatus) => void | Promise<void>)
		| null;
	private readonly approvalTimeoutMs: number;
	private readonly abortController: AbortController;

	constructor(opts: AgentAuthClientOptions = {}) {
		this.storage = opts.storage ?? new MemoryStorage();
		this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
		this.registryUrl = opts.registryUrl ?? null;
		this.jwtExpirySeconds = opts.jwtExpirySeconds ?? 60;
		this.hostName = opts.hostName ?? null;
		this.onApprovalRequired = opts.onApprovalRequired ?? null;
		this.onApprovalStatusChange = opts.onApprovalStatusChange ?? null;
		this.approvalTimeoutMs = opts.approvalTimeoutMs ?? 300_000;
		this.abortController = new AbortController();

		if (opts.providers) {
			for (const p of opts.providers) {
				void this.storage.setProviderConfig(p.issuer, p);
			}
		}
	}

	/**
	 * Cancel all in-flight polling loops (approval, async execution)
	 * and prevent new ones from starting. Call this when tearing down
	 * the client (e.g. MCP server shutdown, process exit).
	 */
	destroy(): void {
		this.abortController.abort(
			new AgentAuthSDKError("client_destroyed", "Client was destroyed."),
		);
	}

	// ─── Discovery (§7.1) ───────────────────────────────────────

	/**
	 * List providers — §7.1.1.
	 * Returns all providers the client has discovered or been pre-configured with.
	 */
	async listProviders(): Promise<ProviderInfo[]> {
		const configs = await this.storage.listProviderConfigs();
		return configs.map((c) => ({
			name: c.provider_name,
			description: c.description,
			issuer: c.issuer,
		}));
	}

	/**
	 * Search a registry for providers by intent — §7.1.2.
	 */
	async searchProviders(intent: string): Promise<ProviderInfo[]> {
		if (!this.registryUrl) {
			throw new AgentAuthSDKError(
				"no_registry",
				"No registry URL configured. Set registryUrl in client options.",
			);
		}
		return searchProviders(this.registryUrl, intent, {
			fetchFn: this.fetchFn,
		});
	}

	/**
	 * Discover a provider from a service URL — §7.1.3.
	 * Fetches and caches the discovery document.
	 */
	async discoverProvider(url: string): Promise<ProviderConfig> {
		const config = await discoverProvider(url, this.fetchFn);
		await this.storage.setProviderConfig(config.issuer, config);
		return config;
	}

	// ─── Capabilities (§7.2) ────────────────────────────────────

	/**
	 * List capabilities — §7.2.
	 */
	async listCapabilities(opts: {
		provider: string;
		query?: string;
		agentId?: string;
		cursor?: string;
	}): Promise<CapabilitiesResponse> {
		const config = await this.resolveConfig(opts.provider);
		const capPath = config.endpoints.capabilities ?? "/capability/list";
		const url = new URL(capPath, config.issuer);
		if (opts.query) url.searchParams.set("query", opts.query);
		if (opts.cursor) url.searchParams.set("cursor", opts.cursor);

		const headers: Record<string, string> = {
			accept: "application/json",
		};

		if (opts.agentId) {
			const token = await this.signJwt({ agentId: opts.agentId });
			headers.authorization = `Bearer ${token.token}`;
		}

		const res = await this.fetchFn(url.toString(), { method: "GET", headers });
		if (!res.ok) {
			throw await this.toError(res);
		}
		return (await res.json()) as CapabilitiesResponse;
	}

	// ─── Connection (§7.3) ──────────────────────────────────────

	/**
	 * Connect an agent to a service — §7.3.
	 *
	 * Generates an agent keypair, registers the agent on the server
	 * via host JWT, handles approval if needed, and stores the connection.
	 */
	async connectAgent(opts: {
		provider: string;
		capabilities?: string[];
		mode?: AgentMode;
		reason?: string;
		preferredMethod?: string;
		name?: string;
		/**
		 * Per-call abort signal. When aborted, the approval polling
		 * loop exits immediately. Combined with the client-level
		 * abort controller.
		 */
		signal?: AbortSignal;
	}): Promise<{
		agentId: string;
		hostId: string;
		status: AgentStatus;
		capabilityGrants: CapabilityGrant[];
		approval?: ApprovalInfo;
	}> {
		const config = await this.resolveConfig(opts.provider);
		const host = await this.resolveHost(config);
		const agentKeypair = await generateKeypair();

		const hostJWT = await signHostJWT({
			hostKeypair: host.keypair,
			subject: host.hostId ?? `host-${globalThis.crypto.randomUUID()}`,
			audience: config.issuer,
			agentPublicKey: agentKeypair.publicKey,
			hostName: this.hostName ?? undefined,
		});

		const registerUrl = this.resolveEndpoint(config, "register", "/agent/register");

		const body: Record<string, unknown> = {
			name: opts.name ?? `agent-${Date.now()}`,
			mode: opts.mode ?? "delegated",
		};
		if (opts.capabilities) body.capabilities = opts.capabilities;
		if (opts.reason) body.reason = opts.reason;
		if (opts.preferredMethod) body.preferred_method = opts.preferredMethod;

		const res = await this.fetchFn(registerUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${hostJWT}`,
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const regBody = (await res.json()) as RegisterResponse;

		if (!host.hostId && regBody.host_id) {
			host.hostId = regBody.host_id;
			await this.storage.setHostIdentity(config.issuer, host);
		}

		const connection: AgentConnection = {
			agentId: regBody.agent_id,
			hostId: regBody.host_id,
			providerName: config.provider_name,
			issuer: config.issuer,
			mode: regBody.mode,
			agentKeypair,
			capabilityGrants: regBody.agent_capability_grants,
			createdAt: Date.now(),
		};

		await this.storage.setAgentConnection(regBody.agent_id, connection);

		if (regBody.status === "pending" && regBody.approval) {
			const finalStatus = await this.waitForApproval(
				config,
				host,
				regBody.agent_id,
				regBody.approval,
				{ signal: opts.signal },
			);

			connection.capabilityGrants = finalStatus.agent_capability_grants;
			await this.storage.setAgentConnection(regBody.agent_id, connection);

			return {
				agentId: regBody.agent_id,
				hostId: regBody.host_id,
				status: finalStatus.status,
				capabilityGrants: finalStatus.agent_capability_grants,
			};
		}

		return {
			agentId: regBody.agent_id,
			hostId: regBody.host_id,
			status: regBody.status,
			capabilityGrants: regBody.agent_capability_grants,
		};
	}

	// ─── JWT Signing (§7.4) ─────────────────────────────────────

	/**
	 * Sign an agent JWT — §7.4.
	 * Returns a short-lived token for authenticating capability execution.
	 */
	async signJwt(opts: {
		agentId: string;
		capabilities?: string[];
		/** HTTP method for DPoP request binding (§5.3). */
		htm?: string;
		/** HTTP target URI for DPoP request binding (§5.3). */
		htu?: string;
		/** Access token hash for DPoP request binding (§5.3). */
		ath?: string;
	}): Promise<{ token: string; expiresAt: number }> {
		const conn = await this.storage.getAgentConnection(opts.agentId);
		if (!conn) {
			throw new AgentAuthSDKError(
				"agent_not_found",
				`No local connection for agent ${opts.agentId}. Call connectAgent first.`,
			);
		}

		if (opts.capabilities) {
			const granted = new Set(
				conn.capabilityGrants
					.filter((g) => g.status === "active")
					.map((g) => g.capability),
			);
			for (const id of opts.capabilities) {
				if (!granted.has(id)) {
					throw new AgentAuthSDKError(
						"capability_not_granted",
						`Capability "${id}" is not granted to agent ${opts.agentId}.`,
					);
				}
			}
		}

		const token = await signAgentJWT({
			agentKeypair: conn.agentKeypair,
			agentId: conn.agentId,
			audience: conn.issuer,
			capabilities: opts.capabilities,
			htm: opts.htm,
			htu: opts.htu,
			ath: opts.ath,
			expiresInSeconds: this.jwtExpirySeconds,
		});

		return {
			token,
			expiresAt: Math.floor(Date.now() / 1000) + this.jwtExpirySeconds,
		};
	}

	// ─── Capability Escalation (§7.5) ───────────────────────────

	/**
	 * Request additional capabilities — §7.5.
	 */
	async requestCapability(opts: {
		agentId: string;
		capabilities: string[];
		reason?: string;
		preferredMethod?: string;
		signal?: AbortSignal;
	}): Promise<{
		granted: string[];
		pending: string[];
		denied: string[];
	}> {
		const conn = await this.requireConnection(opts.agentId);
		const config = await this.requireConfig(conn.issuer);

		const token = await this.signJwt({ agentId: opts.agentId });
		const url = this.resolveEndpoint(
			config,
			"request_capability",
			"/agent/request-capability",
		);

		const body: Record<string, unknown> = {
			capabilities: opts.capabilities,
		};
		if (opts.reason) body.reason = opts.reason;
		if (opts.preferredMethod) body.preferred_method = opts.preferredMethod;

		const res = await this.fetchFn(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token.token}`,
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const resBody = (await res.json()) as RequestCapabilityResponse;

		if (resBody.status === "pending" && resBody.approval) {
			const host = await this.storage.getHostIdentity(conn.issuer);
			if (host) {
				const finalStatus = await this.waitForApproval(
					config,
					host,
					opts.agentId,
					resBody.approval,
					{ signal: opts.signal },
				);
				conn.capabilityGrants = finalStatus.agent_capability_grants;
				await this.storage.setAgentConnection(opts.agentId, conn);
			}
		} else {
			conn.capabilityGrants = resBody.agent_capability_grants;
			await this.storage.setAgentConnection(opts.agentId, conn);
		}

		const finalConn = await this.storage.getAgentConnection(opts.agentId);
		const grants = finalConn?.capabilityGrants ?? resBody.agent_capability_grants;

		return {
			granted: grants.filter((g) => g.status === "active").map((g) => g.capability),
			pending: grants.filter((g) => g.status === "pending").map((g) => g.capability),
			denied: grants.filter((g) => g.status === "denied").map((g) => g.capability),
		};
	}

	// ─── Disconnect (§7.6) ──────────────────────────────────────

	/**
	 * Disconnect (revoke) an agent — §7.6.
	 * Revokes on the server and removes the local connection.
	 */
	async disconnectAgent(agentId: string): Promise<void> {
		const conn = await this.requireConnection(agentId);
		const config = await this.requireConfig(conn.issuer);
		const host = await this.storage.getHostIdentity(conn.issuer);

		if (host) {
			const hostJWT = await signHostJWT({
				hostKeypair: host.keypair,
				subject: host.hostId ?? conn.hostId,
				audience: config.issuer,
			});

			const url = this.resolveEndpoint(config, "revoke", "/agent/revoke");

			try {
				await this.fetchFn(url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${hostJWT}`,
					},
					body: JSON.stringify({ agent_id: agentId }),
				});
			} catch {
				// Best-effort revocation — still remove locally
			}
		}

		await this.storage.deleteAgentConnection(agentId);
	}

	// ─── Reactivate (§7.7) ──────────────────────────────────────

	/**
	 * Reactivate an expired agent — §7.7.
	 */
	async reactivateAgent(agentId: string, opts?: { signal?: AbortSignal }): Promise<{
		agentId: string;
		status: AgentStatus;
		capabilityGrants: CapabilityGrant[];
	}> {
		const conn = await this.requireConnection(agentId);
		const config = await this.requireConfig(conn.issuer);
		const host = await this.requireHost(conn.issuer);

		const hostJWT = await signHostJWT({
			hostKeypair: host.keypair,
			subject: host.hostId ?? conn.hostId,
			audience: config.issuer,
		});

		const url = this.resolveEndpoint(config, "reactivate", "/agent/reactivate");

		const res = await this.fetchFn(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${hostJWT}`,
			},
			body: JSON.stringify({ agent_id: agentId }),
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const body = (await res.json()) as RegisterResponse;

		if (body.status === "pending" && body.approval) {
			const finalStatus = await this.waitForApproval(
				config,
				host,
				agentId,
				body.approval,
				{ signal: opts?.signal },
			);

			conn.capabilityGrants = finalStatus.agent_capability_grants;
			await this.storage.setAgentConnection(agentId, conn);

			return {
				agentId,
				status: finalStatus.status,
				capabilityGrants: finalStatus.agent_capability_grants,
			};
		}

		conn.capabilityGrants = body.agent_capability_grants;
		await this.storage.setAgentConnection(agentId, conn);

		return {
			agentId,
			status: body.status,
			capabilityGrants: body.agent_capability_grants,
		};
	}

	// ─── Status (§7.8) ──────────────────────────────────────────

	/**
	 * Check agent status — §7.8.
	 */
	async agentStatus(agentId: string): Promise<StatusResponse> {
		const conn = await this.requireConnection(agentId);
		const config = await this.requireConfig(conn.issuer);
		const host = await this.requireHost(conn.issuer);

		const hostJWT = await signHostJWT({
			hostKeypair: host.keypair,
			subject: host.hostId ?? conn.hostId,
			audience: config.issuer,
		});

		const statusPath = config.endpoints.status ?? "/agent/status";
		const url = new URL(statusPath, config.issuer);
		url.searchParams.set("agent_id", agentId);

		const res = await this.fetchFn(url.toString(), {
			method: "GET",
			headers: {
				accept: "application/json",
				authorization: `Bearer ${hostJWT}`,
			},
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const status = (await res.json()) as StatusResponse;

		conn.capabilityGrants = status.agent_capability_grants;
		await this.storage.setAgentConnection(agentId, conn);

		return status;
	}

	// ─── Execute Capability (§7.9) ──────────────────────────────

	/**
	 * Execute a capability through the server's execute endpoint — §7.9.
	 *
	 * Signs a scoped agent JWT and sends `capability` + `arguments`
	 * to `POST /capabilities/execute`. The server validates the JWT,
	 * checks grants, executes the capability, and returns the result.
	 *
	 * For async responses, polls the `status_url` until completion.
	 */
	async executeCapability(opts: {
		agentId: string;
		capability: string;
		arguments?: Record<string, unknown>;
	}): Promise<ExecuteCapabilityResponse> {
		const conn = await this.requireConnection(opts.agentId);
		const config = await this.requireConfig(conn.issuer);

		const token = await this.signJwt({
			agentId: opts.agentId,
			capabilities: [opts.capability],
		});

		const url = this.resolveEndpoint(
			config,
			"execute",
			"/capability/execute",
		);

		const res = await this.fetchFn(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token.token}`,
			},
			body: JSON.stringify({
				capability: opts.capability,
				...(opts.arguments ? { arguments: opts.arguments } : {}),
			}),
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const body = (await res.json()) as ExecuteCapabilityResponse;

		if (body.status === "pending" && body.status_url) {
			return this.pollAsyncResult(
				body.status_url,
				token.token,
			);
		}

		return body;
	}

	// ─── Direct HTTP Execution (§4.2) ───────────────────────────

	/**
	 * Execute a capability via direct HTTP call — §4.2.
	 *
	 * Uses the capability's `http` descriptor to construct and send
	 * an HTTP request directly to the service endpoint. This bypasses
	 * the server's execute endpoint. Prefer `executeCapability` unless
	 * you have a specific reason for direct execution.
	 */
	async httpRequest(opts: {
		agentId: string;
		capability: string;
		arguments?: Record<string, unknown>;
	}): Promise<{
		status: number;
		headers: Record<string, string>;
		body: unknown;
	}> {
		const conn = await this.requireConnection(opts.agentId);
		const config = await this.requireConfig(conn.issuer);

		const capRes = await this.listCapabilities({
			provider: config.provider_name,
			agentId: opts.agentId,
		});

		const capabilityDef = capRes.capabilities.find(
			(c) => c.name === opts.capability,
		);
		if (!capabilityDef) {
			throw new AgentAuthSDKError(
				"capability_not_found",
				`Capability "${opts.capability}" not found on ${config.provider_name}.`,
			);
		}
		if (!capabilityDef.http) {
			throw new AgentAuthSDKError(
				"no_http_profile",
				`Capability "${opts.capability}" does not have an http execution profile.`,
			);
		}

		const token = await this.signJwt({
			agentId: opts.agentId,
			capabilities: [opts.capability],
		});

		return executeHttpCapability({
			capability: capabilityDef,
			token: token.token,
			arguments: opts.arguments,
			fetchFn: this.fetchFn,
		});
	}

	// ─── Agent Key Rotation (§6.8) ──────────────────────────────

	/**
	 * Rotate an agent's keypair — §6.8.
	 * Generates a new keypair, sends the new public key signed with the
	 * current key, then updates the local connection.
	 */
	async rotateAgentKey(agentId: string): Promise<{
		agentId: string;
		status: AgentStatus;
	}> {
		const conn = await this.requireConnection(agentId);
		const config = await this.requireConfig(conn.issuer);
		const newKeypair = await generateKeypair();

		const token = await this.signJwt({ agentId });
		const url = this.resolveEndpoint(config, "rotate_key", "/agent/rotate-key");

		const res = await this.fetchFn(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token.token}`,
			},
			body: JSON.stringify({ public_key: newKeypair.publicKey }),
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const body = (await res.json()) as { agent_id: string; status: AgentStatus };

		conn.agentKeypair = newKeypair;
		await this.storage.setAgentConnection(agentId, conn);

		return { agentId: body.agent_id, status: body.status };
	}

	// ─── Host Key Rotation (§6.9) ───────────────────────────────

	/**
	 * Rotate the host's keypair for a given provider — §6.9.
	 * Generates a new keypair, sends it signed with the current key,
	 * then updates the local host identity.
	 */
	async rotateHostKey(issuer: string): Promise<{
		hostId: string;
		status: string;
	}> {
		const config = await this.requireConfig(issuer);
		const host = await this.requireHost(config.issuer);
		const newKeypair = await generateKeypair();

		const hostJWT = await signHostJWT({
			hostKeypair: host.keypair,
			subject: host.hostId!,
			audience: config.issuer,
		});

		const url = this.resolveEndpoint(config, "rotate_host_key", "/host/rotate-key");

		const res = await this.fetchFn(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${hostJWT}`,
			},
			body: JSON.stringify({ public_key: newKeypair.publicKey }),
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const body = (await res.json()) as { host_id: string; status: string };

		host.keypair = newKeypair;
		await this.storage.setHostIdentity(config.issuer, host);

		return { hostId: body.host_id, status: body.status };
	}

	// ─── Host Enrollment ────────────────────────────────────────

	/**
	 * Enroll a host using a one-time enrollment token.
	 * Used when the host was pre-registered without a public key
	 * (e.g. via server dashboard) and needs to submit its key.
	 */
	async enrollHost(opts: {
		provider: string;
		enrollmentToken: string;
		name?: string;
	}): Promise<EnrollHostResponse> {
		const config = await this.resolveConfig(opts.provider);
		const host = await this.resolveHost(config);

		const url = new URL("/host/enroll", config.issuer);

		const res = await this.fetchFn(url.toString(), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				token: opts.enrollmentToken,
				public_key: host.keypair.publicKey,
				name: opts.name ?? this.hostName,
			}),
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const body = (await res.json()) as EnrollHostResponse;

		host.hostId = body.hostId;
		await this.storage.setHostIdentity(config.issuer, host);

		return body;
	}

	// ─── Account Linking (§3.4) ─────────────────────────────────

	/**
	 * Initiate account linking for an autonomous agent — §3.4.
	 * The server creates a CIBA-style request and the user
	 * approves on their device.
	 */
	async connectAccount(agentId: string): Promise<{
		authReqId: string;
		expiresIn: number;
		interval: number;
	}> {
		const conn = await this.requireConnection(agentId);
		const config = await this.requireConfig(conn.issuer);
		const host = await this.requireHost(conn.issuer);

		const hostJWT = await signHostJWT({
			hostKeypair: host.keypair,
			subject: host.hostId ?? conn.hostId,
			audience: config.issuer,
		});

		const url = new URL("/agent/connect-account", config.issuer);

		const res = await this.fetchFn(url.toString(), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${hostJWT}`,
			},
			body: JSON.stringify({ agent_id: agentId }),
		});

		if (!res.ok) {
			throw await this.toError(res);
		}

		const body = (await res.json()) as {
			auth_req_id: string;
			expires_in: number;
			interval: number;
		};

		return {
			authReqId: body.auth_req_id,
			expiresIn: body.expires_in,
			interval: body.interval,
		};
	}

	// ─── Agent Connection Accessors ─────────────────────────────

	/**
	 * Get a stored agent connection.
	 */
	async getConnection(agentId: string): Promise<AgentConnection | null> {
		return this.storage.getAgentConnection(agentId);
	}

	/**
	 * List all agent connections for a provider.
	 */
	async listConnections(issuer: string): Promise<AgentConnection[]> {
		return this.storage.listAgentConnections(issuer);
	}

	// ─── Internals ──────────────────────────────────────────────

	private async resolveConfig(providerOrUrl: string): Promise<ProviderConfig> {
		const byIssuer = await this.storage.getProviderConfig(providerOrUrl);
		if (byIssuer) return byIssuer;

		// Search by provider_name across all cached configs
		const all = await this.storage.listProviderConfigs();
		const byName = all.find((c) => c.provider_name === providerOrUrl);
		if (byName) return byName;

		if (
			providerOrUrl.startsWith("http://") ||
			providerOrUrl.startsWith("https://")
		) {
			return this.discoverProvider(providerOrUrl);
		}

		throw new AgentAuthSDKError(
			"provider_not_found",
			`Provider "${providerOrUrl}" not found. Discover it first or pass a URL.`,
		);
	}

	private async resolveHost(config: ProviderConfig): Promise<HostIdentity> {
		let host = await this.storage.getHostIdentity(config.issuer);
		if (!host) {
			const keypair = await generateKeypair();
			host = {
				hostId: null,
				providerName: config.provider_name,
				issuer: config.issuer,
				keypair,
				createdAt: Date.now(),
			};
			await this.storage.setHostIdentity(config.issuer, host);
		}
		return host;
	}

	private resolveEndpoint(
		config: ProviderConfig,
		key: string,
		fallback: string,
	): string {
		const path = config.endpoints[key] ?? fallback;
		return new URL(path, config.issuer).toString();
	}

	private async waitForApproval(
		config: ProviderConfig,
		host: HostIdentity,
		agentId: string,
		approval: ApprovalInfo,
		opts?: { signal?: AbortSignal },
	): Promise<StatusResponse> {
		if (this.onApprovalRequired) {
			await this.onApprovalRequired(approval);
		}

		const signals = [this.abortController.signal];
		if (opts?.signal) signals.push(opts.signal);
		const signal = signals.length === 1
			? signals[0]
			: AbortSignal.any(signals);

		const interval = (approval.interval ?? 5) * 1000;
		const deadline = Date.now() + Math.min(
			(approval.expires_in ?? 300) * 1000,
			this.approvalTimeoutMs,
		);

		while (Date.now() < deadline) {
			await sleep(interval, signal);

			try {
				const hostJWT = await signHostJWT({
					hostKeypair: host.keypair,
					subject: host.hostId ?? agentId,
					audience: config.issuer,
				});

				const statusPath = config.endpoints.status ?? "/agent/status";
				const url = new URL(statusPath, config.issuer);
				url.searchParams.set("agent_id", agentId);

				const res = await this.fetchFn(url.toString(), {
					method: "GET",
					headers: {
						accept: "application/json",
						authorization: `Bearer ${hostJWT}`,
					},
					signal,
				});

				if (!res.ok) continue;

				const status = (await res.json()) as StatusResponse;

				if (this.onApprovalStatusChange) {
					await this.onApprovalStatusChange(status.status);
				}

				if (status.status === "active") return status;
				if (status.status === "rejected" || status.status === "revoked") {
					throw new AgentAuthSDKError(
						`agent_${status.status}`,
						`Agent was ${status.status} during approval.`,
					);
				}
			} catch (err) {
				if (err instanceof AgentAuthSDKError) throw err;
				if (signal.aborted) throw err;
			}
		}

		throw new AgentAuthSDKError(
			"approval_timeout",
			"Approval timed out.",
		);
	}

	private async pollAsyncResult(
		statusUrl: string,
		token: string,
	): Promise<ExecuteCapabilityResponse> {
		const signal = this.abortController.signal;
		const maxAttempts = 60;
		let interval = 2000;

		for (let i = 0; i < maxAttempts; i++) {
			await sleep(interval, signal);

			const res = await this.fetchFn(statusUrl, {
				method: "GET",
				headers: {
					accept: "application/json",
					authorization: `Bearer ${token}`,
				},
				signal,
			});

			if (!res.ok) {
				throw await this.toError(res);
			}

			const body = (await res.json()) as ExecuteCapabilityResponse;

			if (body.status === "completed" || body.status === "failed") {
				return body;
			}

			const retryAfter = res.headers.get("retry-after");
			if (retryAfter) {
				interval = Number.parseInt(retryAfter, 10) * 1000;
			}
		}

		throw new AgentAuthSDKError(
			"async_timeout",
			"Async capability execution timed out.",
		);
	}

	private async requireConnection(agentId: string): Promise<AgentConnection> {
		const conn = await this.storage.getAgentConnection(agentId);
		if (!conn) {
			throw new AgentAuthSDKError(
				"agent_not_found",
				`No local connection for agent ${agentId}.`,
			);
		}
		return conn;
	}

	private async requireConfig(issuer: string): Promise<ProviderConfig> {
		const config = await this.storage.getProviderConfig(issuer);
		if (!config) {
			throw new AgentAuthSDKError(
				"provider_not_found",
				`No cached config for issuer ${issuer}.`,
			);
		}
		return config;
	}

	private async requireHost(issuer: string): Promise<HostIdentity> {
		const host = await this.storage.getHostIdentity(issuer);
		if (!host) {
			throw new AgentAuthSDKError(
				"host_not_found",
				`No host identity for issuer ${issuer}.`,
			);
		}
		return host;
	}

	private async toError(res: Response): Promise<AgentAuthSDKError> {
		try {
			const body = await res.json();
			return AgentAuthSDKError.fromResponse(body as Record<string, string>, res.status);
		} catch {
			return new AgentAuthSDKError(
				"request_failed",
				`Request failed: ${res.status} ${res.statusText}`,
				res.status,
			);
		}
	}
}
 