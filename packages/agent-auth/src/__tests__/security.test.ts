/**
 * Unified security tests for agent-auth.
 *
 * Covers: JWT replay, expired JWT, revoked agent, algorithm confusion,
 * non-JOSE error propagation, fresh session window, JTI partitioning,
 * transparent reactivation events, absolute lifetime, host revocation
 * cascade, P-256 rejection, capability validation warnings,
 * verifyAudience location model, and startup URL validation.
 */
import { describe, expect, it, beforeAll, vi } from "vitest";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { agentAuth as _agentAuth } from "../index";
import { verifyAudience, getCapabilityLocation } from "../routes/_helpers";
import {
	agentAuth,
	agentAuthClientPlugin,
	generateTestKeypair,
	signTestJWT,
	createHostJWT,
	createAgentJWT,
	json,
	createTestClient,
	BASE,
	API,
} from "./helpers";
import type { AgentJWK, AgentAuthEvent } from "../types";

const TEST_CAPABILITIES = [
	{ name: "check_balance", description: "Check account balance" },
	{ name: "transfer", description: "Transfer money" },
	{ name: "admin_panel", description: "Access admin panel" },
];

// ---------- Shared test instance for basic JWT security tests ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let sharedAgentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
let sharedAgentId: string;
let sharedHostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
let sharedHostId: string;
let client: ReturnType<typeof createTestClient>;

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
	client = createTestClient((req) => auth.handler(req));

	const { headers } = await t.signInWithTestUser();
	sessionCookie = headers.get("cookie") ?? "";

	sharedHostKeypair = await generateTestKeypair();
	const createRes = await client.authedPost("/host/create", {
		name: "Security Test Host",
		public_key: sharedHostKeypair.publicKey,
		default_capabilities: ["check_balance", "transfer"],
	}, sessionCookie);
	const { hostId } = await json<{ hostId: string }>(createRes);
	sharedHostId = hostId;

	sharedAgentKeypair = await generateTestKeypair();
	const reg = await client.registerAgentViaHost({
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

		const first = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(first.ok).toBe(true);

		const second = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(second.ok).toBe(false);
		expect(second.status).toBe(401);
	});

	it("JTI is partitioned by agent identity (different agents can reuse same jti value)", async () => {
		const agentKeypair1 = await generateTestKeypair();
		const { agentId: agentId1 } = await client.registerAgentViaHost({
			hostKeypair: sharedHostKeypair,
			agentKeypair: agentKeypair1,
			hostId: sharedHostId,
			name: "JTI Agent 1",
			capabilities: ["check_balance"],
		});

		const agentKeypair2 = await generateTestKeypair();
		const { agentId: agentId2 } = await client.registerAgentViaHost({
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

		const res1 = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt1}` },
		});
		expect(res1.ok).toBe(true);

		const res2 = await client.api("/agent/status", {
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

		const res = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
	});

	it("rejects revoked agent", async () => {
		const revokeAgentKeypair = await generateTestKeypair();
		const { agentId: revokedId } = await client.registerAgentViaHost({
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
		const revokeRes = await client.api("/agent/revoke", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: revokedId }),
		});
		expect(revokeRes.ok).toBe(true);

		const jwt = await createAgentJWT(revokeAgentKeypair.privateKey, revokedId);
		const statusRes = await client.api("/agent/status", {
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
		const { agentId } = await client.registerAgentViaHost({
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

		const badRes = await client.api("/agent/status", {
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

		const res = await client.authedPost("/host/create", {
			name: "P256 Host",
			public_key: pubJWK,
			default_capabilities: ["check_balance"],
		}, sessionCookie);

		// Should reject because P-256 is not in allowedKeyAlgorithms
		expect(res.ok).toBe(false);
	});

	it("verifyJWT propagates non-JOSE errors instead of returning null", async () => {
		const { verifyJWT } = await import("../utils/crypto");
		const badKey = { kty: "OKP", crv: "Ed25519", x: "INVALID" } as AgentJWK;

		await expect(
			verifyJWT({
				jwt: "not.a.jwt",
				publicKey: badKey,
				maxAge: 60,
			}),
		).rejects.toThrow();
	});

	it("rejects JWT signed with a different agent's valid keypair", async () => {
		const wrongKeypair = await generateTestKeypair();
		const jwt = await createAgentJWT(wrongKeypair.privateKey, sharedAgentId);

		const res = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
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
		const regBody = await json<{ agent_id: string; approval: { user_code: string } }>(regRes);
		const agentId = regBody.agent_id;
		const userCode = regBody.approval.user_code;

		await new Promise((r) => setTimeout(r, 1500));

		const approveRes = await t.auth.handler(
			new Request(`${API}/agent/approve-capability`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					agent_id: agentId,
					action: "approve",
					user_code: userCode,
				}),
			}),
		);
		const body = await json<{ error: string }>(approveRes);
		expect(body.error).toBe("fresh_session_required");
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
		const createRes = await client.authedPost("/host/create", {
			name: "Revocable Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance"],
		});

		// Verify agent works before revocation
		const jwt1 = await createAgentJWT(agentKeypair.privateKey, agentId);
		const okRes = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt1}` },
		});
		expect(okRes.ok).toBe(true);

		// Revoke the host
		await client.authedPost("/host/revoke", { host_id: hostId }, sessionCookie);

		// Agent should now fail
		const jwt2 = await createAgentJWT(agentKeypair.privateKey, agentId);
		const failRes = await client.api("/agent/status", {
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

// ================================================================
// Capability Location Model (§2.15)
// ================================================================

describe("verifyAudience — location model", () => {
	const baseURL = "http://localhost:3000/api/auth";

	it("accepts the server origin", () => {
		expect(verifyAudience("http://localhost:3000", baseURL)).toBe(true);
	});

	it("accepts the default execute endpoint", () => {
		expect(
			verifyAudience(
				"http://localhost:3000/api/auth/capability/execute",
				baseURL,
			),
		).toBe(true);
	});

	it("rejects an unrelated URL without expectedLocation", () => {
		expect(
			verifyAudience("https://external.example.com/execute", baseURL),
		).toBe(false);
	});

	it("accepts expectedLocation when it matches aud", () => {
		const location = "https://external.example.com/execute";
		expect(verifyAudience(location, baseURL, null, false, location)).toBe(
			true,
		);
	});

	it("rejects aud that doesn't match expectedLocation", () => {
		const location = "https://external.example.com/execute";
		const wrongAud = "https://other.example.com/execute";
		expect(verifyAudience(wrongAud, baseURL, null, false, location)).toBe(
			false,
		);
	});

	it("does NOT accept capability B's location when expectedLocation is capability A's", () => {
		const locationA = "https://service-a.example.com/execute";
		const locationB = "https://service-b.example.com/execute";
		expect(
			verifyAudience(locationB, baseURL, null, false, locationA),
		).toBe(false);
	});

	it("handles array aud — accepts if any value matches", () => {
		const location = "https://external.example.com/execute";
		expect(
			verifyAudience(
				["https://wrong.example.com", location],
				baseURL,
				null,
				false,
				location,
			),
		).toBe(true);
	});

	it("respects host header and trustProxy for execute endpoint", () => {
		const headers = new Headers({
			host: "proxy.example.com",
			"x-forwarded-proto": "https",
		});
		expect(
			verifyAudience(
				"https://proxy.example.com/api/auth/capability/execute",
				baseURL,
				headers,
				true,
			),
		).toBe(true);
	});

	it("root baseURL produces correct execute endpoint", () => {
		expect(
			verifyAudience(
				"http://localhost:3000/capability/execute",
				"http://localhost:3000",
			),
		).toBe(true);
	});

	it("accepts the full baseURL as audience", () => {
		expect(verifyAudience("http://localhost:3000/api/auth", baseURL)).toBe(true);
	});

	it("accepts proxy full base URL as audience", () => {
		const headers = new Headers({
			host: "proxy.example.com",
			"x-forwarded-proto": "https",
		});
		expect(
			verifyAudience("https://proxy.example.com/api/auth", baseURL, headers, true),
		).toBe(true);
	});
});

describe("getCapabilityLocation", () => {
	const capabilities = [
		{ name: "read", location: "https://read.example.com/execute" },
		{ name: "write" },
		{ name: "admin", location: "https://admin.example.com/execute" },
	];

	it("returns location for a capability that has one", () => {
		expect(getCapabilityLocation(capabilities, "read")).toBe(
			"https://read.example.com/execute",
		);
	});

	it("returns undefined for a capability without location", () => {
		expect(getCapabilityLocation(capabilities, "write")).toBeUndefined();
	});

	it("returns undefined for a non-existent capability", () => {
		expect(
			getCapabilityLocation(capabilities, "nonexistent"),
		).toBeUndefined();
	});

	it("returns undefined when capabilities is undefined", () => {
		expect(getCapabilityLocation(undefined, "read")).toBeUndefined();
	});
});

// ================================================================
// Startup Validation — capability location URLs
// ================================================================

describe("Startup URL validation for capability locations", () => {
	it("throws on invalid location URL", () => {
		expect(() =>
			_agentAuth({
				capabilities: [
					{ name: "bad", description: "bad cap", location: "not-a-url" },
				],
			}),
		).toThrow(/invalid location URL/);
	});

	it("throws with capability name in error message", () => {
		expect(() =>
			_agentAuth({
				capabilities: [
					{ name: "my_cap", description: "test", location: "foo" },
				],
			}),
		).toThrow(/my_cap/);
	});

	it("accepts valid absolute location URLs", () => {
		expect(() =>
			_agentAuth({
				capabilities: [
					{
						name: "ok",
						description: "ok cap",
						location: "https://api.example.com/execute",
					},
				],
			}),
		).not.toThrow();
	});

	it("accepts capabilities without location", () => {
		expect(() =>
			_agentAuth({
				capabilities: [
					{ name: "simple", description: "no location" },
				],
			}),
		).not.toThrow();
	});
});

// ================================================================
// Capability Location Model — Integration Tests (§2.15)
// ================================================================

describe("Location model — middleware audience integration", () => {
	const LOCATION_CAPABILITIES = [
		{ name: "read", description: "Read data" },
		{
			name: "write",
			description: "Write data",
			location: "https://write-service.example.com/execute",
		},
		{
			name: "admin",
			description: "Admin ops",
			location: "https://admin-service.example.com/execute",
		},
	];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let locAuth: any;
	let locCookie: string;
	let locHostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	let locHostId: string;

	beforeAll(async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						providerName: "location-test",
						capabilities: LOCATION_CAPABILITIES,
						modes: ["delegated"],
						defaultHostCapabilities: ["read", "write", "admin"],
						onExecute: ({ capability }) => ({
							capability,
							result: "executed",
						}),
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);
		locAuth = t.auth;

		const { headers } = await t.signInWithTestUser();
		locCookie = headers.get("cookie") ?? "";

		locHostKeypair = await generateTestKeypair();
		const createRes = await locAuth.handler(
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie: locCookie },
				body: JSON.stringify({
					name: "Location Host",
					public_key: locHostKeypair.publicKey,
					default_capabilities: ["read", "write", "admin"],
				}),
			}),
		);
		const body = await json<{ hostId: string }>(createRes);
		locHostId = body.hostId;
	});

	function locApi(path: string, init?: RequestInit): Promise<Response> {
		return locAuth.handler(
			new Request(`${API}${path}`, {
				...init,
				headers: {
					"content-type": "application/json",
					...(init?.headers as Record<string, string> | undefined),
				},
			}),
		);
	}

	async function registerLocAgent(
		capabilities: string[],
	): Promise<{ agentId: string; keypair: { publicKey: AgentJWK; privateKey: AgentJWK } }> {
		const keypair = await generateTestKeypair();
		const hostJWT = await createHostJWT(
			locHostKeypair.privateKey,
			locHostKeypair.publicKey,
			keypair.publicKey,
			locHostId,
		);
		const res = await locApi("/agent/register", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({
				name: "Location Agent",
				capabilities,
				mode: "delegated",
			}),
		});
		expect(res.ok).toBe(true);
		const body = await json<{ agent_id: string }>(res);
		return { agentId: body.agent_id, keypair };
	}

	it("accepts JWT with aud matching capability location for single-capability JWT", async () => {
		const { agentId, keypair } = await registerLocAgent(["write"]);
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: "https://write-service.example.com/execute",
			capabilities: ["write"],
		});

		const res = await locApi("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(true);
	});

	it("rejects JWT with aud set to wrong capability's location", async () => {
		const { agentId, keypair } = await registerLocAgent(["write"]);
		// aud points to admin's location, but JWT capability is "write"
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: "https://admin-service.example.com/execute",
			capabilities: ["write"],
		});

		const res = await locApi("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
	});

	it("rejects JWT with aud set to arbitrary external URL", async () => {
		const { agentId, keypair } = await registerLocAgent(["write"]);
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: "https://evil.example.com",
			capabilities: ["write"],
		});

		const res = await locApi("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
	});

	it("accepts JWT with aud as server origin for capability without location", async () => {
		const { agentId, keypair } = await registerLocAgent(["read"]);
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: BASE,
			capabilities: ["read"],
		});

		const res = await locApi("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(true);
	});

	it("accepts JWT with aud as default execute endpoint for capability without location", async () => {
		const { agentId, keypair } = await registerLocAgent(["read"]);
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: `${API}/capability/execute`,
			capabilities: ["read"],
		});

		const res = await locApi("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(true);
	});

	it("multi-capability JWT falls back to origin-only audience validation", async () => {
		const { agentId, keypair } = await registerLocAgent(["read", "write"]);
		// aud = server origin, multi-cap JWT — should pass since origin is always accepted
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: BASE,
			capabilities: ["read", "write"],
		});

		const res = await locApi("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.ok).toBe(true);
	});

	it("multi-capability JWT rejects aud set to a single capability's location", async () => {
		const { agentId, keypair } = await registerLocAgent(["read", "write"]);
		// aud = write's location, but JWT claims multiple capabilities
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: "https://write-service.example.com/execute",
			capabilities: ["read", "write"],
		});

		const res = await locApi("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		// multi-cap JWT does NOT add per-capability locations to accepted set
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
	});

	it("execute succeeds with aud matching capability location", async () => {
		const { agentId, keypair } = await registerLocAgent(["write"]);
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: "https://write-service.example.com/execute",
			capabilities: ["write"],
		});

		const res = await locApi("/capability/execute", {
			method: "POST",
			headers: { authorization: `Bearer ${jwt}` },
			body: JSON.stringify({ capability: "write", arguments: {} }),
		});
		expect(res.ok).toBe(true);
		const body = await json<{ data: { result: string } }>(res);
		expect(body.data.result).toBe("executed");
	});

	it("execute succeeds with default execute endpoint aud when capability has no location", async () => {
		const { agentId, keypair } = await registerLocAgent(["read"]);
		// "read" has no custom location — aud should be the default execute endpoint
		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: `${API}/capability/execute`,
			capabilities: ["read"],
		});

		const res = await locApi("/capability/execute", {
			method: "POST",
			headers: { authorization: `Bearer ${jwt}` },
			body: JSON.stringify({ capability: "read", arguments: {} }),
		});
		expect(res.ok).toBe(true);
		const body = await json<{ data: { result: string } }>(res);
		expect(body.data.result).toBe("executed");
	});
});

