import { describe, expect, it, beforeAll } from "vitest";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { agentAuth as _agentAuth } from "../index";
import { agentAuthClient } from "../client";
import type { AgentAuthOptions, AgentJWK } from "../types";

/**
 * pnpm hoists two copies of @better-auth/core (different better-call
 * peer-dep resolutions). The `BetterAuthPlugin` / `BetterAuthClientPlugin`
 * types are structurally identical but TypeScript treats them as distinct
 * nominal types. These wrappers erase the return type so `getTestInstance`
 * accepts them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentAuth = (opts?: AgentAuthOptions): any => _agentAuth(opts);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentAuthClientPlugin = (): any => agentAuthClient();

async function generateTestKeypair(): Promise<{
	publicKey: AgentJWK;
	privateKey: AgentJWK;
}> {
	const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
		crv: "Ed25519",
		extractable: true,
	});
	return {
		publicKey: (await exportJWK(publicKey)) as AgentJWK,
		privateKey: (await exportJWK(privateKey)) as AgentJWK,
	};
}

async function signTestJWT(opts: {
	privateKey: AgentJWK;
	subject: string;
	audience: string;
	expiresInSeconds?: number;
	capabilityIds?: string[];
	htm?: string;
	htu?: string;
	additionalClaims?: Record<string, unknown>;
}): Promise<string> {
	const key = await importJWK(opts.privateKey, "EdDSA");
	return new SignJWT({
		...(opts.capabilityIds ? { capability_ids: opts.capabilityIds } : {}),
		...(opts.htm ? { htm: opts.htm } : {}),
		...(opts.htu ? { htu: opts.htu } : {}),
		...opts.additionalClaims,
	})
		.setProtectedHeader({ alg: "EdDSA" })
		.setSubject(opts.subject)
		.setAudience(opts.audience)
		.setIssuedAt()
		.setExpirationTime(`${opts.expiresInSeconds ?? 60}s`)
		.setJti(globalThis.crypto.randomUUID())
		.sign(key);
}

const TEST_CAPABILITIES = [
	{
		id: "check_balance",
		title: "Check balance",
		description: "Check account balance",
		http: { method: "GET", url: "https://api.test.com/balance" },
	},
	{
		id: "transfer",
		title: "Transfer funds",
		description: "Transfer money",
		http: { method: "POST", url: "https://api.test.com/transfer" },
	},
	{
		id: "admin_panel",
		title: "Admin panel",
		description: "Access admin panel",
		http: { method: "GET", url: "https://api.test.com/admin" },
	},
];

const BASE = "http://localhost:3000";
const API = `${BASE}/api/auth`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let testUserId: string;

beforeAll(async () => {
	const t = await getTestInstance(
		{
			plugins: [
				agentAuth({
					providerName: "test-service",
					providerDescription: "Test service",
					modes: ["delegated", "autonomous"],
					capabilities: TEST_CAPABILITIES,
					resolveAutonomousUser: async ({ hostId }) => ({
						id: `synthetic_${hostId}`,
						name: "Autonomous User",
						email: `auto_${hostId}@test.local`,
					}),
				dynamicHostDefaultCapabilityIds: ["check_balance"],
				}),
			],
		},
		{
			clientOptions: { plugins: [agentAuthClientPlugin()] },
		},
	);
	auth = t.auth;

	const { headers, user } = await t.signInWithTestUser();
	sessionCookie = headers.get("cookie") ?? "";
	testUserId = user.id;
});

async function api(
	path: string,
	init?: RequestInit,
): Promise<Response> {
	return auth.handler(
		new Request(`${API}${path}`, {
			...init,
			headers: {
				"content-type": "application/json",
				...(init?.headers as Record<string, string> | undefined),
			},
		}),
	);
}

async function authedPost(
	path: string,
	body: unknown,
	extraHeaders?: Record<string, string>,
): Promise<Response> {
	return api(path, {
		method: "POST",
		headers: { cookie: sessionCookie, ...extraHeaders },
		body: JSON.stringify(body),
	});
}

async function authedGet(
	path: string,
	extraHeaders?: Record<string, string>,
): Promise<Response> {
	return api(path, {
		method: "GET",
		headers: { cookie: sessionCookie, ...extraHeaders },
	});
}

async function json<T = unknown>(res: Response): Promise<T> {
	return res.json() as Promise<T>;
}

async function createHostJWT(
	hostPrivateKey: AgentJWK,
	hostPublicKey: AgentJWK,
	agentPublicKey: AgentJWK,
	hostId?: string,
): Promise<string> {
	return signTestJWT({
		privateKey: hostPrivateKey,
		subject: hostId ?? "new-host",
		audience: BASE,
		additionalClaims: {
			host_public_key: hostPublicKey,
			agent_public_key: agentPublicKey,
		},
	});
}

async function createAgentJWT(
	agentPrivateKey: AgentJWK,
	agentId: string,
	opts?: {
		capabilityIds?: string[];
		htm?: string;
		htu?: string;
		expiresInSeconds?: number;
		additionalClaims?: Record<string, unknown>;
	},
): Promise<string> {
	return signTestJWT({
		privateKey: agentPrivateKey,
		subject: agentId,
		audience: BASE,
		...opts,
	});
}

interface GrantRow {
	capability_id: string;
	status: string;
	granted_by?: string | null;
}

/** Register an agent via host JWT. Returns agentId and full response body. */
async function registerAgentViaHost(opts: {
	hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	hostId: string;
	name?: string;
	capabilityIds?: string[];
	mode?: "delegated" | "autonomous";
}): Promise<{ agentId: string; body: Record<string, unknown> }> {
	const hostJWT = await createHostJWT(
		opts.hostKeypair.privateKey,
		opts.hostKeypair.publicKey,
		opts.agentKeypair.publicKey,
		opts.hostId,
	);
	const res = await api("/agent/register", {
		method: "POST",
		headers: { authorization: `Bearer ${hostJWT}` },
		body: JSON.stringify({
			name: opts.name ?? "Test Agent",
			capabilityIds: opts.capabilityIds,
			mode: opts.mode ?? "delegated",
		}),
	});
	expect(res.ok).toBe(true);
	const body = await json<Record<string, unknown>>(res);
	return { agentId: body.agent_id as string, body };
}

