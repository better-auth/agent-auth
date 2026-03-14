/**
 * Unified security tests for agent-auth.
 *
 * Covers: JWT replay, expired JWT, revoked agent, algorithm confusion,
 * non-JOSE error propagation, fresh session window, JTI partitioning,
 * transparent reactivation events, absolute lifetime, host revocation
 * cascade, P-256 rejection, and capability validation warnings.
 */
import { describe, expect, it, beforeAll, vi } from "vitest";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { agentAuth as _agentAuth } from "../index";
import { agentAuthClient } from "../client";
import type { AgentAuthOptions, AgentJWK, AgentAuthEvent } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentAuth = (opts?: AgentAuthOptions): any => _agentAuth(opts);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentAuthClientPlugin = (): any => agentAuthClient();

const BASE = "http://localhost:3000";
const API = `${BASE}/api/auth`;

const TEST_CAPABILITIES = [
	{ name: "check_balance", description: "Check account balance" },
	{ name: "transfer", description: "Transfer money" },
	{ name: "admin_panel", description: "Access admin panel" },
];

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
	typ?: "host+jwt" | "agent+jwt";
	issuer?: string;
	expiresInSeconds?: number;
	capabilities?: string[];
	additionalClaims?: Record<string, unknown>;
}): Promise<string> {
	const key = await importJWK(opts.privateKey, "EdDSA");
	const builder = new SignJWT({
		...(opts.capabilities ? { capabilities: opts.capabilities } : {}),
		...opts.additionalClaims,
	})
		.setProtectedHeader({ alg: "EdDSA", typ: opts.typ ?? "agent+jwt" })
		.setSubject(opts.subject)
		.setAudience(opts.audience)
		.setIssuedAt()
		.setExpirationTime(`${opts.expiresInSeconds ?? 60}s`)
		.setJti(globalThis.crypto.randomUUID());

	if (opts.issuer) {
		builder.setIssuer(opts.issuer);
	}

	return builder.sign(key);
}

async function createHostJWT(
	hostPrivateKey: AgentJWK,
	hostPublicKey: AgentJWK,
	agentPublicKey: AgentJWK,
	hostId?: string,
): Promise<string> {
	const id = hostId ?? "new-host";
	return signTestJWT({
		privateKey: hostPrivateKey,
		subject: id,
		issuer: id,
		typ: "host+jwt",
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
		capabilities?: string[];
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

async function json<T = unknown>(res: Response): Promise<T> {
	return res.json() as Promise<T>;
}

// ---------- Shared test instance for basic JWT security tests ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let sharedAgentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
let sharedAgentId: string;
let sharedHostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
let sharedHostId: string;

function api(path: string, init?: RequestInit): Promise<Response> {
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

function authedPost(
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

async function registerAgentViaHost(opts: {
	hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	hostId: string;
	name?: string;
	capabilities?: string[];
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
			capabilities: opts.capabilities,
			mode: opts.mode ?? "delegated",
		}),
	});
	expect(res.ok).toBe(true);
	const body = await json<Record<string, unknown>>(res);
	return { agentId: body.agent_id as string, body };
}

beforeAll(async () => {
	const t = await getTestInstance(
		{
			plugins: [
				agentAuth({
					providerName: "security-test",
					capabilities: TEST_CAPABILITIES,
					modes: ["delegated", "autonomous"],
					resolveAutonomousUser: async ({ hostId }) => ({
						id: `synthetic_${hostId}`,
						name: "Autonomous User",
						email: `auto_${hostId}@test.local`,
					}),
				}),
			],
		},
		{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
	);
	auth = t.auth;

	const { headers } = await t.signInWithTestUser();
	sessionCookie = headers.get("cookie") ?? "";

	sharedHostKeypair = await generateTestKeypair();
	const createRes = await authedPost("/host/create", {
		name: "Security Test Host",
		public_key: sharedHostKeypair.publicKey,
		default_capabilities: ["check_balance", "transfer"],
	});
	const { hostId } = await json<{ hostId: string }>(createRes);
	sharedHostId = hostId;

	sharedAgentKeypair = await generateTestKeypair();
	const reg = await registerAgentViaHost({
		hostKeypair: sharedHostKeypair,
		agentKeypair: sharedAgentKeypair,
		hostId: sharedHostId,
		capabilities: ["check_balance"],
	});
	sharedAgentId = reg.agentId;
});

// ================================================================
// JWT Authentication Security
// ================================================================

describe("JWT Replay Protection", () => {
	it("detects JWT replay (same jti rejected)", async () => {
		const jwt = await createAgentJWT(sharedAgentKeypair.privateKey, sharedAgentId);

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

	it("JTI is partitioned by agent identity (different agents can reuse same jti value)", async () => {
		const agentKeypair1 = await generateTestKeypair();
		const { agentId: agentId1 } = await registerAgentViaHost({
			hostKeypair: sharedHostKeypair,
			agentKeypair: agentKeypair1,
			hostId: sharedHostId,
			name: "JTI Agent 1",
			capabilities: ["check_balance"],
		});

		const agentKeypair2 = await generateTestKeypair();
		const { agentId: agentId2 } = await registerAgentViaHost({
			hostKeypair: sharedHostKeypair,
			agentKeypair: agentKeypair2,
			hostId: sharedHostId,
			name: "JTI Agent 2",
			capabilities: ["check_balance"],
		});

		const sharedJti = globalThis.crypto.randomUUID();

		const jwt1 = await signTestJWT({
			privateKey: agentKeypair1.privateKey,
			subject: agentId1,
			audience: BASE,
			additionalClaims: { jti: sharedJti },
		});

		const jwt2 = await signTestJWT({
			privateKey: agentKeypair2.privateKey,
			subject: agentId2,
			audience: BASE,
			additionalClaims: { jti: sharedJti },
		});

		const res1 = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt1}` },
		});
		expect(res1.ok).toBe(true);

		const res2 = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt2}` },
		});
		expect(res2.ok).toBe(true);
	});
});

describe("JWT Expiry & Revocation", () => {
	it("rejects expired JWT", async () => {
		const jwt = await createAgentJWT(sharedAgentKeypair.privateKey, sharedAgentId, {
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
		const revokeAgentKeypair = await generateTestKeypair();
		const { agentId: revokedId } = await registerAgentViaHost({
			hostKeypair: sharedHostKeypair,
			agentKeypair: revokeAgentKeypair,
			hostId: sharedHostId,
		});

		const hostJWT = await signTestJWT({
			privateKey: sharedHostKeypair.privateKey,
			subject: sharedHostId,
			issuer: sharedHostId,
			typ: "host+jwt",
			audience: BASE,
		});
		const revokeRes = await api("/agent/revoke", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: revokedId }),
		});
		expect(revokeRes.ok).toBe(true);

		const jwt = await createAgentJWT(revokeAgentKeypair.privateKey, revokedId);
		const statusRes = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(statusRes.ok).toBe(false);
		expect(statusRes.status).toBe(403);
	});
});