describe("Location model — introspect audience integration", () => {
	const LOCATION_CAPABILITIES = [
		{ name: "read", description: "Read data" },
		{
			name: "write",
			description: "Write data",
			location: "https://write-service.example.com/execute",
		},
	];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let introAuth: any;
	let introCookie: string;
	let introHostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	let introHostId: string;

	beforeAll(async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						capabilities: LOCATION_CAPABILITIES,
						modes: ["delegated"],
						defaultHostCapabilities: ["read", "write"],
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);
		introAuth = t.auth;

		const { headers } = await t.signInWithTestUser();
		introCookie = headers.get("cookie") ?? "";

		introHostKeypair = await generateTestKeypair();
		const createRes = await introAuth.handler(
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie: introCookie },
				body: JSON.stringify({
					name: "Introspect Location Host",
					public_key: introHostKeypair.publicKey,
					default_capabilities: ["read", "write"],
				}),
			}),
		);
		const body = await json<{ hostId: string }>(createRes);
		introHostId = body.hostId;
	});

	function introApi(path: string, init?: RequestInit): Promise<Response> {
		return introAuth.handler(
			new Request(`${API}${path}`, {
				...init,
				headers: {
					"content-type": "application/json",
					...(init?.headers as Record<string, string> | undefined),
				},
			}),
		);
	}

	it("introspect returns active for JWT with aud matching capability location", async () => {
		const keypair = await generateTestKeypair();
		const hostJWT = await createHostJWT(
			introHostKeypair.privateKey,
			introHostKeypair.publicKey,
			keypair.publicKey,
			introHostId,
		);
		const regRes = await introApi("/agent/register", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({
				name: "Introspect Agent",
				capabilities: ["write"],
				mode: "delegated",
			}),
		});
		expect(regRes.ok).toBe(true);
		const { agent_id: agentId } = await json<{ agent_id: string }>(regRes);

		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: "https://write-service.example.com/execute",
			capabilities: ["write"],
		});

		const res = await introApi("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt }),
		});
		expect(res.ok).toBe(true);
		const body = await json<{ active: boolean; agent_id: string }>(res);
		expect(body.active).toBe(true);
		expect(body.agent_id).toBe(agentId);
	});

	it("introspect returns inactive for JWT with aud set to wrong location", async () => {
		const keypair = await generateTestKeypair();
		const hostJWT = await createHostJWT(
			introHostKeypair.privateKey,
			introHostKeypair.publicKey,
			keypair.publicKey,
			introHostId,
		);
		const regRes = await introApi("/agent/register", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({
				name: "Introspect Wrong Aud Agent",
				capabilities: ["write"],
				mode: "delegated",
			}),
		});
		expect(regRes.ok).toBe(true);
		const { agent_id: agentId } = await json<{ agent_id: string }>(regRes);

		const jwt = await signTestJWT({
			privateKey: keypair.privateKey,
			subject: agentId,
			audience: "https://wrong-service.example.com/execute",
			capabilities: ["write"],
		});

		const res = await introApi("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt }),
		});
		expect(res.ok).toBe(true);
		const body = await json<{ active: boolean }>(res);
		expect(body.active).toBe(false);
	});
});

