import { generateKeypair, signAgentJWT, signHostJWT } from "./crypto";
import { discoverProvider, lookupByUrl, searchRegistryFull } from "./discovery";
import { detectHostName, detectTool } from "./host-name";
import { MemoryStorage } from "./storage";
import type {
  AgentAuthClientOptions,
  AgentConnection,
  AgentMode,
  AgentStatus,
  ApprovalInfo,
  BatchExecuteRequest,
  BatchExecuteResponse,
  BatchExecuteResponseItem,
  CapabilitiesResponse,
  Capability,
  CapabilityGrant,
  CapabilityRequestItem,
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
  private readonly allowDirectDiscovery: boolean;
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
    this.registryUrl = opts.registryUrl ?? "https://agent-auth.directory";
    this.allowDirectDiscovery = opts.allowDirectDiscovery ?? !this.registryUrl;
    this.jwtExpirySeconds = opts.jwtExpirySeconds ?? 60;
    this.hostName = opts.hostName ?? detectHostName();
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
   * Results are automatically cached so the providers can be used
   * immediately (e.g. with `connectAgent` or `listCapabilities`).
   */
  async searchProviders(intent: string): Promise<ProviderInfo[]> {
    if (!this.registryUrl) {
      throw new AgentAuthSDKError(
        "no_registry",
        "No registry URL configured. Set registryUrl in client options.",
      );
    }
    const configs = await searchRegistryFull(this.registryUrl, intent, {
      fetchFn: this.fetchFn,
    });
    for (const config of configs) {
      await this.storage.setProviderConfig(config.issuer, config);
    }
    return configs.map((c) => ({
      name: c.provider_name,
      description: c.description,
      issuer: c.issuer,
    }));
  }

  /**
   * Discover a provider from a service URL — §7.1.3.
   * Fetches and caches the discovery document.
   *
   * When `allowDirectDiscovery` is `false` (the default when a registry
   * URL is configured), only resolves through the registry — never
   * fetches `.well-known` from arbitrary URLs.
   *
   * When direct discovery is allowed, tries the `.well-known` endpoint
   * first and falls back to registry lookup on failure.
   */
  async discoverProvider(url: string): Promise<ProviderConfig> {
    if (!this.allowDirectDiscovery) {
      if (!this.registryUrl) {
        throw new AgentAuthSDKError(
          "direct_discovery_blocked",
          "Direct discovery is disabled and no registry URL is configured.",
        );
      }
      const config = await lookupByUrl(this.registryUrl, url, {
        fetchFn: this.fetchFn,
      });
      if (config) {
        await this.storage.setProviderConfig(config.issuer, config);
        return config;
      }
      throw new AgentAuthSDKError(
        "provider_not_in_registry",
        `Provider at "${url}" was not found in the registry. Direct discovery is disabled when a registry URL is configured. Set allowDirectDiscovery: true to override.`,
      );
    }

    try {
      const config = await discoverProvider(url, this.fetchFn);
      await this.storage.setProviderConfig(config.issuer, config);
      return config;
    } catch (originalError) {
      if (this.registryUrl) {
        const config = await lookupByUrl(this.registryUrl, url, {
          fetchFn: this.fetchFn,
        });
        if (config) {
          await this.storage.setProviderConfig(config.issuer, config);
          return config;
        }
      }
      throw originalError;
    }
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
    limit?: number;
  }): Promise<CapabilitiesResponse> {
    const config = await this.resolveConfig(opts.provider);
    const url = new URL(
      this.resolveEndpoint(config, "capabilities", "/capability/list"),
    );
    if (opts.query) url.searchParams.set("query", opts.query);
    if (opts.cursor) url.searchParams.set("cursor", opts.cursor);
    if (opts.limit != null) url.searchParams.set("limit", String(opts.limit));

    const headers: Record<string, string> = {
      accept: "application/json",
    };

    if (opts.agentId) {
      const token = await this.signJwt({ agentId: opts.agentId });
      headers.authorization = `Bearer ${token.token}`;
    } else {
      const host = await this.storage.getHostIdentity();
      if (host) {
        const hostJWT = await signHostJWT({
          hostKeypair: host.keypair,
          audience: config.issuer,
        });
        headers.authorization = `Bearer ${hostJWT}`;
      }
    }

    let res = await this.fetchFn(url.toString(), { method: "GET", headers });
    if (
      !res.ok &&
      res.status === 401 &&
      !opts.agentId &&
      headers.authorization
    ) {
      delete headers.authorization;
      res = await this.fetchFn(url.toString(), { method: "GET", headers });
    }
    if (!res.ok) {
      throw await this.toError(res);
    }
    return (await res.json()) as CapabilitiesResponse;
  }

  /**
   * Describe a single capability — returns the full definition
   * including input schema. Use when the agent needs to look up
   * a schema mid-session.
   */
  async describeCapability(opts: {
    provider: string;
    name: string;
    agentId?: string;
  }): Promise<Capability> {
    const config = await this.resolveConfig(opts.provider);
    const url = new URL(
      this.resolveEndpoint(
        config,
        "describe_capability",
        "/capability/describe",
      ),
    );
    url.searchParams.set("name", opts.name);

    const headers: Record<string, string> = { accept: "application/json" };

    if (opts.agentId) {
      const token = await this.signJwt({ agentId: opts.agentId });
      headers.authorization = `Bearer ${token.token}`;
    }

    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      throw await this.toError(res);
    }

    return (await res.json()) as Capability;
  }

  // ─── Connection (§7.3) ──────────────────────────────────────

  /**
   * Connect an agent to a service — §7.3.
   *
   * Generates a new agent keypair, registers the agent on the server
   * via host JWT, handles approval if needed, and stores the connection.
   */
  async connectAgent(opts: {
    provider: string;
    capabilities?: CapabilityRequestItem[];
    mode?: AgentMode;
    reason?: string;
    preferredMethod?: string;
    loginHint?: string;
    bindingMessage?: string;
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
  }> {
    const config = await this.resolveConfig(opts.provider);

    const existing = await this.findExistingConnection(config.issuer);
    if (existing) {
      return this.reuseExistingConnection(existing, config, opts);
    }

    const { regBody, host, agentKeypair } = await this.registerAgent(
      config,
      opts,
    );

    const connection: AgentConnection = {
      agentId: regBody.agent_id,
      hostId: regBody.host_id,
      hostName: this.hostName,
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
    /**
     * Override the JWT `aud` claim (§4.3).
     *
     * For execution requests, set this to the resolved location URL.
     * For non-execution requests (status, listing), omit to use issuer.
     */
    audience?: string;
    /** HTTP method for DPoP request binding (§5.3). */
    htm?: string;
    /** HTTP target URI for DPoP request binding (§5.3). */
    htu?: string;
    /** Access token hash for DPoP request binding (§5.3). */
    ath?: string;
  }): Promise<{ token: string; expiresAt: number; expires_in: number }> {
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
      audience: opts.audience ?? conn.issuer,
      capabilities: opts.capabilities,
      htm: opts.htm,
      htu: opts.htu,
      ath: opts.ath,
      expiresInSeconds: this.jwtExpirySeconds,
    });

    return {
      token,
      expiresAt: Math.floor(Date.now() / 1000) + this.jwtExpirySeconds,
      expires_in: this.jwtExpirySeconds,
    };
  }

  // ─── Capability Escalation (§7.5) ───────────────────────────

  /**
   * Request additional capabilities — §7.5.
   */
  async requestCapability(opts: {
    agentId: string;
    capabilities: CapabilityRequestItem[];
    reason?: string;
    preferredMethod?: string;
    loginHint?: string;
    bindingMessage?: string;
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

    const body: Record<string, CapabilityRequestItem[] | string> = {
      capabilities: opts.capabilities,
    };
    if (opts.reason) body.reason = opts.reason;
    if (opts.preferredMethod) body.preferred_method = opts.preferredMethod;
    if (opts.loginHint) body.login_hint = opts.loginHint;
    if (opts.bindingMessage) body.binding_message = opts.bindingMessage;

    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await this.toError(res, conn.issuer);
    }

    const resBody = (await res.json()) as RequestCapabilityResponse;

    if (resBody.status === "pending" && resBody.approval) {
      const host = await this.storage.getHostIdentity();
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
    const grants =
      finalConn?.capabilityGrants ?? resBody.agent_capability_grants;

    return {
      granted: grants
        .filter((g) => g.status === "active")
        .map((g) => g.capability),
      pending: grants
        .filter((g) => g.status === "pending")
        .map((g) => g.capability),
      denied: grants
        .filter((g) => g.status === "denied" || g.status === "revoked")
        .map((g) => g.capability),
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
    const host = await this.storage.getHostIdentity();

    if (host) {
      const hostJWT = await signHostJWT({
        hostKeypair: host.keypair,
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
  async reactivateAgent(
    agentId: string,
    opts?: { signal?: AbortSignal },
  ): Promise<{
    agentId: string;
    status: AgentStatus;
    capabilityGrants: CapabilityGrant[];
  }> {
    const conn = await this.requireConnection(agentId);
    const config = await this.requireConfig(conn.issuer);
    const host = await this.requireHost();

    const hostJWT = await signHostJWT({
      hostKeypair: host.keypair,
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
    const host = await this.requireHost();

    const hostJWT = await signHostJWT({
      hostKeypair: host.keypair,
      audience: config.issuer,
    });

    const url = new URL(
      this.resolveEndpoint(config, "status", "/agent/status"),
    );
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

    const capLocation = this.resolveCapabilityLocationFromConfig(
      config,
      opts.capability,
    );
    const executeLocation = this.resolveExecuteLocation(config, capLocation);

    const token = await this.signJwt({
      agentId: opts.agentId,
      capabilities: [opts.capability],
      audience: executeLocation,
    });

    const res = await this.fetchFn(executeLocation, {
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
      return this.pollAsyncResult(body.status_url, token.token);
    }

    return body;
  }

  // ─── Batch Execute Capabilities ────────────────────────────

  /**
   * Execute multiple capabilities in a single request.
   *
   * Signs one JWT scoped to all unique capabilities, groups requests
   * by execute location, and sends a batch to each. Falls back to
   * parallel individual calls if the server returns 404/405.
   */
  async batchExecuteCapabilities(opts: {
    agentId: string;
    requests: BatchExecuteRequest[];
  }): Promise<BatchExecuteResponse> {
    if (opts.requests.length === 0) {
      return { responses: [] };
    }

    const conn = await this.requireConnection(opts.agentId);
    const config = await this.requireConfig(conn.issuer);

    const normalizedRequests = opts.requests.map((r, i) => ({
      ...r,
      id: r.id ?? String(i),
    }));

    const uniqueCaps = [
      ...new Set(normalizedRequests.map((r) => r.capability)),
    ];

    const locationGroups = new Map<
      string,
      Array<{
        id: string;
        capability: string;
        arguments?: Record<string, unknown>;
      }>
    >();

    for (const req of normalizedRequests) {
      const capLocation = this.resolveCapabilityLocationFromConfig(
        config,
        req.capability,
      );
      const executeLocation = this.resolveExecuteLocation(config, capLocation);
      const group = locationGroups.get(executeLocation) ?? [];
      group.push(req);
      locationGroups.set(executeLocation, group);
    }

    const allResponses: BatchExecuteResponseItem[] = [];

    for (const [location, groupRequests] of locationGroups) {
      const groupCaps = [...new Set(groupRequests.map((r) => r.capability))];

      const token = await this.signJwt({
        agentId: opts.agentId,
        capabilities: groupCaps,
        audience: location,
      });

      const batchEndpoint = this.resolveBatchEndpoint(config, location);

      let useFallback = false;

      try {
        const res = await this.fetchFn(batchEndpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token.token}`,
          },
          body: JSON.stringify({ requests: groupRequests }),
        });

        if (res.status === 404 || res.status === 405) {
          useFallback = true;
        } else if (!res.ok) {
          throw await this.toError(res);
        } else {
          const body = (await res.json()) as BatchExecuteResponse;
          allResponses.push(...body.responses);
        }
      } catch (err) {
        if (
          useFallback ||
          (err instanceof AgentAuthSDKError &&
            (err.status === 404 || err.status === 405))
        ) {
          useFallback = true;
        } else {
          throw err;
        }
      }

      if (useFallback) {
        const results = await Promise.allSettled(
          groupRequests.map(async (req) => {
            const result = await this.executeCapability({
              agentId: opts.agentId,
              capability: req.capability,
              arguments: req.arguments,
            });
            return { id: req.id, result };
          }),
        );

        for (const settled of results) {
          if (settled.status === "fulfilled") {
            const { id, result } = settled.value;
            allResponses.push({
              id,
              status: "completed",
              data: result.data,
            });
          } else {
            const err = settled.reason;
            const id = groupRequests[results.indexOf(settled)]?.id ?? "unknown";
            allResponses.push({
              id,
              status: "failed",
              error: {
                code:
                  err instanceof AgentAuthSDKError
                    ? err.code
                    : "internal_error",
                message: err instanceof Error ? err.message : "Unknown error",
              },
            });
          }
        }
      }
    }

    return { responses: allResponses };
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

    const body = (await res.json()) as {
      agent_id: string;
      status: AgentStatus;
    };

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
    const host = await this.requireHost();
    const newKeypair = await generateKeypair();

    const hostJWT = await signHostJWT({
      hostKeypair: host.keypair,
      audience: config.issuer,
    });

    const url = this.resolveEndpoint(
      config,
      "rotate_host_key",
      "/host/rotate-key",
    );

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
    await this.storage.setHostIdentity(host);

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
    const host = await this.resolveHost();

    const url = `${config.issuer}/host/enroll`;

    const res = await this.fetchFn(url, {
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

    await this.storage.setHostIdentity(host);

    return body;
  }

  // ─── Agent Connection Accessors ─────────────────────────────

  /**
   * Get a stored agent connection.
   */
  async getConnection(agentId: string): Promise<AgentConnection | null> {
    return this.storage.getAgentConnection(agentId);
  }

  // ─── Internals ──────────────────────────────────────────────

  private resolveAgentName(): string {
    const tool = detectTool();
    if (tool) {
      return this.hostName ? `${tool.name} on ${this.hostName}` : tool.name;
    }
    if (this.hostName) return this.hostName;
    return `agent-${Date.now()}`;
  }

  private async findExistingConnection(
    issuer: string,
  ): Promise<AgentConnection | null> {
    const all = await this.storage.listAgentConnections();
    return all.find((c) => c.issuer === issuer) ?? null;
  }

  private async reuseExistingConnection(
    conn: AgentConnection,
    config: ProviderConfig,
    opts: {
      capabilities?: CapabilityRequestItem[];
      reason?: string;
      preferredMethod?: string;
      loginHint?: string;
      bindingMessage?: string;
      signal?: AbortSignal;
    },
  ): Promise<{
    agentId: string;
    hostId: string;
    status: AgentStatus;
    capabilityGrants: CapabilityGrant[];
  }> {
    let status: StatusResponse;
    try {
      status = await this.agentStatus(conn.agentId);
    } catch {
      await this.storage.deleteAgentConnection(conn.agentId);
      return this.connectAgent({ ...opts, provider: config.issuer });
    }

    if (status.status === "revoked" || status.status === "rejected") {
      await this.storage.deleteAgentConnection(conn.agentId);
      return this.connectAgent({ ...opts, provider: config.issuer });
    }

    if (status.status === "expired") {
      try {
        const reactivated = await this.reactivateAgent(conn.agentId, {
          signal: opts.signal,
        });
        return {
          agentId: reactivated.agentId,
          hostId: conn.hostId,
          status: reactivated.status,
          capabilityGrants: reactivated.capabilityGrants,
        };
      } catch {
        await this.storage.deleteAgentConnection(conn.agentId);
        return this.connectAgent({ ...opts, provider: config.issuer });
      }
    }

    if (status.status === "pending") {
      const host = await this.resolveHost();
      const approval = await this.buildApprovalFromStatus(config, conn.agentId);
      if (approval) {
        const finalStatus = await this.waitForApproval(
          config,
          host,
          conn.agentId,
          approval,
          { signal: opts.signal },
        );
        conn.capabilityGrants = finalStatus.agent_capability_grants;
        await this.storage.setAgentConnection(conn.agentId, conn);
        return {
          agentId: conn.agentId,
          hostId: conn.hostId,
          status: finalStatus.status,
          capabilityGrants: finalStatus.agent_capability_grants,
        };
      }
    }

    if (opts.capabilities && opts.capabilities.length > 0) {
      const grantedCaps = new Set(
        status.agent_capability_grants
          .filter((g) => g.status === "active")
          .map((g) => g.capability),
      );
      const missingCaps = opts.capabilities.filter((c) => {
        const name = typeof c === "string" ? c : c.name;
        return !grantedCaps.has(name);
      });

      if (missingCaps.length > 0) {
        try {
          await this.requestCapability({
            agentId: conn.agentId,
            capabilities: missingCaps,
            reason: opts.reason,
            preferredMethod: opts.preferredMethod,
            loginHint: opts.loginHint,
            bindingMessage: opts.bindingMessage,
            signal: opts.signal,
          });
        } catch {
          // Best-effort — continue with existing grants
        }
      }
    }

    const updatedConn = await this.storage.getAgentConnection(conn.agentId);
    return {
      agentId: conn.agentId,
      hostId: conn.hostId,
      status: status.status,
      capabilityGrants:
        updatedConn?.capabilityGrants ?? status.agent_capability_grants,
    };
  }

  /**
   * Build approval info for a pending agent by requesting a new device code.
   */
  private async buildApprovalFromStatus(
    config: ProviderConfig,
    agentId: string,
  ): Promise<ApprovalInfo | null> {
    try {
      const host = await this.requireHost();
      const hostJWT = await signHostJWT({
        hostKeypair: host.keypair,
        audience: config.issuer,
      });
      const url = this.resolveEndpoint(
        config,
        "device_authorization",
        "/device/code",
      );
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${hostJWT}`,
        },
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as ApprovalInfo;
      return body;
    } catch {
      return null;
    }
  }

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

  /**
   * Send the registration request to the server.
   * If a 401 is returned and we have a stale host ID, reset it and retry
   * once so dynamic host registration can succeed with a fresh identity.
   */
  private async registerAgent(
    config: ProviderConfig,
    opts: {
      capabilities?: CapabilityRequestItem[];
      mode?: AgentMode;
      reason?: string;
      preferredMethod?: string;
      loginHint?: string;
      bindingMessage?: string;
      name?: string;
    },
  ): Promise<{
    regBody: RegisterResponse;
    host: HostIdentity;
    agentKeypair: Keypair;
  }> {
    const registerUrl = this.resolveEndpoint(
      config,
      "register",
      "/agent/register",
    );

    const buildBody = () => {
      const body: Record<string, CapabilityRequestItem[] | string> = {
        name: opts.name ?? this.resolveAgentName(),
        mode: opts.mode ?? "delegated",
      };
      if (opts.capabilities) body.capabilities = opts.capabilities;
      if (opts.reason) body.reason = opts.reason;
      if (opts.preferredMethod) body.preferred_method = opts.preferredMethod;
      if (opts.loginHint) body.login_hint = opts.loginHint;
      if (opts.bindingMessage) body.binding_message = opts.bindingMessage;
      if (this.hostName) body.host_name = this.hostName;
      return body;
    };

    const attempt = async (host: HostIdentity) => {
      const agentKeypair = await generateKeypair();
      const hostJWT = await signHostJWT({
        hostKeypair: host.keypair,
        audience: config.issuer,
        agentPublicKey: agentKeypair.publicKey,
        hostName: this.hostName ?? undefined,
      });

      const res = await this.fetchFn(registerUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${hostJWT}`,
        },
        body: JSON.stringify(buildBody()),
      });

      return { res, agentKeypair };
    };

    const host = await this.resolveHost();
    const { res, agentKeypair } = await attempt(host);

    if (!res.ok) {
      throw await this.toError(res, config.issuer);
    }

    const regBody = (await res.json()) as RegisterResponse;
    return { regBody, host, agentKeypair };
  }

  private async resolveHost(): Promise<HostIdentity> {
    let host = await this.storage.getHostIdentity();
    if (!host) {
      const keypair = await generateKeypair();
      host = { keypair, createdAt: Date.now() };
      await this.storage.setHostIdentity(host);
    }
    return host;
  }

  private resolveEndpoint(
    config: ProviderConfig,
    key: string,
    fallback: string,
  ): string {
    const path = config.endpoints[key] ?? fallback;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const issuer = config.issuer.replace(/\/+$/, "");
    return `${issuer}${path.startsWith("/") ? path : `/${path}`}`;
  }

  /**
   * Resolve the execution location for a capability (§2.15).
   *
   * Priority: capability `location` > provider `default_location`
   * > `{issuer}{endpoints.execute}`.
   */
  private resolveExecuteLocation(
    config: ProviderConfig,
    capabilityLocation?: string,
  ): string {
    if (capabilityLocation) return capabilityLocation;
    if (config.default_location) return config.default_location;
    return this.resolveEndpoint(config, "execute", "/capability/execute");
  }

  /**
   * Look up a capability's `location` from an already-fetched provider
   * config. Returns `undefined` if the capability has no custom location
   * — the caller falls back to `default_location`.
   */
  private resolveCapabilityLocationFromConfig(
    config: ProviderConfig,
    capabilityName: string,
  ): string | undefined {
    if (config.capabilities) {
      const cap = config.capabilities.find((c) => c.name === capabilityName);
      if (cap?.location) return cap.location;
    }
    return undefined;
  }

  /**
   * Resolve the batch execute endpoint URL.
   *
   * Uses the discovery `batch_execute` endpoint if advertised,
   * otherwise derives it from the execute location by replacing
   * the path suffix.
   */
  private resolveBatchEndpoint(
    config: ProviderConfig,
    executeLocation: string,
  ): string {
    if (config.endpoints.batch_execute) {
      return this.resolveEndpoint(
        config,
        "batch_execute",
        "/capability/batch-execute",
      );
    }
    return this.resolveEndpoint(
      config,
      "batch_execute",
      "/capability/batch-execute",
    );
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
    const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

    if (approval.notification_url) {
      try {
        return await this.waitForApprovalSSE(
          config,
          host,
          agentId,
          approval.notification_url,
          signal,
        );
      } catch (err) {
        if (err instanceof AgentAuthSDKError) throw err;
        if (signal.aborted) throw err;
      }
    }

    return this.pollForApproval(config, host, agentId, approval, signal);
  }

  private async waitForApprovalSSE(
    config: ProviderConfig,
    host: HostIdentity,
    agentId: string,
    notificationUrl: string,
    signal: AbortSignal,
  ): Promise<StatusResponse> {
    const deadline = Date.now() + this.approvalTimeoutMs;

    return new Promise<StatusResponse>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        return;
      }

      const eventSource = new EventSource(notificationUrl);
      let settled = false;

      const cleanup = () => {
        settled = true;
        eventSource.close();
      };

      const onAbort = () => {
        cleanup();
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });

      const timeoutId = setTimeout(
        () => {
          if (!settled) {
            cleanup();
            reject(
              new AgentAuthSDKError("approval_timeout", "Approval timed out."),
            );
          }
        },
        Math.max(0, deadline - Date.now()),
      );

      eventSource.addEventListener("status", async (event) => {
        if (settled) return;
        try {
          const data = JSON.parse(event.data) as StatusResponse;

          if (this.onApprovalStatusChange) {
            await this.onApprovalStatusChange(data.status);
          }

          if (data.status === "active") {
            cleanup();
            clearTimeout(timeoutId);
            resolve(data);
          } else if (data.status === "rejected" || data.status === "revoked") {
            cleanup();
            clearTimeout(timeoutId);
            reject(
              new AgentAuthSDKError(
                `agent_${data.status}`,
                `Agent was ${data.status} during approval.`,
              ),
            );
          }
        } catch {
          // Malformed event — ignore, keep listening
        }
      });

      eventSource.onerror = () => {
        if (settled) return;
        cleanup();
        clearTimeout(timeoutId);
        signal.removeEventListener("abort", onAbort);
        reject(
          new AgentAuthSDKError(
            "sse_failed",
            "SSE connection failed, falling back to polling.",
          ),
        );
      };
    });
  }

  private async pollForApproval(
    config: ProviderConfig,
    host: HostIdentity,
    agentId: string,
    approval: ApprovalInfo,
    signal: AbortSignal,
  ): Promise<StatusResponse> {
    const interval = (approval.interval ?? 5) * 1000;
    const deadline =
      Date.now() +
      Math.min((approval.expires_in ?? 300) * 1000, this.approvalTimeoutMs);

    while (Date.now() < deadline) {
      await sleep(interval, signal);

      try {
        const hostJWT = await signHostJWT({
          hostKeypair: host.keypair,
          audience: config.issuer,
        });

        const url = new URL(
          this.resolveEndpoint(config, "status", "/agent/status"),
        );
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

    throw new AgentAuthSDKError("approval_timeout", "Approval timed out.");
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

  private async requireHost(): Promise<HostIdentity> {
    const host = await this.storage.getHostIdentity();
    if (!host) {
      throw new AgentAuthSDKError(
        "host_not_found",
        "No host identity found. Call connectAgent first.",
      );
    }
    return host;
  }

  private async toError(
    res: Response,
    issuer?: string,
  ): Promise<AgentAuthSDKError> {
    try {
      const body = (await res.json()) as Record<string, string>;
      const err = AgentAuthSDKError.fromResponse(body, res.status);

      if (err.code === "invalid_capabilities" && issuer) {
        const hint = await this.getAvailableCapabilityHint(issuer);
        if (hint) {
          return new AgentAuthSDKError(
            err.code,
            `${err.message} ${hint}`,
            err.status,
          );
        }
      }

      return err;
    } catch {
      return new AgentAuthSDKError(
        "request_failed",
        `Request failed: ${res.status} ${res.statusText}`,
        res.status,
      );
    }
  }

  private async getAvailableCapabilityHint(
    issuer: string,
  ): Promise<string | null> {
    try {
      const config = await this.storage.getProviderConfig(issuer);
      if (config?.capabilities && config.capabilities.length > 0) {
        const names = config.capabilities.map((c) => c.name);
        return `Available capabilities: ${names.join(", ")}`;
      }
    } catch {
      // Best-effort — don't fail if storage lookup errors
    }
    return "Call list_capabilities to see available capabilities for this provider.";
  }
}