describe("Host Management", () => {
	let createdHostId: string;

	it("creates a host via session auth (POST /agent/host/create)", async () => {
		const keypair = await generateTestKeypair();
		const res = await authedPost("/agent/host/create", {
			name: "My Test Host",
			publicKey: keypair.publicKey,
			defaultCapabilityIds: ["check_balance", "transfer"],
		});

		expect(res.ok).toBe(true);
		const body = await json<{ hostId: string; status: string; default_capability_ids: string[] }>(res);
		expect(body.hostId).toBeDefined();
		expect(body.status).toBe("active");
		expect(body.default_capability_ids).toEqual(["check_balance", "transfer"]);
		createdHostId = body.hostId;
	});

	it("lists hosts (GET /agent/host/list)", async () => {
		const res = await authedGet("/agent/host/list");

		expect(res.ok).toBe(true);
		const body = await json<{ hosts: Array<{ id: string; status: string }> }>(res);
		expect(body.hosts).toBeInstanceOf(Array);
		expect(body.hosts.length).toBeGreaterThanOrEqual(1);
		const host = body.hosts.find((h) => h.id === createdHostId);
		expect(host).toBeDefined();
		expect(host!.status).toBe("active");
	});

	it("gets host by ID (GET /agent/host/get)", async () => {
		const res = await authedGet(`/agent/host/get?hostId=${createdHostId}`);

		expect(res.ok).toBe(true);
		const body = await json<{ id: string; status: string }>(res);
		expect(body.id).toBe(createdHostId);
		expect(body.status).toBe("active");
	});

	it("updates host (POST /agent/host/update)", async () => {
		const res = await authedPost("/agent/host/update", {
			hostId: createdHostId,
			name: "Updated Host",
			defaultCapabilityIds: ["check_balance"],
		});

		expect(res.ok).toBe(true);
		const body = await json<{ default_capability_ids: string[] }>(res);
		expect(body.default_capability_ids).toEqual(["check_balance"]);
	});

	it("revokes host and cascades to agents (POST /agent/host/revoke)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Host To Revoke",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
		});

		const revokeRes = await authedPost("/agent/host/revoke", { hostId });

		expect(revokeRes.ok).toBe(true);
		const body = await json<{ status: string; agents_revoked: number }>(revokeRes);
		expect(body.status).toBe("revoked");
		expect(body.agents_revoked).toBeGreaterThanOrEqual(1);
	});
});

