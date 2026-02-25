import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { agentAuth } from ".";
import { agentAuthClient } from "./client";
import { generateAgentKeypair, signAgentJWT } from "./crypto";

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
	const keypair = await generateAgentKeypair();

	let agentId: string;

	it("should create an agent with public key", async () => {
		const res = await client.agent.create(
			{
				name: "Test Agent",
				publicKey: keypair.publicKey,
				scopes: ["email.send", "reports.read"],
			},
			{ headers },
		);

		expect(res.error).toBeNull();
		expect(res.data).toBeDefined();
		expect(res.data?.agentId).toBeDefined();
		expect(res.data?.name).toBe("Test Agent");
		expect(res.data?.scopes).toEqual(["email.send", "reports.read"]);

		agentId = res.data!.agentId;
	});

	it("should resolve scopes from role config", async () => {
		const kp = await generateAgentKeypair();
		const res = await client.agent.create(
			{
				name: "Reader Agent",
				publicKey: kp.publicKey,
				role: "writer",
			},
			{ headers },
		);

		expect(res.error).toBeNull();
		expect(res.data?.scopes).toEqual(["reports.read", "reports.write"]);
		expect(res.data?.role).toBe("writer");
	});

	it("should apply default role when no role specified", async () => {
		const kp = await generateAgentKeypair();
		const res = await client.agent.create(
			{
				name: "Default Role Agent",
				publicKey: kp.publicKey,
			},
			{ headers },
		);

		expect(res.error).toBeNull();
		expect(res.data?.role).toBe("reader");
		expect(res.data?.scopes).toEqual(["reports.read"]);
	});

	it("should reject create without session", async () => {
		const res = await client.agent.create({
			name: "No Session Agent",
			publicKey: keypair.publicKey,
		});

		expect(res.data).toBeNull();
		expect(res.error).toBeDefined();
		expect(res.error?.status).toBe(401);
	});

	it("should reject create with invalid public key", async () => {
		const res = await client.agent.create(
			{
				name: "Bad Key Agent",
				publicKey: {},
			},
			{ headers },
		);

		expect(res.data).toBeNull();
		expect(res.error).toBeDefined();
		expect(res.error?.status).toBe(400);
	});

	it("should list agents for the current user", async () => {
		const res = await client.agent.list({}, { headers });

		expect(res.error).toBeNull();
		expect(res.data).toBeDefined();
		expect(Array.isArray(res.data!.agents)).toBe(true);
		expect(typeof res.data!.total).toBe("number");
		expect(res.data!.total).toBeGreaterThanOrEqual(3);

		const found = res.data!.agents.find(
			(a: { id: string }) => a.id === agentId,
		);
		expect(found).toBeDefined();
		expect(found?.name).toBe("Test Agent");
		expect(found?.status).toBe("active");
		expect(Array.isArray(found?.scopes)).toBe(true);
		expect(found?.scopes).toEqual(["email.send", "reports.read"]);
	});

	it("should get a single agent by ID", async () => {
		const res = await client.agent.get({ query: { agentId } }, { headers });

		expect(res.error).toBeNull();
		expect(res.data).toBeDefined();
		expect(res.data?.id).toBe(agentId);
		expect(res.data?.name).toBe("Test Agent");
		expect(res.data?.status).toBe("active");
		expect(Array.isArray(res.data?.scopes)).toBe(true);
		expect(res.data?.scopes).toEqual(["email.send", "reports.read"]);
	});

	it("should update agent name and scopes", async () => {
		const res = await client.agent.update(
			{
				agentId,
				name: "Updated Agent",
				scopes: ["reports.read", "calendar.write"],
			},
			{ headers },
		);

		expect(res.error).toBeNull();
		expect(res.data).toBeDefined();
		expect(res.data?.name).toBe("Updated Agent");
		expect(res.data?.scopes).toEqual(["reports.read", "calendar.write"]);

		const getRes = await client.agent.get({ query: { agentId } }, { headers });
		expect(getRes.data?.name).toBe("Updated Agent");
	});

	it("should resolve agent session from signed JWT", async () => {
		const jwt = await signAgentJWT({
			agentId,
			privateKey: keypair.privateKey,
		});

		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{
				headers: {
					Authorization: `Bearer ${jwt}`,
				},
			},
		);

		const data = await res.json();
		expect(data).toBeDefined();
		expect(data.agent).toBeDefined();
		expect(data.agent.id).toBe(agentId);
		expect(data.agent.name).toBe("Updated Agent");
		expect(data.user).toBeDefined();
		expect(data.user.id).toBe(user.id);
		expect(data.user.email).toBe(user.email);
	});

	it("should reject expired JWT", async () => {
		const jwt = await signAgentJWT({
			agentId,
			privateKey: keypair.privateKey,
			expiresIn: -10,
		});

		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{
				headers: {
					Authorization: `Bearer ${jwt}`,
				},
			},
		);

		expect(res.status).toBe(401);
	});

	it("should reject JWT signed with wrong private key", async () => {
		const wrongKeypair = await generateAgentKeypair();
		const jwt = await signAgentJWT({
			agentId,
			privateKey: wrongKeypair.privateKey,
		});

		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{
				headers: {
					Authorization: `Bearer ${jwt}`,
				},
			},
		);

		expect(res.status).toBe(401);
	});

	it("should not match non-JWT bearer tokens", async () => {
		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{
				headers: {
					Authorization: "Bearer not-a-jwt-token",
				},
			},
		);

		const data = await res.json();
		expect(data).toBeNull();
	});

	it("should update lastUsedAt after authenticated request", async () => {
		const jwt = await signAgentJWT({
			agentId,
			privateKey: keypair.privateKey,
		});

		await customFetchImpl("http://localhost:3000/api/auth/agent/get-session", {
			headers: {
				Authorization: `Bearer ${jwt}`,
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		const getRes = await client.agent.get({ query: { agentId } }, { headers });

		expect(getRes.data?.lastUsedAt).toBeDefined();
		expect(getRes.data?.lastUsedAt).not.toBeNull();
	});

	it("should rotate key and reject old key", async () => {
		const newKeypair = await generateAgentKeypair();

		const rotateRes = await client.agent.rotateKey(
			{
				agentId,
				publicKey: newKeypair.publicKey,
			},
			{ headers },
		);
		expect(rotateRes.error).toBeNull();

		const oldJwt = await signAgentJWT({
			agentId,
			privateKey: keypair.privateKey,
		});

		const oldRes = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{
				headers: { Authorization: `Bearer ${oldJwt}` },
			},
		);
		expect(oldRes.status).toBe(401);

		const newJwt = await signAgentJWT({
			agentId,
			privateKey: newKeypair.privateKey,
		});

		const newRes = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{
				headers: { Authorization: `Bearer ${newJwt}` },
			},
		);
		expect(newRes.status).toBe(200);

		const data = await newRes.json();
		expect(data.agent.id).toBe(agentId);
	});

	it("should revoke agent and wipe credentials", async () => {
		const revokeKp = await generateAgentKeypair();
		const createRes = await client.agent.create(
			{
				name: "Revocable Agent",
				publicKey: revokeKp.publicKey,
				scopes: ["test.scope"],
			},
			{ headers },
		);
		const revokeAgentId = createRes.data!.agentId;

		const revokeRes = await client.agent.revoke(
			{ agentId: revokeAgentId },
			{ headers },
		);
		expect(revokeRes.error).toBeNull();
		expect(revokeRes.data?.success).toBe(true);

		const getRes = await client.agent.get(
			{ query: { agentId: revokeAgentId } },
			{ headers },
		);
		expect(getRes.data?.status).toBe("revoked");
	});

	it("should reject auth from revoked agent", async () => {
		const revokeKp = await generateAgentKeypair();
		const createRes = await client.agent.create(
			{
				name: "Soon Revoked Agent",
				publicKey: revokeKp.publicKey,
			},
			{ headers },
		);
		const revokedId = createRes.data!.agentId;

		await client.agent.revoke({ agentId: revokedId }, { headers });

		const jwt = await signAgentJWT({
			agentId: revokedId,
			privateKey: revokeKp.privateKey,
		});

		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{
				headers: { Authorization: `Bearer ${jwt}` },
			},
		);

		expect(res.status).toBe(401);
	});

	it("should not let a user see agents owned by another user", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "other@test.com",
				password: "test123456",
				name: "Other User",
			},
		});

		const { headers: otherHeaders } = await signInWithUser(
			"other@test.com",
			"test123456",
		);

		const listRes = await client.agent.list({}, { headers: otherHeaders });
		expect(listRes.data).toBeDefined();
		expect(listRes.data!.agents.length).toBe(0);
		expect(listRes.data!.total).toBe(0);

		const getRes = await client.agent.get(
			{ query: { agentId } },
			{ headers: otherHeaders },
		);
		expect(getRes.error).toBeDefined();
		expect(getRes.error?.status).toBe(404);
	});

	it("should cleanup expired agents", async () => {
		const expKp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			headers,
			body: {
				name: "Expiring Agent",
				publicKey: expKp.publicKey,
				scopes: ["test.scope"],
			},
		});

		await db.update({
			model: "agent",
			where: [{ field: "id", value: created.agentId }],
			update: { expiresAt: new Date("2020-01-01T00:00:00Z") },
		});

		const cleanupRes = await client.agent.cleanup({}, { headers });
		expect(cleanupRes.error).toBeNull();
		expect(cleanupRes.data?.revoked).toBeGreaterThanOrEqual(1);

		const getRes = await client.agent.get(
			{ query: { agentId: created.agentId } },
			{ headers },
		);
		expect(getRes.data?.status).toBe("revoked");
	});

	it("should reject cleanup without session", async () => {
		const res = await client.agent.cleanup({});
		expect(res.error).toBeDefined();
		expect(res.error?.status).toBe(401);
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
		expect(res.error).toBeDefined();
		expect(res.error?.status).toBe(400);
	});

	it("should work with AAP format JWT claims", async () => {
		const {
			auth: aapAuth,
			signInWithTestUser: aapSignIn,
			customFetchImpl: aapFetch,
		} = await getTestInstance(
			{
				plugins: [
					agentAuth({
						jwtFormat: "aap",
					}),
				],
			},
			{
				clientOptions: {
					plugins: [agentAuthClient()],
				},
			},
		);

		const { headers: aapHeaders, user: aapUser } = await aapSignIn();
		const aapKeypair = await generateAgentKeypair();

		const created = await aapAuth.api.createAgent({
			headers: aapHeaders,
			body: {
				name: "AAP Agent",
				publicKey: aapKeypair.publicKey,
				scopes: ["test.scope"],
			},
		});

		const jwt = await signAgentJWT({
			agentId: created.agentId,
			privateKey: aapKeypair.privateKey,
			format: "aap",
		});

		const res = await aapFetch(
			"http://localhost:3000/api/auth/agent/get-session",
			{
				headers: { Authorization: `Bearer ${jwt}` },
			},
		);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.agent.id).toBe(created.agentId);
		expect(data.user.id).toBe(aapUser.id);
	});

	it("should filter agents by status", async () => {
		const activeRes = await client.agent.list(
			{ query: { status: "active" } },
			{ headers },
		);
		expect(activeRes.error).toBeNull();
		for (const a of activeRes.data!.agents) {
			expect(a.status).toBe("active");
		}

		const revokedRes = await client.agent.list(
			{ query: { status: "revoked" } },
			{ headers },
		);
		expect(revokedRes.error).toBeNull();
		for (const a of revokedRes.data!.agents) {
			expect(a.status).toBe("revoked");
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
		expect(page1.data!.total).toBeGreaterThanOrEqual(2);

		const page2 = await client.agent.list(
			{ query: { limit: "2", offset: "2" } },
			{ headers },
		);
		expect(page2.error).toBeNull();
		expect(page2.data!.offset).toBe(2);
		if (page1.data!.agents.length > 0 && page2.data!.agents.length > 0) {
			expect(page1.data!.agents[0]!.id).not.toBe(page2.data!.agents[0]!.id);
		}
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

describe("agent-auth validateScopes", async () => {
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

describe("agent-auth maxAgentsPerUser", async () => {
	const { client: limClient, signInWithTestUser: limSignIn } =
		await getTestInstance(
			{
				plugins: [agentAuth({ maxAgentsPerUser: 2 })],
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
