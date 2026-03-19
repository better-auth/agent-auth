import { storage } from "./storage";
import type {
  Agent,
  CreatedHost,
  Host,
  PendingApprovalRequest,
  StoredAuthAccount,
  User,
} from "./types";

async function getAuth(): Promise<{ idpUrl: string; token: string }> {
  const account = await storage.getPrimaryAccount();
  if (!account) throw new Error("Not authenticated");
  return { idpUrl: account.idpUrl, token: account.sessionToken };
}

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

async function authFetch(path: string, options?: RequestInit): Promise<Response> {
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

export async function fetchSessionUser(idpUrl: string, token: string): Promise<User | null> {
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
  data?: PendingApprovalRequest[];
  error?: string;
}> {
  try {
    const accounts = await storage.getAccounts();
    const allRequests: PendingApprovalRequest[] = [];
    for (const account of accounts) {
      const res = await fetch(`${account.idpUrl}/api/auth/agent/ciba/pending`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.sessionToken}`,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) continue;
        return { error: json.message ?? "Failed to fetch approvals" };
      }
      const accountLabel = new URL(account.idpUrl).hostname;
      allRequests.push(
        ...((json.requests ?? []) as PendingApprovalRequest[]).map((request) => ({
          ...request,
          account_id: account.id,
          account_label: accountLabel,
          idp_url: account.idpUrl,
        })),
      );
    }
    allRequests.sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
    return { data: allRequests };
  } catch {
    return { error: "Failed to connect" };
  }
}

export async function approveRequest(request: PendingApprovalRequest): Promise<{ error?: string }> {
  try {
    const account = await getAccountAuth(request.account_id);
    const res = await fetch(`${account.idpUrl}/api/auth/agent/approve-capability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.sessionToken}`,
      },
      body: JSON.stringify({
        approval_id: request.approval_id,
        action: "approve",
      }),
    });
    if (!res.ok) {
      const json = await res.json();
      return { error: json.message ?? "Failed to approve" };
    }
    return {};
  } catch {
    return { error: "Failed to connect" };
  }
}

export async function denyRequest(request: PendingApprovalRequest): Promise<{ error?: string }> {
  try {
    const account = await getAccountAuth(request.account_id);
    const res = await fetch(`${account.idpUrl}/api/auth/agent/approve-capability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.sessionToken}`,
      },
      body: JSON.stringify({
        approval_id: request.approval_id,
        action: "deny",
      }),
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
        error: (json.message as string) ?? `Failed to list agents (${res.status})`,
      };
    const raw = (json.agents as Record<string, unknown>[]) ?? [];
    const agents: Agent[] = raw.map(
      (a: Record<string, unknown> & { permissions?: { scope: string }[] }) =>
        ({
          ...a,
          scopes: Array.isArray(a.permissions)
            ? a.permissions.map((p: { scope: string }) => p.scope)
            : ((a.scopes as string[]) ?? []),
        }) as Agent,
    );
    return { data: agents };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `Failed to connect: ${msg}` };
  }
}

export async function revokeAgent(agentId: string): Promise<{ error?: string }> {
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
      allowedMethods: data.allowedMethods?.length > 0 ? data.allowedMethods : ["password"],
    };
  } catch {
    return { allowedMethods: ["password"] };
  }
}

export async function listHosts(): Promise<{
  data?: Host[];
  error?: string;
}> {
  try {
    const res = await authFetch("/agent/host/list");
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return {
        error: (json as { message?: string }).message ?? "Failed to list devices",
      };
    }
    const json = await res.json();
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
    const json = await res.json();
    if (!res.ok)
      return {
        error: (json as { message?: string }).message ?? "Failed to create device",
      };
    return { data: json as CreatedHost };
  } catch {
    return { error: "Failed to connect" };
  }
}

export async function getHost(hostId: string): Promise<{ data?: Host; error?: string }> {
  try {
    const res = await authFetch(`/agent/host/get?hostId=${encodeURIComponent(hostId)}`);
    const json = await res.json();
    if (!res.ok)
      return {
        error: (json as { message?: string }).message ?? "Failed to get device",
      };
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
      const json = await res.json();
      return {
        error: (json as { message?: string }).message ?? "Failed to revoke device",
      };
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
    const json = await res.json();
    if (!res.ok)
      return {
        error: (json as { message?: string }).message ?? "Failed to link device",
      };
    return {
      data: json as { host_id: string; user_id: string; status: string },
    };
  } catch {
    return { error: "Failed to connect" };
  }
}