describe("Agent Registration", () => {
	it("registers agent via session-owned host with hostJWT", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Session-Owned Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		expect(createRes.ok).toBe(true);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			name: "Session Agent",
			capabilityIds: ["check_balance"],
			mode: "delegated",
		});
		expect(body.agent_id).toBeDefined();
		expect(body.status).toBe("active");
		expect(body.mode).toBe("delegated");
		expect(body.agent_capability_grants).toBeInstanceOf(Array);
	});

	it("registers agent with hostJWT from known host (auto-approved)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Known Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance", "transfer"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance"],
		});

		expect(body.agent_id).toBeDefined();
		expect(body.status).toBe("active");
		expect(body.host_id).toBe(hostId);

		const grants = body.agent_capability_grants as GrantRow[];
		expect(grants).toBeInstanceOf(Array);
		const balanceGrant = grants.find((g) => g.capability_id === "check_balance");
		expect(balanceGrant).toBeDefined();
		expect(balanceGrant!.status).toBe("active");
	});

	it("handles dynamic host registration (unknown host via hostJWT)", async () => {
		const hostKeypair = await generateTestKeypair();
		const agentKeypair = await generateTestKeypair();
		const dynamicHostId = `dynamic-host-${crypto.randomUUID()}`;
		const hostJWT = await createHostJWT(
			hostKeypair.privateKey,
			hostKeypair.publicKey,
			agentKeypair.publicKey,
			dynamicHostId,
		);

		const res = await api("/agent/register", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({
				name: "Dynamic Host Agent",
				mode: "autonomous",
			}),
		});

		expect(res.ok).toBe(true);
		const body = await json<{ agent_id: string; host_id: string }>(res);
		expect(body.agent_id).toBeDefined();
		expect(body.host_id).toBeDefined();
	});

	it("returns agent_capability_grants as array of objects with capability_id and status", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Grants Shape Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			name: "Grants Shape Agent",
			capabilityIds: ["check_balance"],
		});
		const grants = body.agent_capability_grants as GrantRow[];
		expect(grants).toBeInstanceOf(Array);
		expect(grants.length).toBeGreaterThan(0);
		expect(grants[0]).toHaveProperty("capability_id");
		expect(grants[0]).toHaveProperty("status");
	});

	it("resolves requested capabilityIds within host defaults as active grants", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Budget Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance", "transfer"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance"],
		});

		const grants = body.agent_capability_grants as GrantRow[];
		const activeGrants = grants.filter((g) => g.status === "active");
		expect(activeGrants.some((g) => g.capability_id === "check_balance")).toBe(true);
	});

	it("resolves requested capabilityIds outside host defaults as pending grants", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Narrow Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance", "transfer"],
		});

		const grants = body.agent_capability_grants as GrantRow[];
		const pendingGrants = grants.filter((g) => g.status === "pending");
		expect(pendingGrants.some((g) => g.capability_id === "transfer")).toBe(true);
	});

	it("rejects unsupported mode", async () => {
		const res = await api("/agent/register", {
			method: "POST",
			body: JSON.stringify({
				name: "Bad Mode Agent",
				mode: "unsupported_mode",
			}),
		});

		expect(res.ok).toBe(false);
	});

	it("enforces maxAgentsPerUser limit", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
					maxAgentsPerUser: 1,
					modes: ["delegated", "autonomous"],
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		const { headers } = await t.signInWithTestUser();
		const cookie = headers.get("cookie") ?? "";

		const hostKeypair = await generateTestKeypair();
		const createHostRes = await t.auth.handler(
			new Request(`${API}/agent/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Limit Host",
					publicKey: hostKeypair.publicKey,
					defaultCapabilityIds: [],
				}),
			}),
		);
		const { hostId } = await json<{ hostId: string }>(createHostRes);

		const doRegister = async (name: string) => {
			const agentKeypair = await generateTestKeypair();
			const hostJWT = await createHostJWT(
				hostKeypair.privateKey,
				hostKeypair.publicKey,
				agentKeypair.publicKey,
				hostId,
			);
			return t.auth.handler(
				new Request(`${API}/agent/register`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${hostJWT}`,
					},
					body: JSON.stringify({
						name,
						mode: "delegated",
					}),
				}),
			);
		};

		const first = await doRegister("First Agent");
		expect(first.ok).toBe(true);

		const second = await doRegister("Second Agent");
		expect(second.ok).toBe(false);
	});
});

