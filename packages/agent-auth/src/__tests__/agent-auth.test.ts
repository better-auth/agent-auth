import { describe, expect, it, beforeAll } from "vitest";
import { getTestInstance } from "better-auth/test";
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
import type { AgentJWK } from "../types";

const TEST_CAPABILITIES = [
	{
		name: "check_balance",
		description: "Check account balance",
		input: {
			type: "object",
			required: ["account_id"],
			properties: { account_id: { type: "string" } },
		},
	},
	{
		name: "transfer",
		description: "Transfer money",
		input: {
			type: "object",
			required: ["amount", "to"],
			properties: {
				amount: { type: "number" },
				to: { type: "string" },
			},
		},
	},
	{
		name: "admin_panel",
		description: "Access admin panel",
	},
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let testUserId: string;
let client: ReturnType<typeof createTestClient>;

interface GrantRow {
	capability: string;
	status: string;
	granted_by?: string | null;
}

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
				defaultHostCapabilities: ["check_balance"],
				}),
			],
		},
		{
			clientOptions: { plugins: [agentAuthClientPlugin()] },
		},
	);
	auth = t.auth;
	client = createTestClient((req) => auth.handler(req));

	const { headers, user } = await t.signInWithTestUser();
	sessionCookie = headers.get("cookie") ?? "";
	testUserId = user.id;
});

describe("Host Management", () => {
	let createdHostId: string;

	it("creates a host via session auth (POST /host/create)", async () => {
		const keypair = await generateTestKeypair();
		const res = await client.authedPost("/host/create", {
			name: "My Test Host",
			public_key: keypair.publicKey,
			default_capabilities: ["check_balance", "transfer"],
		}, sessionCookie);

		expect(res.ok).toBe(true);
		const body = await json<{ hostId: string; status: string; default_capabilities: string[] }>(res);
		expect(body.hostId).toBeDefined();
		expect(body.status).toBe("active");
		expect(body.default_capabilities).toEqual(["check_balance", "transfer"]);
		createdHostId = body.hostId;
	});

	it("lists hosts (GET /host/list)", async () => {
		const res = await client.authedGet("/host/list", sessionCookie);

		expect(res.ok).toBe(true);
		const body = await json<{ hosts: Array<{ id: string; status: string }> }>(res);
		expect(body.hosts).toBeInstanceOf(Array);
		expect(body.hosts.length).toBeGreaterThanOrEqual(1);
		const host = body.hosts.find((h) => h.id === createdHostId);
		expect(host).toBeDefined();
		expect(host!.status).toBe("active");
	});

	it("gets host by ID (GET /host/get)", async () => {
		const res = await client.authedGet(`/host/get?host_id=${createdHostId}`, sessionCookie);

		expect(res.ok).toBe(true);
		const body = await json<{ id: string; status: string }>(res);
		expect(body.id).toBe(createdHostId);
		expect(body.status).toBe("active");
	});

	it("updates host (POST /host/update)", async () => {
		const res = await client.authedPost("/host/update", {
			host_id: createdHostId,
			name: "Updated Host",
			default_capabilities: ["check_balance"],
		}, sessionCookie);

		expect(res.ok).toBe(true);
		const body = await json<{ default_capabilities: string[] }>(res);
		expect(body.default_capabilities).toEqual(["check_balance"]);
	});

	it("revokes host and cascades to agents (POST /host/revoke)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Host To Revoke",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
		});

		const revokeRes = await client.authedPost("/host/revoke", { host_id: hostId }, sessionCookie);

		expect(revokeRes.ok).toBe(true);
		const body = await json<{ status: string; agents_revoked: number }>(revokeRes);
		expect(body.status).toBe("revoked");
		expect(body.agents_revoked).toBeGreaterThanOrEqual(1);
	});
});

