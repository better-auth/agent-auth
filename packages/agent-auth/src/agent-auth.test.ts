import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { agentAuth } from ".";
import { agentAuthClient } from "./client";
import { generateAgentKeypair, hashRequestBody, signAgentJWT } from "./crypto";
import {
	findBlockedScopes,
	hasAllScopes,
	hasScope,
	isSubsetOf,
	mergeScopes,
} from "./scopes";

describe("agent-auth", async () => {
	const {
		client,
		auth,
		db,
		signInWithTestUser,
		signInWithUser,
		customFetchImpl,
	} = await getTestInstance(
		{
			plugins: [
				agentAuth({
					roles: {
						reader: ["reports.read"],
						writer: ["reports.read", "reports.write"],
					},
					defaultRole: "reader",
					rateLimit: false,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [agentAuthClient()],
			},
		},
	);

	const { headers, user } = await signInWithTestUser();

	// ---------------------------------------------------------------------------
	// Host management
	// ---------------------------------------------------------------------------
	describe("host management", async () => {
		const hostKp = await generateAgentKeypair();
		let hostId: string;

		it("should create a host with a public key", async () => {
			const res = await auth.api.createHost({
				headers,
				body: {
					publicKey: hostKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			expect(res.hostId).toBeDefined();
			expect(res.scopes).toEqual(["reports.read"]);
			expect(res.status).toBe("active");
			hostId = res.hostId;
		});

		it("should create a host with jwksUrl (no publicKey)", async () => {
			const res = await auth.api.createHost({
				headers,
				body: {
					jwksUrl: "https://example.com/.well-known/jwks.json",
				},
			});

			expect(res.hostId).toBeDefined();
			expect(res.status).toBe("active");
		});

		it("should list hosts for the current user", async () => {
			const res = await auth.api.listHosts({ headers });
			expect(res.hosts.length).toBeGreaterThanOrEqual(2);
			const found = res.hosts.find((h: { id: string }) => h.id === hostId);
			expect(found).toBeDefined();
			expect(found?.status).toBe("active");
		});

		it("should get a host by ID", async () => {
			const res = await auth.api.getHost({
				headers,
				query: { hostId },
			});

			expect(res.id).toBe(hostId);
			expect(res.scopes).toEqual(["reports.read"]);
			expect(res.status).toBe("active");
		});

		it("should update host scopes and public key", async () => {
			const newKp = await generateAgentKeypair();
			const res = await auth.api.updateHost({
				headers,
				body: {
					hostId,
					publicKey: newKp.publicKey,
					scopes: ["reports.read", "reports.write"],
				},
			});

			expect(res.scopes).toEqual(["reports.read", "reports.write"]);
		});

		it("should revoke host and cascade to agents", async () => {
			const cascadeHostKp = await generateAgentKeypair();
			const host = await auth.api.createHost({
				headers,
				body: {
					publicKey: cascadeHostKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			const hostJWT = await signAgentJWT({
				agentId: host.hostId,
				privateKey: cascadeHostKp.privateKey,
			});

			const agentKp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				body: {
					name: "Cascade Agent",
					publicKey: agentKp.publicKey,
					hostJWT,
				},
			});

			const revokeRes = await auth.api.revokeHost({
				headers,
				body: { hostId: host.hostId },
			});

			expect(revokeRes.success).toBe(true);
			expect(revokeRes.revokedAgentCount).toBeGreaterThanOrEqual(1);

			const agentAfter = await auth.api.getAgent({
				headers,
				query: { agentId: agent.agentId },
			});
			expect(agentAfter.status).toBe("revoked");
		});

		it("should reactivate an expired host via proof-of-possession", async () => {
			const enrKp = await generateAgentKeypair();
			const host = await auth.api.createHost({
				headers,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			await db.update({
				model: "agentHost",
				where: [{ field: "id", value: host.hostId }],
				update: { status: "expired" },
			});

			const proof = await signAgentJWT({
				agentId: host.hostId,
				privateKey: enrKp.privateKey,
			});

			const res = await auth.api.reactivateHost({
				body: { hostId: host.hostId, proof },
			});

			expect(res.status).toBe("active");
			expect(res.hostId).toBe(host.hostId);
		});

		it("should idempotently reactivate host when same kid is resubmitted", async () => {
			const enrKp = await generateAgentKeypair();
			const first = await auth.api.createHost({
				headers,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			await db.update({
				model: "agentHost",
				where: [{ field: "id", value: first.hostId }],
				update: { status: "expired" },
			});

			const second = await auth.api.createHost({
				headers,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read", "reports.write"],
				},
			});

			expect(second.hostId).toBe(first.hostId);
			expect(second.status).toBe("active");
			expect(second.reactivated).toBe(true);
			expect(second.scopes).toEqual(["reports.read", "reports.write"]);
		});
	});

	// ---------------------------------------------------------------------------
	// Agent creation
	// ---------------------------------------------------------------------------
	describe("agent creation", async () => {
		let mainHostId: string;
		let mainHostKp: Awaited<ReturnType<typeof generateAgentKeypair>>;

		it("should create a host for agent tests", async () => {
			mainHostKp = await generateAgentKeypair();
			const res = await auth.api.createHost({
				headers,
				body: {
					publicKey: mainHostKp.publicKey,
					scopes: ["reports.read", "reports.write"],
				},
			});
			mainHostId = res.hostId;
			expect(mainHostId).toBeDefined();
		});

		it("should create agent via host JWT (silent path)", async () => {
			const hostJWT = await signAgentJWT({
				agentId: mainHostId,
				privateKey: mainHostKp.privateKey,
			});

			const agentKp = await generateAgentKeypair();
			const res = await auth.api.createAgent({
				body: {
					name: "Silent Agent",
					publicKey: agentKp.publicKey,
					hostJWT,
					scopes: ["reports.read"],
				},
			});

			expect(res.agentId).toBeDefined();
			expect(res.name).toBe("Silent Agent");
			expect(res.scopes).toEqual(["reports.read"]);
			expect(res.hostId).toBe(mainHostId);
		});

		it("should create agent via user session with hostPublicKey (dynamic host registration)", async () => {
			const dynHostKp = await generateAgentKeypair();
			const agentKp = await generateAgentKeypair();
			const res = await auth.api.createAgent({
				headers,
				body: {
					name: "Dynamic Host Agent",
					publicKey: agentKp.publicKey,
					hostPublicKey: dynHostKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			expect(res.agentId).toBeDefined();
			expect(res.hostId).toBeDefined();
		});

		it("should reject agent creation without host or session", async () => {
			const agentKp = await generateAgentKeypair();
			try {
				await auth.api.createAgent({
					body: {
						name: "No Auth Agent",
						publicKey: agentKp.publicKey,
					},
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("UNAUTHORIZED");
			}
		});

		it("should reject with invalid public key", async () => {
			const res = await client.agent.create(
				{
					name: "Bad Key Agent",
					publicKey: {},
				},
				{ headers },
			);
			expect(res.data).toBeNull();
			expect(res.error?.status).toBe(400);
		});

		it("should resolve scopes from role config and create permission rows", async () => {
			const agentKp = await generateAgentKeypair();
			const res = await auth.api.createAgent({
				headers,
				body: {
					name: "Role Agent",
					publicKey: agentKp.publicKey,
					role: "writer",
				},
			});

			expect(res.scopes).toEqual(["reports.read", "reports.write"]);

			const agent = await auth.api.getAgent({
				headers,
				query: { agentId: res.agentId },
			});
			expect(agent.permissions.length).toBeGreaterThanOrEqual(2);
			const scopes = agent.permissions.map((p: { scope: string }) => p.scope);
			expect(scopes).toContain("reports.read");
			expect(scopes).toContain("reports.write");
		});

		it("should idempotently update agent when same kid is resubmitted", async () => {
			const agentKp = await generateAgentKeypair();
			const first = await auth.api.createAgent({
				headers,
				body: {
					name: "Idempotent Agent",
					publicKey: agentKp.publicKey,
				},
			});

			const second = await auth.api.createAgent({
				headers,
				body: {
					name: "Idempotent Agent v2",
					publicKey: agentKp.publicKey,
				},
			});

			expect(second.agentId).toBe(first.agentId);
		});

		it("should create pending permissions for scopes exceeding host budget", async () => {
			const hostKp = await generateAgentKeypair();
			const host = await auth.api.createHost({
				headers,
				body: {
					publicKey: hostKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			const hostJWT = await signAgentJWT({
				agentId: host.hostId,
				privateKey: hostKp.privateKey,
			});

			const agentKp = await generateAgentKeypair();
			const res = await auth.api.createAgent({
				body: {
					name: "Overflow Agent",
					publicKey: agentKp.publicKey,
					hostJWT,
					scopes: ["reports.read", "reports.write"],
				},
			});

			expect(res.scopes).toEqual(["reports.read"]);
			expect(res.pendingScopes).toEqual(["reports.write"]);

			const agent = await auth.api.getAgent({
				headers,
				query: { agentId: res.agentId },
			});
			const pending = agent.permissions.filter(
				(p: { status: string }) => p.status === "pending",
			);
			expect(pending.length).toBeGreaterThanOrEqual(1);
		});

		it("should reject create with disallowed key algorithm", async () => {
			const res = await client.agent.create(
				{
					name: "Wrong Alg Agent",
					publicKey: { kty: "EC", crv: "P-256", x: "test" },
				},
				{ headers },
			);
			expect(res.data).toBeNull();
			expect(res.error?.status).toBe(400);
		});
	});

	// ---------------------------------------------------------------------------
	// Agent limit enforcement
	// ---------------------------------------------------------------------------
	describe("agent limit enforcement", async () => {
		const { client: limClient, signInWithTestUser: limSignIn } =
			await getTestInstance(
				{
					plugins: [agentAuth({ maxAgentsPerUser: 2, rateLimit: false })],
				},
				{ clientOptions: { plugins: [agentAuthClient()] } },
			);

		const { headers: limHeaders } = await limSignIn();

		it("should allow creating agents up to the limit", async () => {
			const kp1 = await generateAgentKeypair();
			const res1 = await limClient.agent.create(
				{ name: "Limit Agent 1", publicKey: kp1.publicKey },
				{ headers: limHeaders },
			);
			expect(res1.error).toBeNull();

			const kp2 = await generateAgentKeypair();
			const res2 = await limClient.agent.create(
				{ name: "Limit Agent 2", publicKey: kp2.publicKey },
				{ headers: limHeaders },
			);
			expect(res2.error).toBeNull();
		});

		it("should reject creation beyond the limit", async () => {
			const kp3 = await generateAgentKeypair();
			const res3 = await limClient.agent.create(
				{ name: "Limit Agent 3", publicKey: kp3.publicKey },
				{ headers: limHeaders },
			);
			expect(res3.error).toBeDefined();
			expect(res3.error?.status).toBe(400);
		});
	});

	// ---------------------------------------------------------------------------
	// Permissions
	// ---------------------------------------------------------------------------
	describe("permissions", async () => {
		let permHostId: string;
		let permHostKp: Awaited<ReturnType<typeof generateAgentKeypair>>;
		let permAgentId: string;

		it("should set up host and agent for permission tests", async () => {
			permHostKp = await generateAgentKeypair();
			const host = await auth.api.createHost({
				headers,
				body: {
					publicKey: permHostKp.publicKey,
					scopes: ["reports.read"],
				},
			});
			permHostId = host.hostId;

			const hostJWT = await signAgentJWT({
				agentId: permHostId,
				privateKey: permHostKp.privateKey,
			});

			const agentKp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				body: {
					name: "Perm Agent",
					publicKey: agentKp.publicKey,
					hostJWT,
				},
			});
			permAgentId = agent.agentId;
		});

		it("should have permissions created on agent creation", async () => {
			const agent = await auth.api.getAgent({
				headers,
				query: { agentId: permAgentId },
			});
			expect(agent.permissions.length).toBeGreaterThanOrEqual(1);
			expect(agent.permissions[0]?.scope).toBe("reports.read");
			expect(agent.permissions[0]?.status).toBe("active");
		});

		it("should get agent with permissions array", async () => {
			const agent = await auth.api.getAgent({
				headers,
				query: { agentId: permAgentId },
			});
			expect(Array.isArray(agent.permissions)).toBe(true);
			for (const p of agent.permissions) {
				expect(p.scope).toBeDefined();
				expect(p.status).toBeDefined();
				expect(p.grantedBy).toBeDefined();
			}
		});

		it("should list agents with permissions", async () => {
			const res = await client.agent.list({}, { headers });
			expect(res.error).toBeNull();
			const found = res.data!.agents.find(
				(a: { id: string }) => a.id === permAgentId,
			);
			expect(found).toBeDefined();
			expect(Array.isArray(found?.permissions)).toBe(true);
		});

		it("should grant permission to agent (multi-grantor)", async () => {
			await auth.api.signUpEmail({
				body: {
					email: "grantor@test.com",
					password: "test123456",
					name: "Grantor User",
				},
			});
			const { headers: grantorHeaders } = await signInWithUser(
				"grantor@test.com",
				"test123456",
			);

			const res = await auth.api.grantPermission({
				headers: grantorHeaders,
				body: {
					agentId: permAgentId,
					scopes: ["calendar.write"],
				},
			});

			expect(res.permissionIds.length).toBe(1);

			const agent = await auth.api.getAgent({
				headers,
				query: { agentId: permAgentId },
			});
			const calPerm = agent.permissions.find(
				(p: { scope: string }) => p.scope === "calendar.write",
			);
			expect(calPerm).toBeDefined();
			expect(calPerm?.status).toBe("active");
		});

		it("should grant permission with referenceId", async () => {
			const res = await auth.api.grantPermission({
				headers,
				body: {
					agentId: permAgentId,
					scopes: ["docs.read"],
					referenceId: "doc-123",
				},
			});

			expect(res.permissionIds.length).toBe(1);

			const agent = await auth.api.getAgent({
				headers,
				query: { agentId: permAgentId },
			});
			const docPerm = agent.permissions.find(
				(p: { scope: string; referenceId: string | null }) =>
					p.scope === "docs.read" && p.referenceId === "doc-123",
			);
			expect(docPerm).toBeDefined();
		});
	});

	// ---------------------------------------------------------------------------
	// Blocked scopes for grant permission
	// ---------------------------------------------------------------------------
	describe("blocked scopes", async () => {
		const { auth: blockedAuth, signInWithTestUser: blockedSignIn } =
			await getTestInstance(
				{
					plugins: [
						agentAuth({
							blockedScopes: ["admin.*", "system.shutdown"],
							rateLimit: false,
						}),
					],
				},
				{ clientOptions: { plugins: [agentAuthClient()] } },
			);

		const { headers: blockedHeaders } = await blockedSignIn();

		it("should reject agent creation with blocked scopes", async () => {
			const kp = await generateAgentKeypair();
			try {
				await blockedAuth.api.createAgent({
					headers: blockedHeaders,
					body: {
						name: "Blocked Agent",
						publicKey: kp.publicKey,
						scopes: ["reports.read", "admin.delete"],
					},
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("BAD_REQUEST");
			}
		});

		it("should reject granting blocked scopes", async () => {
			const kp = await generateAgentKeypair();
			const agent = await blockedAuth.api.createAgent({
				headers: blockedHeaders,
				body: {
					name: "Non-Blocked Agent",
					publicKey: kp.publicKey,
					scopes: ["reports.read"],
				},
			});

			try {
				await blockedAuth.api.grantPermission({
					headers: blockedHeaders,
					body: {
						agentId: agent.agentId,
						scopes: ["admin.delete"],
					},
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("BAD_REQUEST");
			}
		});

		it("should allow agent creation with non-blocked scopes", async () => {
			const kp = await generateAgentKeypair();
			const res = await blockedAuth.api.createAgent({
				headers: blockedHeaders,
				body: {
					name: "Allowed Agent",
					publicKey: kp.publicKey,
					scopes: ["reports.read", "reports.write"],
				},
			});
			expect(res.agentId).toBeDefined();
		});
	});

	// ---------------------------------------------------------------------------
	// Agent authentication
	// ---------------------------------------------------------------------------
	describe("agent authentication", async () => {
		let authAgentId: string;
		let authAgentKp: Awaited<ReturnType<typeof generateAgentKeypair>>;

		it("should set up agent for auth tests", async () => {
			authAgentKp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Auth Test Agent",
					publicKey: authAgentKp.publicKey,
					scopes: ["reports.read"],
				},
			});
			authAgentId = agent.agentId;
		});

		it("should resolve session from signed JWT", async () => {
			const jwt = await signAgentJWT({
				agentId: authAgentId,
				privateKey: authAgentKp.privateKey,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.agent).toBeDefined();
			expect(data.agent.id).toBe(authAgentId);
			expect(data.agent.name).toBe("Auth Test Agent");
			expect(data.user).toBeDefined();
			expect(data.user.id).toBe(user.id);
		});

		it("should return permissions (not scopes) in session", async () => {
			const jwt = await signAgentJWT({
				agentId: authAgentId,
				privateKey: authAgentKp.privateKey,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);

			const data = await res.json();
			expect(Array.isArray(data.agent.permissions)).toBe(true);
			expect(data.agent.permissions.length).toBeGreaterThanOrEqual(1);
			const perm = data.agent.permissions[0];
			expect(perm.scope).toBeDefined();
			expect(perm.grantedBy).toBeDefined();
			expect(perm.status).toBe("active");
		});

		it("should reject expired JWT", async () => {
			const jwt = await signAgentJWT({
				agentId: authAgentId,
				privateKey: authAgentKp.privateKey,
				expiresIn: -10,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);

			expect(res.status).toBe(401);
		});

		it("should reject JWT signed with wrong key", async () => {
			const wrongKp = await generateAgentKeypair();
			const jwt = await signAgentJWT({
				agentId: authAgentId,
				privateKey: wrongKp.privateKey,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);

			expect(res.status).toBe(401);
		});

		it("should reject replayed JWT (JTI)", async () => {
			const jwt = await signAgentJWT({
				agentId: authAgentId,
				privateKey: authAgentKp.privateKey,
			});

			const res1 = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);
			expect(res1.status).toBe(200);

			const res2 = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);
			expect(res2.status).toBe(401);
		});

		it("should not match non-JWT bearer tokens", async () => {
			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: "Bearer not-a-jwt-token" },
				},
			);

			const data = await res.json();
			expect(data).toBeNull();
		});

		it("should update lastUsedAt on authenticated request", async () => {
			const jwt = await signAgentJWT({
				agentId: authAgentId,
				privateKey: authAgentKp.privateKey,
			});

			await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);

			await new Promise((resolve) => setTimeout(resolve, 200));

			const getRes = await auth.api.getAgent({
				headers,
				query: { agentId: authAgentId },
			});
			expect(getRes.lastUsedAt).not.toBeNull();
		});
	});

	// ---------------------------------------------------------------------------
	// Request binding (DPoP-style)
	// ---------------------------------------------------------------------------
	describe("request binding", () => {
		let bindAgentId: string;
		let bindAgentKp: Awaited<ReturnType<typeof generateAgentKeypair>>;

		it("should set up agent for binding tests", async () => {
			bindAgentKp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Binding Agent",
					publicKey: bindAgentKp.publicKey,
					scopes: ["reports.read"],
				},
			});
			bindAgentId = agent.agentId;
		});

		it("should accept JWT with matching htm/htu claims", async () => {
			const jwt = await signAgentJWT({
				agentId: bindAgentId,
				privateKey: bindAgentKp.privateKey,
				requestBinding: {
					method: "GET",
					path: "/agent/get-session",
				},
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);
			expect(res.status).toBe(200);
		});

		it("should reject when htm doesn't match", async () => {
			const jwt = await signAgentJWT({
				agentId: bindAgentId,
				privateKey: bindAgentKp.privateKey,
				requestBinding: {
					method: "POST",
					path: "/agent/get-session",
				},
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);
			expect(res.status).toBe(401);
		});

		it("should reject when htu doesn't match", async () => {
			const jwt = await signAgentJWT({
				agentId: bindAgentId,
				privateKey: bindAgentKp.privateKey,
				requestBinding: {
					method: "GET",
					path: "/agent/some-other-endpoint",
				},
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);
			expect(res.status).toBe(401);
		});

		it("should accept JWT without binding claims", async () => {
			const jwt = await signAgentJWT({
				agentId: bindAgentId,
				privateKey: bindAgentKp.privateKey,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{
					headers: { Authorization: `Bearer ${jwt}` },
				},
			);
			expect(res.status).toBe(200);
		});

		it("should reject when ath doesn't match body hash", async () => {
			const bodyContent = JSON.stringify({ agentId: bindAgentId });
			const wrongHash = await hashRequestBody("wrong body content");

			const jwt = await signAgentJWT({
				agentId: bindAgentId,
				privateKey: bindAgentKp.privateKey,
				requestBinding: {
					method: "POST",
					path: "/agent/update",
					bodyHash: wrongHash,
				},
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/update",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${jwt}`,
						"Content-Type": "application/json",
					},
					body: bodyContent,
				},
			);
			expect(res.status).toBe(401);
		});
	});

	// ---------------------------------------------------------------------------
	// Key rotation
	// ---------------------------------------------------------------------------
	describe("key rotation", () => {
		it("should rotate agent key and reject old key", async () => {
			const oldKp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Rotate Key Agent",
					publicKey: oldKp.publicKey,
				},
			});

			const newKp = await generateAgentKeypair();
			const rotateRes = await client.agent.rotateKey(
				{
					agentId: agent.agentId,
					publicKey: newKp.publicKey,
				},
				{ headers },
			);
			expect(rotateRes.error).toBeNull();

			const oldJwt = await signAgentJWT({
				agentId: agent.agentId,
				privateKey: oldKp.privateKey,
			});
			const oldRes = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{ headers: { Authorization: `Bearer ${oldJwt}` } },
			);
			expect(oldRes.status).toBe(401);

			const newJwt = await signAgentJWT({
				agentId: agent.agentId,
				privateKey: newKp.privateKey,
			});
			const newRes = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{ headers: { Authorization: `Bearer ${newJwt}` } },
			);
			expect(newRes.status).toBe(200);

			const data = await newRes.json();
			expect(data.agent.id).toBe(agent.agentId);
		});
	});

	// ---------------------------------------------------------------------------
	// Lifecycle
	// ---------------------------------------------------------------------------
	describe("lifecycle", () => {
		it("should revoke agent and wipe credentials", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Revocable Agent",
					publicKey: kp.publicKey,
				},
			});

			const revokeRes = await client.agent.revoke(
				{ agentId: agent.agentId },
				{ headers },
			);
			expect(revokeRes.error).toBeNull();
			expect(revokeRes.data?.success).toBe(true);

			const getRes = await auth.api.getAgent({
				headers,
				query: { agentId: agent.agentId },
			});
			expect(getRes.status).toBe("revoked");
		});

		it("should reject auth from revoked agent", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Soon Revoked Agent",
					publicKey: kp.publicKey,
				},
			});

			await client.agent.revoke({ agentId: agent.agentId }, { headers });

			const jwt = await signAgentJWT({
				agentId: agent.agentId,
				privateKey: kp.privateKey,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{ headers: { Authorization: `Bearer ${jwt}` } },
			);
			expect(res.status).toBe(401);
		});

		it("should transparently reactivate on expired agent with valid JWT", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "TTL Agent",
					publicKey: kp.publicKey,
				},
			});

			await db.update({
				model: "agent",
				where: [{ field: "id", value: agent.agentId }],
				update: { expiresAt: new Date("2020-01-01T00:00:00Z") },
			});

			const jwt = await signAgentJWT({
				agentId: agent.agentId,
				privateKey: kp.privateKey,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{ headers: { Authorization: `Bearer ${jwt}` } },
			);
			expect(res.status).toBe(200);

			const data = await res.json();
			expect(data.agent.id).toBe(agent.agentId);

			await new Promise((r) => setTimeout(r, 200));
			const after = await auth.api.getAgent({
				headers,
				query: { agentId: agent.agentId },
			});
			expect(after.status).toBe("active");
		});

		it("should reactivate expired agent via proof-of-possession", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Reactivatable Agent",
					publicKey: kp.publicKey,
				},
			});

			await db.update({
				model: "agent",
				where: [{ field: "id", value: agent.agentId }],
				update: { status: "expired" },
			});

			const proof = await signAgentJWT({
				agentId: agent.agentId,
				privateKey: kp.privateKey,
			});

			const res = await auth.api.reactivateAgent({
				body: { agentId: agent.agentId, proof },
			});

			expect(res.status).toBe("active");
			expect(res.agentId).toBe(agent.agentId);
			expect(res.activatedAt).toBeDefined();
		});

		it("should reject reactivation of revoked agent", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Revoked No Reactivate Agent",
					publicKey: kp.publicKey,
				},
			});

			await db.update({
				model: "agent",
				where: [{ field: "id", value: agent.agentId }],
				update: { status: "revoked", publicKey: "", kid: null },
			});

			const proof = await signAgentJWT({
				agentId: agent.agentId,
				privateKey: kp.privateKey,
			});

			try {
				await auth.api.reactivateAgent({
					body: { agentId: agent.agentId, proof },
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("FORBIDDEN");
			}
		});

		it("should cleanup expired agents", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Expiring Agent",
					publicKey: kp.publicKey,
				},
			});

			await db.update({
				model: "agent",
				where: [{ field: "id", value: agent.agentId }],
				update: { expiresAt: new Date("2020-01-01T00:00:00Z") },
			});

			const cleanupRes = await client.agent.cleanup({}, { headers });
			expect(cleanupRes.error).toBeNull();
			expect(cleanupRes.data?.expired).toBeGreaterThanOrEqual(1);

			const after = await auth.api.getAgent({
				headers,
				query: { agentId: agent.agentId },
			});
			expect(after.status).toBe("expired");
		});

		it("should reject cleanup without session", async () => {
			const res = await client.agent.cleanup({});
			expect(res.error).toBeDefined();
			expect(res.error?.status).toBe(401);
		});
	});

	// ---------------------------------------------------------------------------
	// Absolute lifetime
	// ---------------------------------------------------------------------------
	describe("absolute lifetime", async () => {
		const {
			auth: absAuth,
			db: absDb,
			customFetchImpl: absFetch,
			signInWithTestUser: absSignIn,
		} = await getTestInstance(
			{
				plugins: [
					agentAuth({
						absoluteLifetime: 600,
						rateLimit: false,
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClient()] } },
		);

		const { headers: absHeaders } = await absSignIn();

		it("should revoke (not expire) when absoluteLifetime elapses", async () => {
			const kp = await generateAgentKeypair();
			const created = await absAuth.api.createAgent({
				headers: absHeaders,
				body: { name: "Absolute Agent", publicKey: kp.publicKey },
			});

			await absDb.update({
				model: "agent",
				where: [{ field: "id", value: created.agentId }],
				update: { createdAt: new Date("2020-01-01T00:00:00Z") },
			});

			const jwt = await signAgentJWT({
				agentId: created.agentId,
				privateKey: kp.privateKey,
			});

			const res = await absFetch(
				"http://localhost:3000/api/auth/agent/get-session",
				{ headers: { Authorization: `Bearer ${jwt}` } },
			);
			expect(res.status).toBe(401);

			await new Promise((r) => setTimeout(r, 200));

			const agent = await absAuth.api.getAgent({
				headers: absHeaders,
				query: { agentId: created.agentId },
			});
			expect(agent.status).toBe("revoked");
		});
	});

	// ---------------------------------------------------------------------------
	// Scope escalation
	// ---------------------------------------------------------------------------
	describe("scope escalation", async () => {
		let escalationAgentId: string;
		let escalationAgentKp: Awaited<ReturnType<typeof generateAgentKeypair>>;

		it("should set up agent for scope escalation tests", async () => {
			escalationAgentKp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Escalation Agent",
					publicKey: escalationAgentKp.publicKey,
					scopes: ["reports.read"],
				},
			});
			escalationAgentId = agent.agentId;
		});

		it("should request additional scopes and create pending permissions", async () => {
			const jwt = await signAgentJWT({
				agentId: escalationAgentId,
				privateKey: escalationAgentKp.privateKey,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/request-scope",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${jwt}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						scopes: ["calendar.write", "email.send"],
						reason: "Need calendar and email access",
					}),
				},
			);

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.status).toBe("pending");
			expect(data.pendingPermissionIds.length).toBe(2);
		});

		it("should check scope request status", async () => {
			const res = await auth.api.scopeRequestStatus({
				query: { requestId: escalationAgentId },
			});

			expect(res.requestId).toBe(escalationAgentId);
			expect(res.status).toBe("pending");
			expect(res.requestedScopes.length).toBe(2);
		});

		it("should approve pending permissions (partial approval)", async () => {
			const res = await auth.api.approveScope({
				headers,
				body: {
					requestId: escalationAgentId,
					action: "approve",
					scopes: ["calendar.write"],
				},
			});

			expect(res.status).toBe("approved");
			expect(res.added).toContain("calendar.write");
			expect(res.added).not.toContain("email.send");

			const agent = await auth.api.getAgent({
				headers,
				query: { agentId: escalationAgentId },
			});
			const calPerm = agent.permissions.find(
				(p: { scope: string }) => p.scope === "calendar.write",
			);
			expect(calPerm?.status).toBe("active");

			const emailPerm = agent.permissions.find(
				(p: { scope: string }) => p.scope === "email.send",
			);
			expect(emailPerm?.status).toBe("denied");
		});

		it("should deny all pending permissions", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Deny Agent",
					publicKey: kp.publicKey,
					scopes: ["reports.read"],
				},
			});

			const jwt = await signAgentJWT({
				agentId: agent.agentId,
				privateKey: kp.privateKey,
			});

			await customFetchImpl(
				"http://localhost:3000/api/auth/agent/request-scope",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${jwt}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ scopes: ["admin.write"] }),
				},
			);

			const res = await auth.api.approveScope({
				headers,
				body: {
					requestId: agent.agentId,
					action: "deny",
				},
			});

			expect(res.status).toBe("denied");
		});
	});

	// ---------------------------------------------------------------------------
	// Update agent
	// ---------------------------------------------------------------------------
	describe("update agent", () => {
		let updateAgentId: string;

		it("should create agent for update tests", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Updatable Agent",
					publicKey: kp.publicKey,
				},
			});
			updateAgentId = agent.agentId;
		});

		it("should update name", async () => {
			const res = await client.agent.update(
				{
					agentId: updateAgentId,
					name: "Renamed Agent",
				},
				{ headers },
			);

			expect(res.error).toBeNull();
			expect(res.data?.name).toBe("Renamed Agent");
		});

		it("should update metadata", async () => {
			const res = await client.agent.update(
				{
					agentId: updateAgentId,
					metadata: { version: "1.2.0", enabled: true },
				},
				{ headers },
			);

			expect(res.error).toBeNull();
			expect(res.data?.metadata).toEqual({
				version: "1.2.0",
				enabled: true,
			});
		});

		it("should not accept scopes field (field does not exist on update)", async () => {
			const res = await client.agent.update(
				{
					agentId: updateAgentId,
					name: "Still Named",
					// @ts-expect-error — scopes is not a valid field on update
					scopes: ["test.scope"],
				} as { agentId: string; name: string },
				{ headers },
			);

			expect(res.error).toBeNull();
			expect(res.data?.name).toBe("Still Named");
		});
	});

	// ---------------------------------------------------------------------------
	// User isolation
	// ---------------------------------------------------------------------------
	describe("user isolation", async () => {
		let isolatedAgentId: string;

		it("should set up agents for isolation test", async () => {
			const kp = await generateAgentKeypair();
			const agent = await auth.api.createAgent({
				headers,
				body: {
					name: "Isolated Agent",
					publicKey: kp.publicKey,
				},
			});
			isolatedAgentId = agent.agentId;

			await auth.api.signUpEmail({
				body: {
					email: "other-user@test.com",
					password: "test123456",
					name: "Other User",
				},
			});
		});

		it("should not let a user see agents owned by another user", async () => {
			const { headers: otherHeaders } = await signInWithUser(
				"other-user@test.com",
				"test123456",
			);

			const listRes = await client.agent.list({}, { headers: otherHeaders });
			expect(listRes.data).toBeDefined();
			expect(listRes.data!.agents.length).toBe(0);
			expect(listRes.data!.total).toBe(0);

			const getRes = await client.agent.get(
				{ query: { agentId: isolatedAgentId } },
				{ headers: otherHeaders },
			);
			expect(getRes.error).toBeDefined();
			expect(getRes.error?.status).toBe(404);
		});
	});

	// ---------------------------------------------------------------------------
	// Discovery
	// ---------------------------------------------------------------------------
	describe("discovery", () => {
		it("should return server configuration", async () => {
			const res = await auth.api.discover({});
			expect(res.algorithms).toEqual(["Ed25519"]);
			expect(res.scopes.length).toBeGreaterThanOrEqual(2);
			expect(res.roles).toEqual(["reader", "writer"]);
			expect(typeof res.jwtMaxAge).toBe("number");
			expect(typeof res.sessionTTL).toBe("number");
		});
	});

	// ---------------------------------------------------------------------------
	// List filtering and pagination
	// ---------------------------------------------------------------------------
	describe("list filtering and pagination", () => {
		it("should filter agents by status", async () => {
			const activeRes = await client.agent.list(
				{ query: { status: "active" } },
				{ headers },
			);
			expect(activeRes.error).toBeNull();
			for (const a of activeRes.data!.agents) {
				expect(a.status).toBe("active");
			}
		});

		it("should respect pagination limit and offset", async () => {
			const page1 = await client.agent.list(
				{ query: { limit: "2", offset: "0" } },
				{ headers },
			);
			expect(page1.error).toBeNull();
			expect(page1.data!.agents.length).toBeLessThanOrEqual(2);
			expect(page1.data!.limit).toBe(2);
			expect(page1.data!.offset).toBe(0);

			const page2 = await client.agent.list(
				{ query: { limit: "2", offset: "2" } },
				{ headers },
			);
			expect(page2.error).toBeNull();
			expect(page2.data!.offset).toBe(2);
		});

		it("should sort agents by name ascending", async () => {
			const res = await client.agent.list(
				{ query: { sortBy: "name", sortDirection: "asc" } },
				{ headers },
			);
			expect(res.error).toBeNull();
			const names = res.data!.agents.map((a: { name: string }) => a.name);
			const sorted = [...names].sort((a, b) => a.localeCompare(b));
			expect(names).toEqual(sorted);
		});
	});

	// ---------------------------------------------------------------------------
	// AAP format JWT claims
	// ---------------------------------------------------------------------------
	describe("AAP format JWT", async () => {
		const {
			auth: aapAuth,
			signInWithTestUser: aapSignIn,
			customFetchImpl: aapFetch,
		} = await getTestInstance(
			{
				plugins: [agentAuth({ jwtFormat: "aap", rateLimit: false })],
			},
			{ clientOptions: { plugins: [agentAuthClient()] } },
		);

		const { headers: aapHeaders, user: aapUser } = await aapSignIn();

		it("should work with AAP format JWT claims", async () => {
			const aapKp = await generateAgentKeypair();
			const created = await aapAuth.api.createAgent({
				headers: aapHeaders,
				body: {
					name: "AAP Agent",
					publicKey: aapKp.publicKey,
					scopes: ["test.scope"],
				},
			});

			const jwt = await signAgentJWT({
				agentId: created.agentId,
				privateKey: aapKp.privateKey,
				format: "aap",
			});

			const res = await aapFetch(
				"http://localhost:3000/api/auth/agent/get-session",
				{ headers: { Authorization: `Bearer ${jwt}` } },
			);

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.agent.id).toBe(created.agentId);
			expect(data.user.id).toBe(aapUser.id);
		});
	});

	// ---------------------------------------------------------------------------
	// Validate scopes
	// ---------------------------------------------------------------------------
	describe("validateScopes", async () => {
		const { client: vsClient, signInWithTestUser: vsSignIn } =
			await getTestInstance(
				{
					plugins: [
						agentAuth({
							roles: {
								reader: ["reports.read"],
								writer: ["reports.read", "reports.write"],
							},
							validateScopes: true,
							rateLimit: false,
						}),
					],
				},
				{ clientOptions: { plugins: [agentAuthClient()] } },
			);

		const { headers: vsHeaders } = await vsSignIn();

		it("should accept known scopes when validateScopes is true", async () => {
			const kp = await generateAgentKeypair();
			const res = await vsClient.agent.create(
				{
					name: "Valid Scopes Agent",
					publicKey: kp.publicKey,
					scopes: ["reports.read"],
				},
				{ headers: vsHeaders },
			);
			expect(res.error).toBeNull();
			expect(res.data?.scopes).toEqual(["reports.read"]);
		});

		it("should reject unknown scopes when validateScopes is true", async () => {
			const kp = await generateAgentKeypair();
			const res = await vsClient.agent.create(
				{
					name: "Bad Scopes Agent",
					publicKey: kp.publicKey,
					scopes: ["reports.read", "nonexistent.scope"],
				},
				{ headers: vsHeaders },
			);
			expect(res.error).toBeDefined();
			expect(res.error?.status).toBe(400);
		});

		it("should use custom validation function", async () => {
			const { client: fnClient, signInWithTestUser: fnSignIn } =
				await getTestInstance(
					{
						plugins: [
							agentAuth({
								validateScopes: (scopes) =>
									scopes.every((s) => s.startsWith("custom.")),
								rateLimit: false,
							}),
						],
					},
					{ clientOptions: { plugins: [agentAuthClient()] } },
				);
			const { headers: fnHeaders } = await fnSignIn();

			const kp1 = await generateAgentKeypair();
			const okRes = await fnClient.agent.create(
				{
					name: "Custom OK",
					publicKey: kp1.publicKey,
					scopes: ["custom.read", "custom.write"],
				},
				{ headers: fnHeaders },
			);
			expect(okRes.error).toBeNull();

			const kp2 = await generateAgentKeypair();
			const failRes = await fnClient.agent.create(
				{
					name: "Custom Fail",
					publicKey: kp2.publicKey,
					scopes: ["custom.read", "bad.scope"],
				},
				{ headers: fnHeaders },
			);
			expect(failRes.error).toBeDefined();
			expect(failRes.error?.status).toBe(400);
		});
	});

	// ---------------------------------------------------------------------------
	// Host lifetime clocks
	// ---------------------------------------------------------------------------
	describe("host lifetime clocks", async () => {
		const {
			auth: clockAuth,
			db: clockDb,
			signInWithTestUser: clockSignIn,
		} = await getTestInstance(
			{
				plugins: [
					agentAuth({
						agentSessionTTL: 3600,
						agentMaxLifetime: 86400,
						absoluteLifetime: 172800,
						roles: { reader: ["reports.read"] },
						rateLimit: false,
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClient()] } },
		);

		const { headers: clockHeaders } = await clockSignIn();

		it("should revoke host when absoluteLifetime elapses", async () => {
			const enrKp = await generateAgentKeypair();
			const host = await clockAuth.api.createHost({
				headers: clockHeaders,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			await clockDb.update({
				model: "agentHost",
				where: [{ field: "id", value: host.hostId }],
				update: { createdAt: new Date("2020-01-01T00:00:00Z") },
			});

			const jwt = await signAgentJWT({
				agentId: host.hostId,
				privateKey: enrKp.privateKey,
			});

			const agentKp = await generateAgentKeypair();
			try {
				await clockAuth.api.createAgent({
					body: {
						name: "AbsoluteLifetime Agent",
						publicKey: agentKp.publicKey,
						hostJWT: jwt,
					},
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("FORBIDDEN");
			}

			const h = await clockAuth.api.getHost({
				headers: clockHeaders,
				query: { hostId: host.hostId },
			});
			expect(h.status).toBe("revoked");
		});

		it("should expire host when agentMaxLifetime elapses", async () => {
			const enrKp = await generateAgentKeypair();
			const host = await clockAuth.api.createHost({
				headers: clockHeaders,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			await clockDb.update({
				model: "agentHost",
				where: [{ field: "id", value: host.hostId }],
				update: { activatedAt: new Date("2020-01-01T00:00:00Z") },
			});

			const jwt = await signAgentJWT({
				agentId: host.hostId,
				privateKey: enrKp.privateKey,
			});

			const agentKp = await generateAgentKeypair();
			try {
				await clockAuth.api.createAgent({
					body: {
						name: "MaxLifetime Agent",
						publicKey: agentKp.publicKey,
						hostJWT: jwt,
					},
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("FORBIDDEN");
			}

			const h = await clockAuth.api.getHost({
				headers: clockHeaders,
				query: { hostId: host.hostId },
			});
			expect(h.status).toBe("expired");
		});

		it("should reject host creation when expiresAt has passed", async () => {
			const enrKp = await generateAgentKeypair();
			const host = await clockAuth.api.createHost({
				headers: clockHeaders,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			await clockDb.update({
				model: "agentHost",
				where: [{ field: "id", value: host.hostId }],
				update: {
					expiresAt: new Date("2020-01-01T00:00:00Z"),
				},
			});

			const jwt = await signAgentJWT({
				agentId: host.hostId,
				privateKey: enrKp.privateKey,
			});

			const agentKp = await generateAgentKeypair();
			try {
				await clockAuth.api.createAgent({
					body: {
						name: "Expired Host Agent",
						publicKey: agentKp.publicKey,
						hostJWT: jwt,
					},
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("FORBIDDEN");
			}
		});

		it("should not reactivate host when absoluteLifetime elapsed", async () => {
			const enrKp = await generateAgentKeypair();
			const host = await clockAuth.api.createHost({
				headers: clockHeaders,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			await clockDb.update({
				model: "agentHost",
				where: [{ field: "id", value: host.hostId }],
				update: {
					status: "expired",
					createdAt: new Date("2020-01-01T00:00:00Z"),
				},
			});

			const proof = await signAgentJWT({
				agentId: host.hostId,
				privateKey: enrKp.privateKey,
			});

			try {
				await clockAuth.api.reactivateHost({
					body: { hostId: host.hostId, proof },
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("FORBIDDEN");
			}

			const h = await clockAuth.api.getHost({
				headers: clockHeaders,
				query: { hostId: host.hostId },
			});
			expect(h.status).toBe("revoked");
		});

		it("should not reactivate a revoked host", async () => {
			const enrKp = await generateAgentKeypair();
			const host = await clockAuth.api.createHost({
				headers: clockHeaders,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			await clockAuth.api.revokeHost({
				headers: clockHeaders,
				body: { hostId: host.hostId },
			});

			const proof = await signAgentJWT({
				agentId: host.hostId,
				privateKey: enrKp.privateKey,
			});

			try {
				await clockAuth.api.reactivateHost({
					body: { hostId: host.hostId, proof },
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("FORBIDDEN");
			}
		});

		it("should update host lastUsedAt and expiresAt on use (TTL heartbeat)", async () => {
			const enrKp = await generateAgentKeypair();
			const host = await clockAuth.api.createHost({
				headers: clockHeaders,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			const jwt = await signAgentJWT({
				agentId: host.hostId,
				privateKey: enrKp.privateKey,
			});

			const agentKp = await generateAgentKeypair();
			await clockAuth.api.createAgent({
				body: {
					name: "Heartbeat Agent",
					publicKey: agentKp.publicKey,
					hostJWT: jwt,
				},
			});

			await new Promise((r) => setTimeout(r, 200));

			const updated = await clockAuth.api.getHost({
				headers: clockHeaders,
				query: { hostId: host.hostId },
			});
			expect(updated.lastUsedAt).not.toBeNull();
			expect(updated.expiresAt).not.toBeNull();
		});

		it("should reject replayed host JWTs (JTI cache)", async () => {
			const enrKp = await generateAgentKeypair();
			const host = await clockAuth.api.createHost({
				headers: clockHeaders,
				body: {
					publicKey: enrKp.publicKey,
					scopes: ["reports.read"],
				},
			});

			const jwt = await signAgentJWT({
				agentId: host.hostId,
				privateKey: enrKp.privateKey,
			});

			const agentKp1 = await generateAgentKeypair();
			await clockAuth.api.createAgent({
				body: {
					name: "First Use",
					publicKey: agentKp1.publicKey,
					hostJWT: jwt,
				},
			});

			const agentKp2 = await generateAgentKeypair();
			try {
				await clockAuth.api.createAgent({
					body: {
						name: "Replayed Use",
						publicKey: agentKp2.publicKey,
						hostJWT: jwt,
					},
				});
				expect.unreachable();
			} catch (e: unknown) {
				const err = e as { status: string };
				expect(err.status).toBe("UNAUTHORIZED");
			}
		});
	});

	// ---------------------------------------------------------------------------
	// Scope decay on reactivation
	// ---------------------------------------------------------------------------
	describe("scope decay on reactivation", async () => {
		it("should decay permissions to host scopes on transparent reactivation", async () => {
			const hostKp = await generateAgentKeypair();
			const host = await auth.api.createHost({
				headers,
				body: {
					publicKey: hostKp.publicKey,
					scopes: ["base.read"],
				},
			});

			const hostJWT = await signAgentJWT({
				agentId: host.hostId,
				privateKey: hostKp.privateKey,
			});

			const kp = await generateAgentKeypair();
			const created = await auth.api.createAgent({
				body: {
					name: "Decay Agent",
					publicKey: kp.publicKey,
					hostJWT,
				},
			});

			expect(created.scopes).toEqual(["base.read"]);

			await auth.api.grantPermission({
				headers,
				body: {
					agentId: created.agentId,
					scopes: ["escalated.write"],
				},
			});

			await db.update({
				model: "agent",
				where: [{ field: "id", value: created.agentId }],
				update: {
					expiresAt: new Date("2020-01-01T00:00:00Z"),
				},
			});

			const jwt = await signAgentJWT({
				agentId: created.agentId,
				privateKey: kp.privateKey,
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/agent/get-session",
				{ headers: { Authorization: `Bearer ${jwt}` } },
			);
			expect(res.status).toBe(200);

			const data = await res.json();
			const scopes = data.agent.permissions.map(
				(p: { scope: string }) => p.scope,
			);
			expect(scopes).toEqual(["base.read"]);
		});

		it("should decay permissions to host scopes on proof-of-possession reactivation", async () => {
			const hostKp = await generateAgentKeypair();
			const host = await auth.api.createHost({
				headers,
				body: {
					publicKey: hostKp.publicKey,
					scopes: ["base.read"],
				},
			});

			const hostJWT = await signAgentJWT({
				agentId: host.hostId,
				privateKey: hostKp.privateKey,
			});

			const kp = await generateAgentKeypair();
			const created = await auth.api.createAgent({
				body: {
					name: "Decay PoP Agent",
					publicKey: kp.publicKey,
					hostJWT,
				},
			});

			await auth.api.grantPermission({
				headers,
				body: {
					agentId: created.agentId,
					scopes: ["escalated.write"],
				},
			});

			await db.update({
				model: "agent",
				where: [{ field: "id", value: created.agentId }],
				update: { status: "expired" },
			});

			const proof = await signAgentJWT({
				agentId: created.agentId,
				privateKey: kp.privateKey,
			});

			const res = await auth.api.reactivateAgent({
				body: { agentId: created.agentId, proof },
			});

			expect(res.status).toBe("active");
			const scopes = res.permissions.map((p: { scope: string }) => p.scope);
			expect(scopes).toEqual(["base.read"]);
		});
	});
});

// ---------------------------------------------------------------------------
// Scope utilities (pure functions — separate describe)
// ---------------------------------------------------------------------------
describe("scope utilities", () => {
	it("should match exact scopes", () => {
		expect(hasScope(["reports.read"], "reports.read")).toBe(true);
		expect(hasScope(["reports.read"], "reports.write")).toBe(false);
	});

	it("should match wildcard scopes", () => {
		expect(hasScope(["github.*"], "github.create_issue")).toBe(true);
		expect(hasScope(["github.*"], "github.read_repo")).toBe(true);
		expect(hasScope(["github.*"], "gitlab.read_repo")).toBe(false);
		expect(hasScope(["*"], "anything.at.all")).toBe(true);
	});

	it("should check all scopes", () => {
		expect(
			hasAllScopes(
				["github.*", "reports.read"],
				["github.create_issue", "reports.read"],
			),
		).toBe(true);
		expect(
			hasAllScopes(["github.*"], ["github.create_issue", "reports.read"]),
		).toBe(false);
	});

	it("should check subset relationship", () => {
		expect(isSubsetOf(["github.create_issue"], ["github.*"])).toBe(true);
		expect(
			isSubsetOf(["github.create_issue", "gitlab.read"], ["github.*"]),
		).toBe(false);
	});

	it("should merge and deduplicate scopes", () => {
		const merged = mergeScopes(
			["github.*", "github.create_issue"],
			["reports.read", "github.read_repo"],
		);
		expect(merged).toContain("github.*");
		expect(merged).toContain("reports.read");
		expect(merged).not.toContain("github.create_issue");
		expect(merged).not.toContain("github.read_repo");
	});

	it("should find blocked scopes", () => {
		const blocked = findBlockedScopes(
			["reports.read", "admin.delete", "system.shutdown"],
			["admin.*", "system.shutdown"],
		);
		expect(blocked).toContain("admin.delete");
		expect(blocked).toContain("system.shutdown");
		expect(blocked).not.toContain("reports.read");
	});
});
