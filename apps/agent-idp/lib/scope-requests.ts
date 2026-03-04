import { randomBytes } from "node:crypto";

export type ScopeRequest = {
	id: string;
	agentId: string;
	agentName: string;
	newName?: string;
	userId: string;
	existingScopes: string[];
	requestedScopes: string[];
	status: "pending" | "approved" | "denied";
	createdAt: number;
};

const TTL_MS = 5 * 60 * 1000;
const GLOBAL_KEY = "__scope_requests_store__" as const;

function getStore(): Map<string, ScopeRequest> {
	const g = globalThis as Record<string, unknown>;
	if (!g[GLOBAL_KEY]) {
		g[GLOBAL_KEY] = new Map<string, ScopeRequest>();
	}
	return g[GLOBAL_KEY] as Map<string, ScopeRequest>;
}

function prune() {
	const store = getStore();
	const now = Date.now();
	for (const [id, req] of store) {
		if (now - req.createdAt > TTL_MS) store.delete(id);
	}
}

export function createScopeRequest(
	opts: Omit<ScopeRequest, "id" | "status" | "createdAt">,
): ScopeRequest {
	prune();
	const id = randomBytes(16).toString("base64url");
	const req: ScopeRequest = {
		...opts,
		id,
		status: "pending",
		createdAt: Date.now(),
	};
	getStore().set(id, req);
	return req;
}

export function getScopeRequest(id: string): ScopeRequest | null {
	prune();
	return getStore().get(id) ?? null;
}

export function approveScopeRequest(id: string): ScopeRequest | null {
	const req = getStore().get(id);
	if (!req || req.status !== "pending") return null;
	req.status = "approved";
	return req;
}

export function denyScopeRequest(id: string): ScopeRequest | null {
	const req = getStore().get(id);
	if (!req || req.status !== "pending") return null;
	req.status = "denied";
	return req;
}