describe("Agent Registration", () => {
	it("registers agent via session-owned host with hostJWT", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Session-Owned Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		expect(createRes.ok).toBe(true);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			name: "Session Agent",
			capabilities: ["check_balance"],
			mode: "delegated",
		});
		expect(body.agent_id).toBeDefined();
		expect(body.status).toBe("active");
		expect(body.mode).toBe("delegated");
		expect(body.agent_capability_grants).toBeInstanceOf(Array);
	});

	it("registers agent with hostJWT from known host (auto-approved)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Known Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance", "transfer"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance"],
		});

		expect(body.agent_id).toBeDefined();
		expect(body.status).toBe("active");
		expect(body.host_id).toBe(hostId);

		const grants = body.agent_capability_grants as GrantRow[];
		expect(grants).toBeInstanceOf(Array);
		const balanceGrant = grants.find((g) => g.capability === "check_balance");
		expect(balanceGrant).toBeDefined();
		expect(balanceGrant!.status).toBe("active");
	});

	it("rejects dynamic host registration when disabled (default)", async () => {
		const hostKeypair = await generateTestKeypair();
		const agentKeypair = await generateTestKeypair();
		const dynamicHostId = `dynamic-host-${crypto.randomUUID()}`;
		const hostJWT = await createHostJWT(
			hostKeypair.privateKey,
			hostKeypair.publicKey,
			agentKeypair.publicKey,
			dynamicHostId,
		);

		const res = await client.api("/agent/register", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({
				name: "Dynamic Host Agent",
				mode: "autonomous",
			}),
		});

		expect(res.ok).toBe(false);
		expect(res.status).toBe(403);
		const body = await json<{ error: string }>(res);
		expect(body.error).toBe("dynamic_host_registration_disabled");
	});

	it("allows dynamic host registration when explicitly enabled", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						allowDynamicHostRegistration: true,
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

		const hostKeypair = await generateTestKeypair();
		const agentKeypair = await generateTestKeypair();
		const dynamicHostId = `dynamic-host-${crypto.randomUUID()}`;
		const hostJWT = await createHostJWT(
			hostKeypair.privateKey,
			hostKeypair.publicKey,
			agentKeypair.publicKey,
			dynamicHostId,
		);

		const res = await t.auth.handler(
			new Request(`${API}/agent/register`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${hostJWT}`,
				},
				body: JSON.stringify({
					name: "Dynamic Host Agent",
					mode: "autonomous",
				}),
			}),
		);

		expect(res.ok).toBe(true);
		const body = await json<{ agent_id: string; host_id: string }>(res);
		expect(body.agent_id).toBeDefined();
		expect(body.host_id).toBeDefined();
	});

	it("returns agent_capability_grants as array of objects with capability and status", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Grants Shape Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			name: "Grants Shape Agent",
			capabilities: ["check_balance"],
		});
		const grants = body.agent_capability_grants as GrantRow[];
		expect(grants).toBeInstanceOf(Array);
		expect(grants.length).toBeGreaterThan(0);
		expect(grants[0]).toHaveProperty("capability");
		expect(grants[0]).toHaveProperty("status");
	});

	it("resolves requested capabilities within host defaults as active grants", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Budget Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance", "transfer"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance"],
		});

		const grants = body.agent_capability_grants as GrantRow[];
		const activeGrants = grants.filter((g) => g.status === "active");
		expect(activeGrants.some((g) => g.capability === "check_balance")).toBe(true);
	});

	it("resolves requested capabilities outside host defaults as pending grants", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Narrow Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { body } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance", "transfer"],
		});

		const grants = body.agent_capability_grants as GrantRow[];
		const pendingGrants = grants.filter((g) => g.status === "pending");
		expect(pendingGrants.some((g) => g.capability === "transfer")).toBe(true);
	});

	it("rejects unsupported mode", async () => {
		const res = await client.api("/agent/register", {
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
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Limit Host",
					public_key: hostKeypair.publicKey,
					default_capabilities: [],
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
		const createRes = await client.authedPost("/host/create", {
			name: "Middleware Test Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		agentKeypair = await generateTestKeypair();
		const reg = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance"],
		});
		agentId = reg.agentId;
	});

	it("authenticates with valid agent JWT", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/agent/status", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});

		expect(res.ok).toBe(true);
		const body = await json<{ agent_id: string }>(res);
		expect(body.agent_id).toBe(agentId);
	});

});


describe("Status & Introspection", () => {
	let agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	let agentId: string;

	beforeAll(async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Status Test Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance", "transfer"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		agentKeypair = await generateTestKeypair();
		const reg = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance", "transfer"],
		});
		agentId = reg.agentId;
	});

	it("GET /agent/status returns agent_capability_grants array", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/agent/status", {
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
		expect(body.agent_capability_grants[0]).toHaveProperty("capability");
		expect(body.agent_capability_grants[0]).toHaveProperty("status");
	});

	it("POST /agent/introspect validates JWT and returns grants", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/agent/introspect", {
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

	it("introspect with capabilities claim narrows returned grants", async () => {
		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId, {
			capabilities: ["check_balance"],
		});
		const res = await client.api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			active: boolean;
			agent_capability_grants: GrantRow[];
		}>(res);
		expect(body.active).toBe(true);
		const capIds = body.agent_capability_grants.map((g) => g.capability);
		expect(capIds).toContain("check_balance");
		expect(capIds).not.toContain("transfer");
	});

	it("introspect returns inactive for bad token", async () => {
		const res = await client.api("/agent/introspect", {
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
		const createRes = await client.authedPost("/host/create", {
			name: "Cap Budget Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance", "transfer", "admin_panel"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance"],
		});

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/agent/request-capability", {
			method: "POST",
			headers: { authorization: `Bearer ${jwt}` },
			body: JSON.stringify({ capabilities: ["transfer"] }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			status: string;
			agent_capability_grants: GrantRow[];
		}>(res);
		expect(body.status).toBe("active");
		expect(
			body.agent_capability_grants.some(
				(g) => g.capability === "transfer" && g.status === "active",
			),
		).toBe(true);
	});

	it("request-capability creates pending for out-of-budget capabilities", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Narrow Cap Host",
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

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/agent/request-capability", {
			method: "POST",
			headers: { authorization: `Bearer ${jwt}` },
			body: JSON.stringify({ capabilities: ["admin_panel"] }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			status: string;
			agent_capability_grants: GrantRow[];
		}>(res);
		expect(body.status).toBe("pending");
		expect(
			body.agent_capability_grants.some(
				(g) => g.capability === "admin_panel" && g.status === "pending",
			),
		).toBe(true);
	});

	it("approve-capability approves pending grants", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Approve Cap Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId, body: regBody } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance", "transfer"],
		});

		const userCode = (regBody.approval as Record<string, unknown>).user_code as string;

		const approveRes = await client.authedPost("/agent/approve-capability", {
			agent_id: agentId,
			action: "approve",
			user_code: userCode,
		}, sessionCookie);

		expect(approveRes.ok).toBe(true);
		const body = await json<{ status: string; added: string[] }>(approveRes);
		expect(body.status).toBe("approved");
		expect(body.added).toContain("transfer");
	});

	it("approve-capability denies pending grants", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Deny Cap Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance", "admin_panel"],
		});

		const denyRes = await client.authedPost("/agent/approve-capability", {
			agent_id: agentId,
			action: "deny",
		}, sessionCookie);

		expect(denyRes.ok).toBe(true);
		const body = await json<{ status: string }>(denyRes);
		expect(body.status).toBe("denied");
	});

	it("grant-capability directly grants capabilities", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Direct Grant Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: [],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			name: "Direct Grant Agent",
		});

		const grantRes = await client.authedPost("/agent/grant-capability", {
			agent_id: agentId,
			capabilities: ["transfer", "admin_panel"],
		}, sessionCookie);

		expect(grantRes.ok).toBe(true);
		const body = await json<{ agent_id: string; added: string[] }>(grantRes);
		expect(body.agent_id).toBe(agentId);
		expect(body.added).toContain("transfer");
		expect(body.added).toContain("admin_panel");
	});
});

describe("Agent Lifecycle", () => {
	it("revokes agent via host JWT (POST /agent/revoke)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Lifecycle Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
		});

		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			issuer: hostId,
			typ: "host+jwt",
			audience: BASE,
		});
		const revokeRes = await client.api("/agent/revoke", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: agentId }),
		});

		expect(revokeRes.ok).toBe(true);
		const body = await json<{ agent_id: string; status: string }>(revokeRes);
		expect(body.status).toBe("revoked");
		expect(body.agent_id).toBe(agentId);
	});

	it("rotates agent key (POST /agent/rotate-key)", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Rotate Key Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
		});

		const newKeypair = await generateTestKeypair();
		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			issuer: hostId,
			typ: "host+jwt",
			audience: BASE,
		});

		const rotateRes = await client.api("/agent/rotate-key", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: agentId, public_key: newKeypair.publicKey }),
		});

		expect(rotateRes.ok).toBe(true);
		const body = await json<{ agent_id: string; status: string }>(rotateRes);
		expect(body.agent_id).toBe(agentId);
		expect(body.status).toBe("active");

		const newJwt = await createAgentJWT(newKeypair.privateKey, agentId);
		const statusRes = await client.api("/agent/status", {
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
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Cleanup Host",
					public_key: hostKeypair.publicKey,
					default_capabilities: [],
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
	it("GET /agent-configuration returns spec-compliant config with absolute URLs", async () => {
		const res = await client.api("/agent-configuration", { method: "GET" });

		expect(res.ok).toBe(true);
		const body = await json<{
			version: string;
			issuer: string;
			provider_name: string;
			modes: string[];
			algorithms: string[];
			endpoints: Record<string, string>;
			default_location: string;
		}>(res);
		expect(body.version).toBe("1.0-draft");
		expect(body.provider_name).toBe("test-service");
		expect(body.modes).toEqual(["delegated", "autonomous"]);
		expect(body.algorithms).toEqual(["Ed25519"]);

		// §2: issuer is the full baseURL, not just origin
		expect(body.issuer).toBe("http://localhost:3000/api/auth");

		// All endpoints are absolute URLs starting with issuer
		for (const [, endpoint] of Object.entries(body.endpoints)) {
			expect(() => new URL(endpoint)).not.toThrow();
			expect(endpoint).toMatch(/^https?:\/\//);
			expect(endpoint.startsWith(body.issuer)).toBe(true);
		}

		expect(body.endpoints.register).toBe(`${body.issuer}/agent/register`);
		expect(body.endpoints.capabilities).toBe(`${body.issuer}/capability/list`);
		expect(body.endpoints.status).toBe(`${body.issuer}/agent/status`);
		expect(body.endpoints.introspect).toBe(`${body.issuer}/agent/introspect`);

		// §2.15: default_location equals the execute endpoint (both absolute)
		expect(body.default_location).toBe(body.endpoints.execute);

		// SDK-style resolution is idempotent: new URL(absolute, base) === absolute
		for (const [, endpoint] of Object.entries(body.endpoints)) {
			expect(new URL(endpoint, body.issuer).toString()).toBe(endpoint);
		}
	});
});

describe("Capabilities Endpoint", () => {
	it("GET /capability/list returns lightweight list (name + description only)", async () => {
		const res = await client.api("/capability/list", { method: "GET" });

		expect(res.ok).toBe(true);
		const body = await json<{
			capabilities: Array<{ name: string; description: string }>;
			has_more: boolean;
		}>(res);
		expect(body.capabilities).toBeInstanceOf(Array);
		expect(body.capabilities.length).toBe(3);
		expect(body.capabilities[0]).toHaveProperty("name");
		expect(body.capabilities[0]).toHaveProperty("description");
		expect(body.capabilities[0]).not.toHaveProperty("input");
	});

	it("includes grant_status when called with agent JWT", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Cap Endpoint Host",
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

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/capability/list", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			capabilities: Array<{ name: string; grant_status: string }>;
		}>(res);

		const checkBalance = body.capabilities.find((c) => c.name === "check_balance");
		const transfer = body.capabilities.find((c) => c.name === "transfer");
		expect(checkBalance).toBeDefined();
		expect(checkBalance!.grant_status).toBe("granted");
		expect(transfer).toBeDefined();
		expect(transfer!.grant_status).toBe("not_granted");
	});

	it("supports query filtering", async () => {
		const res = await client.api("/capability/list?query=balance", { method: "GET" });

		expect(res.ok).toBe(true);
		const body = await json<{
			capabilities: Array<{ name: string }>;
		}>(res);
		const names = body.capabilities.map((c) => c.name);
		expect(names).toContain("check_balance");
		expect(names).not.toContain("admin_panel");
	});
});

describe("Capabilities Endpoint — location field (§2.15)", () => {
	const CAPS_WITH_LOCATION = [
		{ name: "read", description: "Read data" },
		{
			name: "write",
			description: "Write data",
			location: "https://write-service.example.com/execute",
		},
	];

	it("includes location in listing when capability has one", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						capabilities: CAPS_WITH_LOCATION,
						modes: ["delegated"],
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		const res = await t.auth.handler(
			new Request(`${API}/capability/list`, { method: "GET" }),
		);
		expect(res.ok).toBe(true);
		const body = await json<{
			capabilities: Array<{ name: string; description: string; location?: string }>;
		}>(res);

		const write = body.capabilities.find((c) => c.name === "write");
		expect(write).toBeDefined();
		expect(write!.location).toBe("https://write-service.example.com/execute");

		const read = body.capabilities.find((c) => c.name === "read");
		expect(read).toBeDefined();
		expect(read!.location).toBeUndefined();
	});
});

describe("Agent Session", () => {
	it("GET /agent/session returns full agent session object", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Session Host",
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

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/agent/session", {
			method: "GET",
			headers: { authorization: `Bearer ${jwt}` },
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			type: string;
			agent: {
				id: string;
				mode: string;
				capabilityGrants: Array<{ capability: string; status: string }>;
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
		const res = await client.api("/agent/register", {
			method: "POST",
			body: JSON.stringify({ name: "No Auth", mode: "delegated" }),
		});
		expect(res.ok).toBe(false);
	});

	it("introspect returns inactive for revoked agent", async () => {
		const hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Introspect Revoke Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		}, sessionCookie);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
		});

		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			issuer: hostId,
			typ: "host+jwt",
			audience: BASE,
		});
		await client.api("/agent/revoke", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: agentId }),
		});

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/agent/introspect", {
			method: "POST",
			body: JSON.stringify({ token: jwt }),
		});

		expect(res.ok).toBe(true);
		const body = await json<{ active: boolean }>(res);
		expect(body.active).toBe(false);
	});

	it("get-host returns NOT_FOUND for unknown host", async () => {
		const res = await client.authedGet("/host/get?host_id=nonexistent", sessionCookie);
		expect(res.ok).toBe(false);
		expect(res.status).toBe(404);
	});

	it("host create without publicKey uses enrollment flow", async () => {
		const res = await client.authedPost("/host/create", {
			name: "Enrollment Host",
			default_capabilities: ["check_balance"],
		}, sessionCookie);

		expect(res.ok).toBe(true);
		const body = await json<{
			status: string;
			enrollmentToken: string;
		}>(res);
		expect(body.status).toBe("pending_enrollment");
		expect(body.enrollmentToken).toBeDefined();
	});
});

describe("Constraints (§2.13)", () => {
	let hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	let hostId: string;

	beforeAll(async () => {
		hostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost("/host/create", {
			name: "Constraint Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance", "transfer"],
		}, sessionCookie);
		const body = await json<{ hostId: string }>(createRes);
		hostId = body.hostId;
	});

	it("registers agent with constrained capabilities", async () => {
		const agentKeypair = await generateTestKeypair();
		const hostJWT = await createHostJWT(
			hostKeypair.privateKey,
			hostKeypair.publicKey,
			agentKeypair.publicKey,
			hostId,
		);

		const res = await client.api("/agent/register", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({
				name: "Constrained Agent",
				capabilities: [
					"check_balance",
					{ name: "transfer", constraints: { amount: { max: 1000 }, currency: { in: ["USD", "EUR"] } } },
				],
				mode: "delegated",
			}),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			agent_id: string;
			status: string;
			agent_capability_grants: Array<{
				capability: string;
				status: string;
				constraints?: Record<string, unknown>;
			}>;
		}>(res);
		expect(body.status).toBe("active");

		const transferGrant = body.agent_capability_grants.find((g) => g.capability === "transfer");
		expect(transferGrant).toBeDefined();
		expect(transferGrant!.constraints).toBeDefined();
		expect((transferGrant!.constraints as Record<string, Record<string, number>>).amount.max).toBe(1000);
	});

	it("request-capability with constraints stores them on grant", async () => {
		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance"],
		});

		const jwt = await createAgentJWT(agentKeypair.privateKey, agentId);
		const res = await client.api("/agent/request-capability", {
			method: "POST",
			headers: { authorization: `Bearer ${jwt}` },
			body: JSON.stringify({
				capabilities: [
					{ name: "transfer", constraints: { amount: { max: 500 } } },
				],
			}),
		});

		expect(res.ok).toBe(true);
		const body = await json<{
			status: string;
			agent_capability_grants: Array<{
				capability: string;
				status: string;
				constraints?: Record<string, unknown>;
			}>;
		}>(res);
		expect(body.status).toBe("active");
		const transferGrant = body.agent_capability_grants.find((g) => g.capability === "transfer");
		expect(transferGrant).toBeDefined();
		expect(transferGrant!.constraints).toBeDefined();
	});

	it("execute succeeds within constraints", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						capabilities: TEST_CAPABILITIES,
						modes: ["delegated"],
						defaultHostCapabilities: ["check_balance", "transfer"],
						onExecute: ({ capability, arguments: args }) => ({
							capability,
							result: "ok",
							args,
						}),
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);
		const { headers: h } = await t.signInWithTestUser();
		const cookie = h.get("cookie") ?? "";

		const hk = await generateTestKeypair();
		const createRes = await t.auth.handler(
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Exec Constraint Host",
					public_key: hk.publicKey,
					default_capabilities: ["check_balance", "transfer"],
				}),
			}),
		);
		const { hostId: hId } = await json<{ hostId: string }>(createRes);

		const ak = await generateTestKeypair();
		const hostJWT = await createHostJWT(hk.privateKey, hk.publicKey, ak.publicKey, hId);
		const regRes = await t.auth.handler(
			new Request(`${API}/agent/register`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${hostJWT}` },
				body: JSON.stringify({
					name: "Exec Agent",
					capabilities: [
						"check_balance",
						{ name: "transfer", constraints: { amount: { max: 1000 } } },
					],
					mode: "delegated",
				}),
			}),
		);
		const { agent_id: aId } = await json<{ agent_id: string }>(regRes);

		const jwt = await createAgentJWT(ak.privateKey, aId);
		const execRes = await t.auth.handler(
			new Request(`${API}/capability/execute`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
				body: JSON.stringify({ capability: "transfer", arguments: { amount: 500, to: "alice" } }),
			}),
		);

		expect(execRes.ok).toBe(true);
		const execBody = await json<{ data: { result: string } }>(execRes);
		expect(execBody.data.result).toBe("ok");
	});

	it("execute fails with constraint_violated when arguments violate constraints", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						capabilities: TEST_CAPABILITIES,
						modes: ["delegated"],
						defaultHostCapabilities: ["check_balance", "transfer"],
						onExecute: ({ capability }) => ({ capability, result: "ok" }),
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);
		const { headers: h } = await t.signInWithTestUser();
		const cookie = h.get("cookie") ?? "";

		const hk = await generateTestKeypair();
		const createRes = await t.auth.handler(
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Violation Host",
					public_key: hk.publicKey,
					default_capabilities: ["check_balance", "transfer"],
				}),
			}),
		);
		const { hostId: hId } = await json<{ hostId: string }>(createRes);

		const ak = await generateTestKeypair();
		const hostJWT = await createHostJWT(hk.privateKey, hk.publicKey, ak.publicKey, hId);
		const regRes = await t.auth.handler(
			new Request(`${API}/agent/register`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${hostJWT}` },
				body: JSON.stringify({
					name: "Violation Agent",
					capabilities: [
						{ name: "transfer", constraints: { amount: { max: 100 } } },
					],
					mode: "delegated",
				}),
			}),
		);
		const { agent_id: aId } = await json<{ agent_id: string }>(regRes);

		const jwt = await createAgentJWT(ak.privateKey, aId);
		const execRes = await t.auth.handler(
			new Request(`${API}/capability/execute`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
				body: JSON.stringify({ capability: "transfer", arguments: { amount: 500, to: "alice" } }),
			}),
		);

		expect(execRes.ok).toBe(false);
		expect(execRes.status).toBe(403);
		const body = await json<{ error: string; violations: Array<{ field: string }> }>(execRes);
		expect(body.error).toBe("constraint_violated");
		expect(body.violations).toBeInstanceOf(Array);
		expect(body.violations[0].field).toBe("amount");
	});

	it("unknown operator rejected with unknown_constraint_operator", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						capabilities: TEST_CAPABILITIES,
						modes: ["delegated"],
						defaultHostCapabilities: ["transfer"],
						onExecute: ({ capability }) => ({ capability, result: "ok" }),
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);
		const { headers: h } = await t.signInWithTestUser();
		const cookie = h.get("cookie") ?? "";

		const hk = await generateTestKeypair();
		const createRes = await t.auth.handler(
			new Request(`${API}/host/create`, {
				method: "POST",
				headers: { "content-type": "application/json", cookie },
				body: JSON.stringify({
					name: "Unknown Op Host",
					public_key: hk.publicKey,
					default_capabilities: ["transfer"],
				}),
			}),
		);
		const { hostId: hId } = await json<{ hostId: string }>(createRes);

		const ak = await generateTestKeypair();
		const hostJWT = await createHostJWT(hk.privateKey, hk.publicKey, ak.publicKey, hId);
		const regRes = await t.auth.handler(
			new Request(`${API}/agent/register`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${hostJWT}` },
				body: JSON.stringify({
					name: "Unknown Op Agent",
					capabilities: [
						{ name: "transfer", constraints: { amount: { bogus_op: 999 } } },
					],
					mode: "delegated",
				}),
			}),
		);
		const { agent_id: aId } = await json<{ agent_id: string }>(regRes);

		const jwt = await createAgentJWT(ak.privateKey, aId);
		const execRes = await t.auth.handler(
			new Request(`${API}/capability/execute`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
				body: JSON.stringify({ capability: "transfer", arguments: { amount: 100, to: "alice" } }),
			}),
		);

		expect(execRes.ok).toBe(false);
		expect(execRes.status).toBe(400);
		const body = await json<{ error: string; operators: string[] }>(execRes);
		expect(body.error).toBe("unknown_constraint_operator");
		expect(body.operators).toContain("bogus_op");
	});
});

// Security-specific tests (JWT replay, algorithm confusion, session freshness,
// JTI partitioning, reactivation events, etc.) are in security.test.ts
