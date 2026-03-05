export type Agent = {
	id: string;
	name: string;
	status: string;
	scopes: string[];
	role?: string;
	orgId?: string;
	metadata: string | null;
	createdAt: string;
	updatedAt: string;
	lastUsedAt: string | null;
};

export type AgentActivity = {
	id: string;
	tool: string;
	provider: string | null;
	agentName: string | null;
	status: string;
	durationMs: number | null;
	error: string | null;
	metadata: string | null;
	createdAt: string;
};

async function authFetch(path: string, options?: RequestInit) {
	return fetch(`/api/auth${path}`, {
		credentials: "include",
		...options,
		headers: {
			"Content-Type": "application/json",
			...options?.headers,
		},
	});
}

export async function listAgents(): Promise<{
	data?: Agent[];
	error?: string;
}> {
	try {
		const res = await authFetch("/agent/list");
		const json = await res.json();
		if (!res.ok) return { error: json.message || "Failed to list agents" };
		return { data: json.agents ?? json ?? [] };
	} catch (e: unknown) {
		return { error: e instanceof Error ? e.message : "Failed to list agents" };
	}
}

export async function updateAgent(body: {
	agentId: string;
	name?: string;
}): Promise<{ data?: Partial<Agent>; error?: string }> {
	try {
		const res = await fetch("/api/agent/update", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const json = await res.json();
		if (!res.ok) return { error: json.error || "Failed to update agent" };
		return { data: json };
	} catch (e: unknown) {
		return { error: e instanceof Error ? e.message : "Failed to update agent" };
	}
}

export async function revokeAgent(
	agentId: string,
): Promise<{ error?: string }> {
	try {
		const res = await authFetch("/agent/revoke", {
			method: "POST",
			body: JSON.stringify({ agentId }),
		});
		if (!res.ok) {
			const json = await res.json();
			return { error: json.message || "Failed to revoke agent" };
		}
		return {};
	} catch (e: unknown) {
		return { error: e instanceof Error ? e.message : "Failed to revoke agent" };
	}
}

export async function revokeAllAgents(
	agentIds: string[],
): Promise<{ revoked: number; failed: string[] }> {
	const failed: string[] = [];
	let revoked = 0;
	for (const id of agentIds) {
		const res = await revokeAgent(id);
		if (res.error) {
			failed.push(id);
		} else {
			revoked++;
		}
	}
	return { revoked, failed };
}

export async function getAgentActivity(params: {
	agentId: string;
	orgId?: string;
	limit?: number;
	offset?: number;
}): Promise<{ data?: AgentActivity[] }> {
	try {
		const url = new URL("/api/agent/activity", window.location.origin);
		url.searchParams.set("agentId", params.agentId);
		if (params.orgId) url.searchParams.set("orgId", params.orgId);
		if (params.limit) url.searchParams.set("limit", String(params.limit));
		if (params.offset) url.searchParams.set("offset", String(params.offset));
		const res = await fetch(url.toString(), { credentials: "include" });
		const json = await res.json();
		return { data: json.activities ?? [] };
	} catch {
		return { data: [] };
	}
}

export type CibaPendingRequest = {
	auth_req_id: string;
	client_id: string;
	binding_message: string | null;
	scope: string | null;
	delivery_mode: "poll" | "ping" | "push";
	expires_in: number;
	created_at: string;
};

export async function listPendingCibaRequests(): Promise<{
	data?: CibaPendingRequest[];
	error?: string;
}> {
	try {
		const res = await authFetch("/agent/ciba/pending", { method: "GET" });
		const json = await res.json();
		if (!res.ok)
			return { error: json.message || "Failed to fetch CIBA requests" };
		return { data: json.requests ?? [] };
	} catch (e: unknown) {
		return {
			error: e instanceof Error ? e.message : "Failed to fetch CIBA requests",
		};
	}
}

export async function approveCibaRequest(
	authReqId: string,
): Promise<{ error?: string; code?: string }> {
	try {
		const res = await authFetch("/agent/ciba/approve", {
			method: "POST",
			body: JSON.stringify({ auth_req_id: authReqId }),
		});
		if (!res.ok) {
			const json = await res.json();
			const message = json.message || "Failed to approve request";
			const isFreshSession =
				typeof message === "string" &&
				message.includes("FRESH_SESSION_REQUIRED");
			return {
				error: message,
				code: isFreshSession ? "FRESH_SESSION_REQUIRED" : undefined,
			};
		}
		return {};
	} catch (e: unknown) {
		return {
			error: e instanceof Error ? e.message : "Failed to approve request",
		};
	}
}

export async function denyCibaRequest(
	authReqId: string,
): Promise<{ error?: string }> {
	try {
		const res = await authFetch("/agent/ciba/deny", {
			method: "POST",
			body: JSON.stringify({ auth_req_id: authReqId }),
		});
		if (!res.ok) {
			const json = await res.json();
			return { error: json.message || "Failed to deny request" };
		}
		return {};
	} catch (e: unknown) {
		return {
			error: e instanceof Error ? e.message : "Failed to deny request",
		};
	}
}

export type ApprovalHistoryEntry = {
	id: string;
	action: string;
	requestType: string;
	requestId: string | null;
	agentId: string | null;
	agentName: string | null;
	clientId: string | null;
	scopes: string | null;
	bindingMessage: string | null;
	userId: string | null;
	createdAt: string;
};

export async function fetchApprovalHistory(
	orgId: string,
	opts?: { limit?: number; offset?: number },
): Promise<{
	entries: ApprovalHistoryEntry[];
	total: number;
	error?: string;
}> {
	try {
		const url = new URL("/api/approval-history", window.location.origin);
		url.searchParams.set("orgId", orgId);
		if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
		if (opts?.offset) url.searchParams.set("offset", String(opts.offset));
		const res = await fetch(url.toString(), { credentials: "include" });
		const json = await res.json();
		if (!res.ok) return { entries: [], total: 0, error: json.error };
		return { entries: json.entries ?? [], total: json.total ?? 0 };
	} catch {
		return { entries: [], total: 0, error: "Failed to load approval history" };
	}
}

export async function recordApprovalEvent(body: {
	orgId: string;
	action: string;
	requestType: string;
	requestId?: string;
	agentId?: string;
	agentName?: string;
	clientId?: string;
	scopes?: string;
	bindingMessage?: string;
}): Promise<{ id?: string; error?: string }> {
	try {
		const res = await fetch("/api/approval-history", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const json = await res.json();
		if (!res.ok) return { error: json.error };
		return { id: json.id };
	} catch {
		return { error: "Failed to record approval" };
	}
}

export async function addAgentScope(
	agentId: string,
	scope: string,
): Promise<{ permissionId?: string; error?: string }> {
	try {
		const res = await fetch("/api/agent/add-scope", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ agentId, scope }),
		});
		const json = await res.json();
		if (!res.ok) return { error: json.error || "Failed to add scope" };
		return { permissionId: json.permissionId };
	} catch (e: unknown) {
		return {
			error: e instanceof Error ? e.message : "Failed to add scope",
		};
	}
}

