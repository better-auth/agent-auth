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
	scopes?: string[];
}): Promise<{ data?: Partial<Agent>; error?: string }> {
	try {
		const res = await authFetch("/agent/update", {
			method: "POST",
			body: JSON.stringify(body),
		});
		const json = await res.json();
		if (!res.ok) return { error: json.message || "Failed to update agent" };
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
	limit?: number;
	offset?: number;
}): Promise<{ data?: AgentActivity[] }> {
	try {
		const url = new URL("/api/agent/activity", window.location.origin);
		url.searchParams.set("agentId", params.agentId);
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
