import { storage } from "./storage";
import type {
	Agent,
	CreatedHost,
	Host,
	PendingApprovalRequest,
	StoredAuthAccount,
	User,
} from "./types";

type ProxyResponse = { ok: boolean; status: number; body: string };

async function getAccountAuth(accountId?: string): Promise<StoredAuthAccount> {
	if (accountId) {
		const accounts = await storage.getAccounts();
		const account = accounts.find((candidate) => candidate.id === accountId);
		if (account) return account;
	}
	const primary = await storage.getPrimaryAccount();
	if (!primary) throw new Error("Not authenticated");
	return primary;
}

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
	data?: PendingApprovalRequest[];
	error?: string;
}> {
	try {
		const accounts = await storage.getAccounts();
		const allRequests: PendingApprovalRequest[] = [];
		for (const account of accounts) {
			const res = await window.electronAPI.apiFetchWithUrl(
				`${account.idpUrl}/api/auth/agent/ciba/pending`,
				account.sessionToken,
			);
			const json = JSON.parse(res.body || "{}");
			if (!res.ok) {
				if (res.status === 401) continue;
				return { error: json.message ?? "Failed to fetch approvals" };
			}
			const accountLabel = new URL(account.idpUrl).hostname;
			allRequests.push(
				...((json.requests ?? []) as PendingApprovalRequest[]).map(
					(request) => ({
						...request,
						account_id: account.id,
						account_label: accountLabel,
						idp_url: account.idpUrl,
					}),
				),
			);
		}
		allRequests.sort(
			(left, right) =>
				new Date(right.created_at).getTime() -
				new Date(left.created_at).getTime(),
		);
		return { data: allRequests };
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function approveRequest(
	request: PendingApprovalRequest,
): Promise<{ error?: string }> {
	try {
		const account = await getAccountAuth(request.account_id);
		const res = await window.electronAPI.apiFetchAbsolute(
			`${account.idpUrl}/api/auth/agent/ciba/approve`,
			account.sessionToken,
			{
				method: "POST",
				body: JSON.stringify({ auth_req_id: request.auth_req_id }),
			},
		);
		if (!res.ok) {
			const json = JSON.parse(res.body);
			return { error: json.message ?? "Failed to approve" };
		}
		return {};
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function denyRequest(
	request: PendingApprovalRequest,
): Promise<{ error?: string }> {
	try {
		const account = await getAccountAuth(request.account_id);
		const res = await window.electronAPI.apiFetchAbsolute(
			`${account.idpUrl}/api/auth/agent/ciba/deny`,
			account.sessionToken,
			{
				method: "POST",
				body: JSON.stringify({ auth_req_id: request.auth_req_id }),
			},
		);
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

export async function listHosts(): Promise<{
	data?: Host[];
	error?: string;
}> {
	try {
		const res = await authFetch("/agent/host/list");
		const json = JSON.parse(res.body);
		if (!res.ok) return { error: json.message ?? "Failed to list devices" };
		return { data: (json.hosts ?? []) as Host[] };
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function createHost(
	name?: string,
	scopes?: string[],
): Promise<{ data?: CreatedHost; error?: string }> {
	try {
		const body: Record<string, unknown> = {};
		if (name) body.name = name;
		if (scopes?.length) body.scopes = scopes;
		const res = await authFetch("/agent/host/create", {
			method: "POST",
			body: JSON.stringify(body),
		});
		const json = JSON.parse(res.body);
		if (!res.ok) return { error: json.message ?? "Failed to create device" };
		return { data: json as CreatedHost };
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function getHost(
	hostId: string,
): Promise<{ data?: Host; error?: string }> {
	try {
		const res = await authFetch(
			`/agent/host/get?hostId=${encodeURIComponent(hostId)}`,
		);
		const json = JSON.parse(res.body);
		if (!res.ok) return { error: json.message ?? "Failed to get device" };
		return { data: json as Host };
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function revokeHost(hostId: string): Promise<{ error?: string }> {
	try {
		const res = await authFetch("/agent/host/revoke", {
			method: "POST",
			body: JSON.stringify({ hostId }),
		});
		if (!res.ok) {
			const json = JSON.parse(res.body);
			return { error: json.message ?? "Failed to revoke device" };
		}
		return {};
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function claimHost(hostId: string): Promise<{
	data?: { host_id: string; user_id: string; status: string };
	error?: string;
}> {
	try {
		const res = await authFetch("/agent/approve-connect-account", {
			method: "POST",
			body: JSON.stringify({ hostId }),
		});
		const json = JSON.parse(res.body);
		if (!res.ok) return { error: json.message ?? "Failed to link device" };
		return { data: json };
	} catch {
		return { error: "Failed to connect" };
	}
}
