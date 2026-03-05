import { storage } from "./storage";
import type { Agent, CibaPendingRequest, User } from "./types";

async function getAuth(): Promise<{ idpUrl: string; token: string }> {
	const idpUrl = await storage.getIdpUrl();
	const token = await storage.getSessionToken();
	if (!idpUrl || !token) throw new Error("Not authenticated");
	return { idpUrl, token };
}

async function authFetch(
	path: string,
	options?: RequestInit,
): Promise<Response> {
	const { idpUrl, token } = await getAuth();
	return fetch(`${idpUrl}/api/auth${path}`, {
		...options,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			...options?.headers,
		},
	});
}

export async function fetchSessionUser(
	idpUrl: string,
	token: string,
): Promise<User | null> {
	try {
		const res = await fetch(`${idpUrl}/api/auth/get-session`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
		});
		if (!res.ok) return null;
		const data = await res.json();
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

/**
 * Try every cookie set on the IDP domain as a potential session token.
 * The first one that successfully authenticates against /get-session wins.
 */
export async function findSessionFromCookies(
	idpUrl: string,
): Promise<{ token: string; user: User } | null> {
	if (typeof chrome === "undefined" || !chrome?.cookies) return null;

	const cookies = await chrome.cookies.getAll({ url: idpUrl });
	for (const cookie of cookies) {
		if (!cookie.value || cookie.value.length < 16) continue;
		const user = await fetchSessionUser(idpUrl, cookie.value);
		if (user) return { token: cookie.value, user };
	}
	return null;
}

export async function verifySession(): Promise<boolean> {
	try {
		const res = await authFetch("/get-session", { method: "GET" });
		return res.ok;
	} catch {
		return false;
	}
}

export async function refreshSessionToken(): Promise<boolean> {
	const idpUrl = await storage.getIdpUrl();
	if (!idpUrl) return false;
	const result = await findSessionFromCookies(idpUrl);
	if (!result) return false;

	const currentToken = await storage.getSessionToken();
	const currentUser = await storage.getUser();

	const tokenChanged = result.token !== currentToken;
	const userChanged =
		!currentUser ||
		currentUser.id !== result.user.id ||
		currentUser.email !== result.user.email ||
		currentUser.name !== result.user.name;

	if (!tokenChanged && !userChanged) return false;

	if (tokenChanged) await storage.setSessionToken(result.token);
	if (userChanged) await storage.setUser(result.user);
	return true;
}

export async function listPendingApprovals(): Promise<{
	data?: CibaPendingRequest[];
	error?: string;
}> {
	try {
		const res = await authFetch("/agent/ciba/pending", { method: "GET" });
		const json = await res.json();
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
			const json = await res.json();
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
			const json = await res.json();
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
		const res = await authFetch("/agent/list", { method: "GET" });
		const text = await res.text();
		let json: Record<string, unknown>;
		try {
			json = JSON.parse(text);
		} catch {
			return {
				error: `Invalid response (${res.status}): ${text.slice(0, 120)}`,
			};
		}
		if (!res.ok)
			return {
				error:
					(json.message as string) ?? `Failed to list agents (${res.status})`,
			};
		const raw = (json.agents as Record<string, unknown>[]) ?? [];
		const agents: Agent[] = raw.map(
			(a: Record<string, unknown> & { permissions?: { scope: string }[] }) => ({
				...a,
				scopes: Array.isArray(a.permissions)
					? a.permissions.map((p: { scope: string }) => p.scope)
					: ((a.scopes as string[]) ?? []),
			}),
		);
		return { data: agents };
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return { error: `Failed to connect: ${msg}` };
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
			return { error: json.message ?? "Failed to revoke agent" };
		}
		return {};
	} catch {
		return { error: "Failed to connect" };
	}
}

export async function fetchReAuthConfig(): Promise<{
	allowedMethods: string[];
}> {
	try {
		const { idpUrl, token } = await getAuth();
		const res = await fetch(`${idpUrl}/api/re-auth-config`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return { allowedMethods: ["password"] };
		const data = await res.json();
		return {
			allowedMethods:
				data.allowedMethods?.length > 0
					? data.allowedMethods
					: ["password"],
		};
	} catch {
		return { allowedMethods: ["password"] };
	}
}

export async function reAuthWithPassword(
	email: string,
	password: string,
): Promise<{ error?: string }> {
	try {
		const { idpUrl } = await getAuth();
		const res = await fetch(`${idpUrl}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});
		const data = await res.json();
		if (!res.ok) {
			return { error: data.message ?? "Incorrect password" };
		}
		if (data.session?.token || data.token) {
			await storage.setSessionToken(data.session?.token ?? data.token);
		}
		if (data.user) {
			await storage.setUser(data.user);
		}
		return {};
	} catch {
		return { error: "Authentication failed" };
	}
}

export async function reAuthSendOtp(
	email: string,
): Promise<{ error?: string }> {
	try {
		const { idpUrl } = await getAuth();
		const res = await fetch(
			`${idpUrl}/api/auth/email-otp/send-verification-otp`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, type: "sign-in" }),
			},
		);
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			return { error: (data as { message?: string }).message ?? "Failed to send code" };
		}
		return {};
	} catch {
		return { error: "Failed to send code" };
	}
}

export async function reAuthVerifyOtp(
	email: string,
	otp: string,
): Promise<{ error?: string }> {
	try {
		const { idpUrl } = await getAuth();
		const res = await fetch(`${idpUrl}/api/auth/sign-in/email-otp`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, otp }),
		});
		const data = await res.json();
		if (!res.ok) {
			return { error: data.message ?? "Invalid code" };
		}
		if (data.session?.token || data.token) {
			await storage.setSessionToken(data.session?.token ?? data.token);
		}
		if (data.user) {
			await storage.setUser(data.user);
		}
		return {};
	} catch {
		return { error: "Verification failed" };
	}
}