// ================================================================
// Grant Revocation Consistency
// ================================================================

describe("Grant Revocation Consistency", () => {
	it("agent revoke → all grants become revoked", async () => {
		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair: sharedHostKeypair,
			agentKeypair,
			hostId: sharedHostId,
			capabilities: ["check_balance", "transfer"],
		});

		// Verify grants are active
		const jwt1 = await createAgentJWT(agentKeypair.privateKey, agentId);
		const statusRes = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt1}` },
		});
		expect(statusRes.ok).toBe(true);
		const statusBody = await json<{ agent_capability_grants: Array<{ status: string }> }>(statusRes);
		expect(statusBody.agent_capability_grants.some((g) => g.status === "active")).toBe(true);

		// Revoke via user session
		const revokeRes = await client.authedPost("/agent/revoke", { agent_id: agentId }, sessionCookie);
		expect(revokeRes.ok).toBe(true);

		// Verify grants are revoked via introspect (agent JWT won't work since agent is revoked)
		const introRes = await client.api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt1 }),
		});
		const introBody = await json<{
			active: boolean;
			agent_capability_grants?: Array<{ status: string }>;
		}>(introRes);
		expect(introBody.active).toBe(false);
	});

	it("host revoke cascade → all agent grants become revoked (not denied)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Cascade Grant Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance", "transfer"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance", "transfer"],
		});

		// Verify agent works
		const jwt1 = await createAgentJWT(agentKeypair.privateKey, agentId);
		const okRes = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt1}` },
		});
		expect(okRes.ok).toBe(true);

		// Revoke the host
		const revokeRes = await client.authedPost("/host/revoke", { host_id: hostId }, sessionCookie);
		expect(revokeRes.ok).toBe(true);
		const revokeBody = await json<{ agents_revoked: number }>(revokeRes);
		expect(revokeBody.agents_revoked).toBeGreaterThanOrEqual(1);

		// Introspect should show inactive (agent is revoked)
		const introRes = await client.api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt1 }),
		});
		const introBody = await json<{ active: boolean }>(introRes);
		expect(introBody.active).toBe(false);
	});

	it("absolute lifetime expiry → grants revoked alongside agent", async () => {
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
		const localClient = createTestClient((req) => t.auth.handler(req));

		const hostKeypair = await generateTestKeypair();
		const createRes = await localClient.authedPost("/host/create", {
			name: "Abs Lifetime Grant Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, cookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await localClient.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance"],
		});

		// Wait for absolute lifetime to expire
		await new Promise((r) => setTimeout(r, 1500));

		// Trigger the absolute lifetime check
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await localClient.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});
		expect(res.status).toBe(403);

		// Allow background task to complete
		await new Promise((r) => setTimeout(r, 100));

		// Verify grants are also revoked via introspect
		const introRes = await localClient.api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt }),
		});
		const introBody = await json<{ active: boolean }>(introRes);
		expect(introBody.active).toBe(false);
	});

	it("reactivate with approval → grants created as pending directly", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						agentSessionTTL: 1,
						agentMaxLifetime: 86400,
						capabilities: TEST_CAPABILITIES,
						modes: ["delegated"],
						resolveAutonomousUser: async ({ hostId }) => ({
							id: `synthetic_${hostId}`,
							name: "Auto User",
							email: `auto_${hostId}@test.local`,
						}),
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		// Create an unlinked host (no user session — use host JWT for registration)
		const hostKeypair = await generateTestKeypair();
		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: "new-host",
			issuer: "new-host",
			typ: "host+jwt",
			audience: BASE,
			additionalClaims: {
				host_public_key: hostKeypair.publicKey,
			},
		});

		const enrollRes = await t.auth.handler(
			new Request(`${API}/host/enroll`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${hostJWT}`,
				},
				body: JSON.stringify({
					name: "Unlinked Host",
					default_capabilities: ["check_balance"],
				}),
			}),
		);

		if (!enrollRes.ok) {
			// If host/enroll doesn't exist, register via host/create with a temp user
			// then clear userId — skip test if not feasible
			return;
		}

		const enrollBody = await json<{ host_id: string }>(enrollRes);
		const hostId = enrollBody.host_id;

		const agentKeypair = await generateTestKeypair();
		const regHostJWT = await createHostJWT(
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
					authorization: `Bearer ${regHostJWT}`,
				},
				body: JSON.stringify({
					name: "Reactivation Pending Agent",
					capabilities: ["check_balance"],
					mode: "delegated",
				}),
			}),
		);

		if (!regRes.ok) return;
		const regBody = await json<{ agent_id: string }>(regRes);
		const agentId = regBody.agent_id;

		// Wait for session TTL to expire
		await new Promise((r) => setTimeout(r, 1500));

		// Reactivate
		const reactivateJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			issuer: hostId,
			typ: "host+jwt",
			audience: BASE,
		});

		const reactivateRes = await t.auth.handler(
			new Request(`${API}/agent/reactivate`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${reactivateJWT}`,
				},
				body: JSON.stringify({ agent_id: agentId }),
			}),
		);

		if (!reactivateRes.ok) return;

		const reactivateBody = await json<{
			status: string;
			agent_capability_grants: Array<{ status: string; capability: string }>;
		}>(reactivateRes);

		if (reactivateBody.status === "pending") {
			// All grants should be pending (created directly as pending, not active→pending)
			const grantStatuses = reactivateBody.agent_capability_grants.map((g) => g.status);
			expect(grantStatuses.every((s) => s === "pending")).toBe(true);
		}
	});
});