export async function removeAgentScope(
	permissionId: string,
): Promise<{ error?: string }> {
	try {
		const res = await fetch("/api/agent/remove-scope", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ permissionId }),
		});
		if (!res.ok) {
			const json = await res.json();
			return { error: json.error || "Failed to remove scope" };
		}
		return {};
	} catch (e: unknown) {
		return {
			error: e instanceof Error ? e.message : "Failed to remove scope",
		};
	}
}

export async function createHost(body: {
	name: string;
	scopes?: string[];
}): Promise<{
	data?: {
		hostId: string;
		enrollmentToken: string;
		enrollmentTokenExpiresAt: string;
		scopes: string[];
	};
	error?: string;
}> {
	try {
		const res = await authFetch("/agent/host/create", {
			method: "POST",
			body: JSON.stringify(body),
		});
		const json = await res.json();
		if (!res.ok) return { error: json.message || "Failed to create host" };
		return { data: json };
	} catch (e: unknown) {
		return {
			error: e instanceof Error ? e.message : "Failed to create host",
		};
	}
}

export async function revokeHost(hostId: string): Promise<{ error?: string }> {
	try {
		const res = await authFetch("/agent/host/revoke", {
			method: "POST",
			body: JSON.stringify({ hostId }),
		});
		if (!res.ok) {
			const json = await res.json();
			return { error: json.message || "Failed to revoke host" };
		}
		return {};
	} catch (e: unknown) {
		return { error: e instanceof Error ? e.message : "Failed to revoke host" };
	}
}

export async function createRemoteHost(body: {
	name: string;
	scopes?: string[];
}): Promise<{
	data?: { hostId: string; status: string };
	error?: string;
}> {
	try {
		const res = await fetch("/api/agent/host/create-remote", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const json = await res.json();
		if (!res.ok) return { error: json.error || "Failed to create remote host" };
		return { data: json };
	} catch (e: unknown) {
		return {
			error: e instanceof Error ? e.message : "Failed to create remote host",
		};
	}
}

export async function updateHost(body: {
	hostId: string;
	name?: string;
	scopes?: string[];
}): Promise<{ error?: string }> {
	try {
		const res = await authFetch("/agent/host/update", {
			method: "POST",
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const json = await res.json();
			return { error: json.message || "Failed to update host" };
		}
		return {};
	} catch (e: unknown) {
		return {
			error: e instanceof Error ? e.message : "Failed to update host",
		};
	}
}