describe("Agent Auth (JWT middleware)", () => {
	let agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	let agentId: string;

	beforeAll(async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Middleware Test Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		agentKeypair = await generateTestKeypair();
		const reg = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance"],
		});
		agentId = reg.agentId;
	});

	it("authenticates with valid agent JWT", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});

		expect(res.ok).toBe(true);
		const body = await json<{ agent_id: string }>(res);
		expect(body.agent_id).toBe(agentId);
	});

	it("detects JWT replay (same jti rejected)", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);

		const first = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(first.ok).toBe(true);

		const second = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(second.ok).toBe(false);
		expect(second.status).toBe(401);
	});

	it("rejects expired JWT", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId, {
			expiresInSeconds: -1,
		});

		const res = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
	});

	it("rejects revoked agent", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Revoke Agent Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const revokeAgentKeypair = await generateTestKeypair();
		const { agentId: revokedId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair: revokeAgentKeypair,
			hostId,
		});

		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			audience: BASE,
		});
		const revokeRes = await api("/agent/revoke", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agentId: revokedId }),
		});
		expect(revokeRes.ok).toBe(true);

		const jwt = await createAgentJWT(revokeAgentKeypair.privateKey, revokedId);
		const statusRes = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(statusRes.ok).toBe(false);
		expect(statusRes.status).toBe(401);
	});

	it("validates request binding (htm/htu mismatch)", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId, {
			htm: "POST",
			htu: `${BASE}/api/auth/agent/status`,
		});

		const res = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
	});
});

describe("Status & Introspection", () => {
	let agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	let agentId: string;

	beforeAll(async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Status Test Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance", "transfer"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		agentKeypair = await generateTestKeypair();
		const reg = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance", "transfer"],
		});
		agentId = reg.agentId;
	});

	it("GET /agent/status returns agent_capability_grants array", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			agent_id: string;
			agent_capability_grants: GrantRow[];
		}>(res);
		expect(body.agent_id).toBe(agentId);
		expect(body.agent_capability_grants).toBeInstanceOf(Array);
		expect(body.agent_capability_grants.length).toBeGreaterThanOrEqual(1);
		expect(body.agent_capability_grants[0]).toHaveProperty("capability_id");
		expect(body.agent_capability_grants[0]).toHaveProperty("status");
	});

	it("POST /agent/introspect validates JWT and returns grants", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			active: boolean;
			agent_id: string;
			agent_capability_grants: GrantRow[];
		}>(res);
		expect(body.active).toBe(true);
		expect(body.agent_id).toBe(agentId);
		expect(body.agent_capability_grants).toBeInstanceOf(Array);
	});

	it("introspect with capability_ids claim narrows returned grants", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId, {
			capabilityIds: ["check_balance"],
		});
		const res = await api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			active: boolean;
			agent_capability_grants: GrantRow[];
		}>(res);
		expect(body.active).toBe(true);
		const capIds = body.agent_capability_grants.map((g) => g.capability_id);
		expect(capIds).toContain("check_balance");
		expect(capIds).not.toContain("transfer");
	});

	it("introspect returns inactive for bad token", async () => {
		const res = await api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: "invalid.jwt.token" }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{ active: boolean }>(res);
		expect(body.active).toBe(false);
	});
});

