import { storage } from "./storage";
import type { Agent, CibaPendingRequest, User } from "./types";

type ProxyResponse = { ok: boolean; status: number; body: string };

async function authFetch(
	path: string,
	options?: { method?: string; body?: string },
): Promise<ProxyResponse> {
	return window.electronAPI.apiFetch(path, options);
}

export async function fetchSessionUser(
	idpUrl: string,
	token: string,
): Promise<User | null> {
	try {
		const res: ProxyResponse = await window.electronAPI.apiFetchWithUrl(
			`${idpUrl}/api/auth/get-session`,
			token,
		);
		if (!res.ok) return null;
		const data = JSON.parse(res.body);
		if (!data?.user) return null;
		return {
			id: data.user.id,
			name: data.user.name ?? data.user.email,
			email: data.user.email,
			image: data.user.image ?? null,
		};
	} catch {
		return null;
	}
}

export async function verifySession(): Promise<boolean> {
	try {
		const res = await authFetch("/get-session");
		return res.ok;
	} catch {
		return false;
	}
}

export async function listPendingApprovals(): Promise<{
	data?: CibaPendingRequest[];
	error?: string;
}> {
	try {
		const res = await authFetch("/agent/ciba/pending");
		const json = JSON.parse(res.body);
		if (!res.ok) return { error: json.message ?? "Failed to fetch approvals" };
		return { data: json.requests ?? [] };
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function approveRequest(
	authReqId: string,
): Promise<{ error?: string; code?: string }> {
	try {
		const res = await authFetch("/agent/ciba/approve", {
			method: "POST",
			body: JSON.stringify({ auth_req_id: authReqId }),
		});
		if (!res.ok) {
			const json = JSON.parse(res.body);
			const message = json.message ?? "Failed to approve";
			const isFreshSession =
				typeof message === "string" &&
				message.includes("FRESH_SESSION_REQUIRED");
			return {
				error: message,
				code: isFreshSession ? "FRESH_SESSION_REQUIRED" : undefined,
			};
		}
		return {};
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function denyRequest(
	authReqId: string,
): Promise<{ error?: string }> {
	try {
		const res = await authFetch("/agent/ciba/deny", {
			method: "POST",
			body: JSON.stringify({ auth_req_id: authReqId }),
		});
		if (!res.ok) {
			const json = JSON.parse(res.body);
			return { error: json.message ?? "Failed to deny" };
		}
		return {};
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function listAgents(): Promise<{
	data?: Agent[];
	error?: string;
}> {
	try {
		const res = await authFetch("/agent/list");
		const json = JSON.parse(res.body);
		if (!res.ok) return { error: json.message ?? "Failed to list agents" };
		const raw = json.agents ?? json ?? [];
		const agents: Agent[] = raw.map(
			(a: Record<string, unknown> & { permissions?: { scope: string }[] }) => ({
				...a,
				scopes: Array.isArray(a.permissions)
					? a.permissions.map((p) => p.scope)
					: (a.scopes ?? []),
			}),
		);
		return { data: agents };
	} catch {
		return { error: "Failed to connect" };
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
			const json = JSON.parse(res.body);
			return { error: json.message ?? "Failed to revoke agent" };
		}
		return {};
	} catch {
		return { error: "Failed to connect" };
	}
}