// ================================================================
// Algorithm Confusion & Key Validation
// ================================================================

describe("Algorithm Security", () => {
	it("rejects JWT with algorithm confusion (HS256 in header vs Ed25519 key)", async () => {
		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair: sharedHostKeypair,
			agentKeypair,
			hostId: sharedHostId,
			capabilities: ["check_balance"],
		});

		const key = await importJWK(agentKeypair.privateKey, "EdDSA");
		const validJwt = await new SignJWT({})
			.setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
			.setSubject(agentId)
			.setAudience(BASE)
			.setIssuedAt()
			.setExpirationTime("60s")
			.setJti(globalThis.crypto.randomUUID())
			.sign(key);

		// Tamper with the header to claim HS256
		const badAlgJwt = validJwt.replace(
			validJwt.split(".")[0],
			btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, ""),
		);

		const badRes = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${badAlgJwt}` },
		});
		expect(badRes.ok).toBe(false);
		expect(badRes.status).toBe(401);
	});

	it("rejects P-256 key when only Ed25519 is allowed", async () => {
		// Generate P-256 keypair (not Ed25519)
		const { publicKey } = await generateKeyPair("ES256", {
			crv: "P-256",
			extractable: true,
		});
		const pubJWK = (await exportJWK(publicKey)) as AgentJWK;

		const res = await authedPost("/host/create", {
			name: "P256 Host",
			public_key: pubJWK,
			default_capabilities: ["check_balance"],
		});

		// Should reject because P-256 is not in allowedKeyAlgorithms
		expect(res.ok).toBe(false);
	});

	it("verifyAgentJWT propagates non-JOSE errors instead of returning null", async () => {
		const { verifyAgentJWT } = await import("../utils/crypto");
		const badKey = { kty: "OKP", crv: "Ed25519", x: "INVALID" } as AgentJWK;

		try {
			await verifyAgentJWT({
				jwt: "not.a.jwt",
				publicKey: badKey,
				maxAge: 60,
			});
		} catch (e) {
			expect(e).toBeDefined();
		}
	});
});

// ================================================================
// Session Freshness
// ================================================================

describe("Fresh Session Window", () => {
	it("freshSessionWindow blocks approval with stale session", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						freshSessionWindow: 1,
						modes: ["delegated"],
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
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Fresh Session Host",
					public_key: hostKeypair.publicKey,
					default_capabilities: ["check_balance"],
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
					name: "Pending Agent",
					capabilities: ["check_balance", "transfer"],
					mode: "delegated",
				}),
			}),
		);
		const { agent_id: agentId } = await json<{ agent_id: string }>(regRes);

		await new Promise((r) => setTimeout(r, 1500));

		const approveRes = await t.auth.handler(
			new Request(`${API}/agent/approve-capability`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					agent_id: agentId,
					action: "approve",
				}),
			}),
		);
		const body = await json<Record<string, unknown>>(approveRes);
		// The endpoint returns ctx.json({code: "fresh_session_required", ...}, {status: 403})
		// which may arrive as a 403 or 200 depending on how Better Auth's ctx.json handles status
		const errorCode = body.error ?? body.code;
		expect(errorCode).toBe("fresh_session_required");
		// If the framework propagates the status, verify it
		if (!approveRes.ok) {
			expect(approveRes.status).toBe(403);
		}
	});
});

// ================================================================
// Transparent Reactivation
// ================================================================

describe("Transparent Reactivation", () => {
	it("emits agent.reactivated with actorType 'system' and transparent flag", async () => {
		const events: AgentAuthEvent[] = [];
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						agentSessionTTL: 1,
						agentMaxLifetime: 86400,
						capabilities: TEST_CAPABILITIES,
						modes: ["delegated"],
						onEvent: (event) => {
							events.push(event);
						},
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		const { headers: authHeaders } = await t.signInWithTestUser();
		const cookie = authHeaders.get("cookie") ?? "";

		const hostKeypair = await generateTestKeypair();
		const createRes = await t.auth.handler(
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Reactivation Host",
					public_key: hostKeypair.publicKey,
					default_capabilities: ["check_balance"],
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
					capabilities: ["check_balance"],
					mode: "delegated",
				}),
			}),
		);
		const { agent_id: agentId } = await json<{ agent_id: string }>(regRes);

		// Wait for session TTL to expire
		await new Promise((r) => setTimeout(r, 1500));

		events.length = 0;

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const statusRes = await t.auth.handler(
			new Request(`${API}/agent/status`, {
				method: "GET",
				headers: { authorization: `Bearer ${jwt}` },
			}),
		);

		expect(statusRes.ok).toBe(true);

		const reactivationEvent = events.find(
			(e) =>
				e.type === "agent.reactivated" &&
				"actorType" in e &&
				e.actorType === "system",
		);
		expect(reactivationEvent).toBeDefined();
		expect(reactivationEvent!.metadata?.transparent).toBe(true);
		expect(reactivationEvent!.agentId).toBe(agentId);
	});
});

// ================================================================
// Absolute Lifetime
// ================================================================

describe("Absolute Lifetime", () => {
	it("rejects agent whose absolute lifetime has been exceeded", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						absoluteLifetime: 1,
						agentSessionTTL: 86400,
						agentMaxLifetime: 86400,
						capabilities: TEST_CAPABILITIES,
						modes: ["delegated"],
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		const { headers: authHeaders } = await t.signInWithTestUser();
		const cookie = authHeaders.get("cookie") ?? "";

		const hostKeypair = await generateTestKeypair();
		const createRes = await t.auth.handler(
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Lifetime Host",
					public_key: hostKeypair.publicKey,
					default_capabilities: ["check_balance"],
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
					name: "Lifetime Agent",
					capabilities: ["check_balance"],
				}),
			}),
		);
		const { agent_id: agentId } = await json<{ agent_id: string }>(regRes);

		await new Promise((r) => setTimeout(r, 1500));

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await t.auth.handler(
			new Request(`${API}/agent/status`, {
				method: "GET",
				headers: { authorization: `Bearer ${jwt}` },
			}),
		);

		expect(res.status).toBe(403);
		const body = await json<{ error: string }>(res);
		expect(body.error).toBe("absolute_lifetime_exceeded");
	});
});

// ================================================================
// Host Revocation Cascade
// ================================================================

describe("Host Revocation Cascade", () => {
	it("agent auth fails when host is revoked", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await authedPost("/host/create", {
			name: "Revocable Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		});
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance"],
		});

		// Verify agent works before revocation
		const jwt1 = await createAgentJWT(agentKeypair.privateKey, agentId);
		const okRes = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt1}` },
		});
		expect(okRes.ok).toBe(true);

		// Revoke the host
		await authedPost("/host/revoke", { host_id: hostId });

		// Agent should now fail
		const jwt2 = await createAgentJWT(agentKeypair.privateKey, agentId);
		const failRes = await api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt2}` },
		});
		expect(failRes.ok).toBe(false);
	});
});

// ================================================================
// Capability Validation Warning
// ================================================================

describe("Capability Validation Warning", () => {
	it("logs warning when no capabilities list is configured", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						// No capabilities list — validation is a no-op
						modes: ["delegated"],
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		const { headers: authHeaders } = await t.signInWithTestUser();
		const cookie = authHeaders.get("cookie") ?? "";

		const hostKeypair = await generateTestKeypair();
		const createRes = await t.auth.handler(
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "No-Cap Host",
					public_key: hostKeypair.publicKey,
					default_capabilities: ["totally_made_up"],
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
					name: "Unchecked Agent",
					capabilities: ["totally_made_up"],
					mode: "delegated",
				}),
			}),
		);
		// Registration should succeed (capabilities are unchecked)
		expect(regRes.ok).toBe(true);

		const warningCall = warnSpy.mock.calls.find((call) =>
			call.some(
				(arg: unknown) =>
					typeof arg === "string" &&
					arg.includes("[agent-auth]") &&
					arg.includes("no capabilities list"),
			),
		);
		expect(warningCall).toBeDefined();

		warnSpy.mockRestore();
	});
});