describe("Capability Management", () => {
	it("request-capability auto-approves within host budget", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Cap Budget Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance", "transfer", "admin_panel"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance"],
		});

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await api("/agent/request-capability", {
			method: "POST",
			headers: { authorization: `Bearer ${jwt}` },
			body: JSON.stringify({ capabilityIds: ["transfer"] }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			status: string;
			agent_capability_grants: GrantRow[];
		}>(res);
		expect(body.status).toBe("granted");
		expect(
			body.agent_capability_grants.some(
				(g) => g.capability_id === "transfer" && g.status === "active",
			),
		).toBe(true);
	});

	it("request-capability creates pending for out-of-budget capabilities", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Narrow Cap Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance"],
		});

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await api("/agent/request-capability", {
			method: "POST",
			headers: { authorization: `Bearer ${jwt}` },
			body: JSON.stringify({ capabilityIds: ["admin_panel"] }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			status: string;
			agent_capability_grants: GrantRow[];
		}>(res);
		expect(body.status).toBe("pending");
		expect(
			body.agent_capability_grants.some(
				(g) => g.capability_id === "admin_panel" && g.status === "pending",
			),
		).toBe(true);
	});

	it("approve-capability approves pending grants", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Approve Cap Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance", "transfer"],
		});

		const approveRes = await authedPost("/agent/approve-capability", {
			agentId,
			action: "approve",
		});

		expect(approveRes.ok).toBe(true);
		const body = await json<{ status: string; added: string[] }>(approveRes);
		expect(body.status).toBe("approved");
		expect(body.added).toContain("transfer");
	});

	it("approve-capability denies pending grants", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Deny Cap Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance", "admin_panel"],
		});

		const denyRes = await authedPost("/agent/approve-capability", {
			agentId,
			action: "deny",
		});

		expect(denyRes.ok).toBe(true);
		const body = await json<{ status: string }>(denyRes);
		expect(body.status).toBe("denied");
	});

	it("grant-capability directly grants capabilities", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Direct Grant Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: [],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			name: "Direct Grant Agent",
		});

		const grantRes = await authedPost("/agent/grant-capability", {
			agentId,
			capabilityIds: ["transfer", "admin_panel"],
		});

		expect(grantRes.ok).toBe(true);
		const body = await json<{ agentId: string; added: string[] }>(grantRes);
		expect(body.agentId).toBe(agentId);
		expect(body.added).toContain("transfer");
		expect(body.added).toContain("admin_panel");
	});
});

describe("Agent Lifecycle", () => {
	it("revokes agent via host JWT (POST /agent/revoke)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Lifecycle Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
		});

		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			audience: BASE,
		});
		const revokeRes = await api("/agent/revoke", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agentId }),
		});

		expect(revokeRes.ok).toBe(true);
		const body = await json<{ agent_id: string; status: string }>(revokeRes);
		expect(body.status).toBe("revoked");
		expect(body.agent_id).toBe(agentId);
	});

	it("rotates agent key (POST /agent/rotate-key)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Rotate Key Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
		});

		const oldJwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const newKeypair = await generateTestKeypair();

		const rotateRes = await api("/agent/rotate-key", {
			method: "POST",
			headers: { authorization: `Bearer ${oldJwt}` },
			body: JSON.stringify({ publicKey: newKeypair.publicKey }),
		});

		expect(rotateRes.ok).toBe(true);
		const body = await json<{ agent_id: string; status: string }>(rotateRes);
		expect(body.agent_id).toBe(agentId);
		expect(body.status).toBe("active");

		const newJwt = await createAgentJWT(newKeypair.privateKey, agentId);
		const statusRes = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${newJwt}` },
		});
		expect(statusRes.ok).toBe(true);
	});

	it("cleanup marks expired agents", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
					agentSessionTTL: 1,
					modes: ["delegated", "autonomous"],
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		const { headers } = await t.signInWithTestUser();
		const cookie = headers.get("cookie") ?? "";

		const hostKeypair = await generateTestKeypair();
		const hostCreateRes = await t.auth.handler(
			new Request(`${API}/agent/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Cleanup Host",
					publicKey: hostKeypair.publicKey,
					defaultCapabilityIds: [],
				}),
			}),
		);
		const { hostId } = await json<{ hostId: string }>(hostCreateRes);

		const agentKeypair = await generateTestKeypair();
		const hostJWT = await createHostJWT(
			hostKeypair.privateKey,
			hostKeypair.publicKey,
			agentKeypair.publicKey,
			hostId,
		);
		const regRes = await t.auth.handler(
			new Request(`${API}/agent/register`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${hostJWT}`,
				},
				body: JSON.stringify({
					name: "Short-Lived",
					mode: "delegated",
				}),
			}),
		);
		expect(regRes.ok).toBe(true);

		await new Promise((r) => setTimeout(r, 1500));

		const cleanupRes = await t.auth.handler(
			new Request(`${API}/agent/cleanup`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
			}),
		);

		expect(cleanupRes.ok).toBe(true);
		const body = await json<{ expired: number }>(cleanupRes);
		expect(body.expired).toBeGreaterThanOrEqual(1);
	});

	it("reactivation with capability decay", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						agentSessionTTL: 1,
					agentMaxLifetime: 86400,
					modes: ["delegated", "autonomous"],
					capabilities: TEST_CAPABILITIES,
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		const { headers: authHeaders } = await t.signInWithTestUser();
		const cookie = authHeaders.get("cookie") ?? "";

		const hostKeypair = await generateTestKeypair();
		const createRes = await t.auth.handler(
			new Request(`${API}/agent/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Reactivation Host",
					publicKey: hostKeypair.publicKey,
					defaultCapabilityIds: ["check_balance"],
				}),
			}),
		);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const hostJWT = await createHostJWT(
			hostKeypair.privateKey,
			hostKeypair.publicKey,
			agentKeypair.publicKey,
			hostId,
		);
		const regRes = await t.auth.handler(
			new Request(`${API}/agent/register`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${hostJWT}`,
				},
				body: JSON.stringify({
					name: "Reactivation Agent",
					capabilityIds: ["check_balance"],
					mode: "delegated",
				}),
			}),
		);
		const { agent_id: agentId } = await json<{ agent_id: string }>(regRes);

		await new Promise((r) => setTimeout(r, 1500));

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const statusRes = await t.auth.handler(
			new Request(`${API}/agent/status`, {
				method: "GET",
				headers: { authorization: `Bearer ${jwt}` },
			}),
		);

		expect(statusRes.ok).toBe(true);
		const body = await json<{
			agent_id: string;
			status: string;
			agent_capability_grants: GrantRow[];
		}>(statusRes);
		expect(body.agent_id).toBe(agentId);
		expect(body.status).toBe("active");
	});
});

describe("Discovery", () => {
	it("GET /agent/discover returns spec-compliant config with version 1.0-draft", async () => {
		const res = await api("/agent/discover", { method: "GET" });

		expect(res.ok).toBe(true);
		const body = await json<{
			version: string;
			provider_name: string;
			modes: string[];
			algorithms: string[];
			endpoints: Record<string, string>;
		}>(res);
		expect(body.version).toBe("1.0-draft");
		expect(body.provider_name).toBe("test-service");
		expect(body.modes).toEqual(["delegated", "autonomous"]);
		expect(body.algorithms).toEqual(["Ed25519"]);
		expect(body.endpoints).toBeDefined();
		expect(body.endpoints.register).toBe("/agent/register");
		expect(body.endpoints.capabilities).toBe("/agent/capabilities");
		expect(body.endpoints.status).toBe("/agent/status");
		expect(body.endpoints.introspect).toBe("/agent/introspect");
	});
});

describe("Capabilities Endpoint", () => {
	it("GET /agent/capabilities returns list with id and http descriptor", async () => {
		const res = await api("/agent/capabilities", { method: "GET" });

		expect(res.ok).toBe(true);
		const body = await json<{
			capabilities: Array<{ id: string; http: { method: string; url: string } }>;
			has_more: boolean;
		}>(res);
		expect(body.capabilities).toBeInstanceOf(Array);
		expect(body.capabilities.length).toBe(3);
		expect(body.capabilities[0]).toHaveProperty("id");
		expect(body.capabilities[0]).toHaveProperty("http");
		expect(body.capabilities[0].http).toHaveProperty("method");
	});

	it("includes grant_status when called with agent JWT", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Cap Endpoint Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance"],
		});

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await api("/agent/capabilities", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			capabilities: Array<{ id: string; grant_status: string }>;
		}>(res);

		const checkBalance = body.capabilities.find((c) => c.id === "check_balance");
		const transfer = body.capabilities.find((c) => c.id === "transfer");
		expect(checkBalance).toBeDefined();
		expect(checkBalance!.grant_status).toBe("granted");
		expect(transfer).toBeDefined();
		expect(transfer!.grant_status).toBe("not_granted");
	});

	it("supports intent filtering", async () => {
		const res = await api("/agent/capabilities?intent=balance", { method: "GET" });

		expect(res.ok).toBe(true);
		const body = await json<{
			capabilities: Array<{ id: string }>;
		}>(res);
		const ids = body.capabilities.map((c) => c.id);
		expect(ids).toContain("check_balance");
		expect(ids).not.toContain("admin_panel");
	});
});

describe("Agent Session", () => {
	it("GET /agent/session returns full agent session object", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Session Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilityIds: ["check_balance"],
		});

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await api("/agent/session", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			type: string;
			agent: {
				id: string;
				mode: string;
				capabilityGrants: Array<{ capabilityId: string; status: string }>;
			};
			user: { id: string };
		}>(res);

		expect(body.type).toBe("delegated");
		expect(body.agent.id).toBe(agentId);
		expect(body.agent.mode).toBe("delegated");
		expect(body.agent.capabilityGrants).toBeInstanceOf(Array);
		expect(body.user).toBeDefined();
		expect(body.user.id).toBe(testUserId);
	});
});

describe("Edge Cases", () => {
	it("rejects registration without any auth", async () => {
		const res = await api("/agent/register", {
			method: "POST",
			body: JSON.stringify({ name: "No Auth", mode: "delegated" }),
		});
		expect(res.ok).toBe(false);
	});

	it("introspect returns inactive for revoked agent", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/agent/host/create", {
			name: "Introspect Revoke Host",
			publicKey: hostKeypair.publicKey,
			defaultCapabilityIds: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
		});

		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			audience: BASE,
		});
		await api("/agent/revoke", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agentId }),
		});

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{ active: boolean }>(res);
		expect(body.active).toBe(false);
	});

	it("get-host returns NOT_FOUND for unknown host", async () => {
		const res = await authedGet("/agent/host/get?hostId=nonexistent");
		expect(res.ok).toBe(false);
		expect(res.status).toBe(404);
	});

	it("host create without publicKey uses enrollment flow", async () => {
		const res = await authedPost("/agent/host/create", {
			name: "Enrollment Host",
			defaultCapabilityIds: ["check_balance"],
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			status: string;
			enrollmentToken: string;
		}>(res);
		expect(body.status).toBe("pending_enrollment");
		expect(body.enrollmentToken).toBeDefined();
	});
});
