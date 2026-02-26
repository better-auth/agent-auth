import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { agentAuth } from ".";
import { agentAuthClient } from "./client";
import { generateAgentKeypair, signAgentJWT } from "./crypto";
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

	it("should set activatedAt on agent creation", async () => {
		const getRes = await client.agent.get({ query: { agentId } }, { headers });
		expect(getRes.data?.activatedAt).toBeDefined();
		expect(getRes.data?.activatedAt).not.toBeNull();
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
		expect(data.agent.enrollmentId).toBeNull();
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

	it("should cleanup expired agents to 'expired' state (not revoked)", async () => {
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
		expect(getRes.data?.status).toBe("expired");
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

describe("agent-auth enrollment", async () => {
	const { auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				agentAuth({
					roles: {
						reader: ["reports.read"],
						writer: ["reports.read", "reports.write"],
					},
				}),
			],
		},
		{ clientOptions: { plugins: [agentAuthClient()] } },
	);

	const { headers } = await signInWithTestUser();

	const enrollmentKeypair = await generateAgentKeypair();
	let enrollmentId: string;

	it("should create an enrollment with keypair", async () => {
		const res = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrollmentKeypair.publicKey,
				appSource: "cursor",
				baseScopes: ["reports.read"],
			},
		});

		expect(res.enrollmentId).toBeDefined();
		expect(res.baseScopes).toEqual(["reports.read"]);
		expect(res.status).toBe("active");

		enrollmentId = res.enrollmentId;
	});

	it("should list enrollments for the current user", async () => {
		const res = await auth.api.listEnrollments({ headers });
		expect(res.enrollments.length).toBeGreaterThanOrEqual(1);
		const found = res.enrollments.find(
			(e: { id: string }) => e.id === enrollmentId,
		);
		expect(found).toBeDefined();
		expect(found?.appSource).toBe("cursor");
		expect(found?.status).toBe("active");
	});

	it("should get an enrollment by ID", async () => {
		const res = await auth.api.getEnrollment({
			headers,
			query: { enrollmentId },
		});
		expect(res.id).toBe(enrollmentId);
		expect(res.appSource).toBe("cursor");
		expect(res.baseScopes).toEqual(["reports.read"]);
	});

	it("should create agent silently via enrollment JWT (no bearer tokens)", async () => {
		const enrollmentJWT = await signAgentJWT({
			agentId: enrollmentId,
			privateKey: enrollmentKeypair.privateKey,
		});

		const kp = await generateAgentKeypair();
		const res = await auth.api.createAgent({
			body: {
				name: "Silent Agent",
				publicKey: kp.publicKey,
				enrollmentJWT,
				source: "cursor",
			},
		});

		expect(res.agentId).toBeDefined();
		expect(res.name).toBe("Silent Agent");
		expect(res.scopes).toEqual(["reports.read"]);
		expect(res.enrollmentId).toBe(enrollmentId);

		const agent = await auth.api.getAgent({
			headers,
			query: { agentId: res.agentId },
		});
		expect(agent.enrollmentId).toBe(enrollmentId);
		expect(agent.source).toBe("cursor");
	});

	it("should allow requesting a scope subset via enrollmentJWT", async () => {
		const enrKp = await generateAgentKeypair();
		const enr2 = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read", "reports.write", "email.send"],
			},
		});

		const jwt = await signAgentJWT({
			agentId: enr2.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const agentKp = await generateAgentKeypair();
		const res = await auth.api.createAgent({
			body: {
				name: "Subset Agent",
				publicKey: agentKp.publicKey,
				enrollmentJWT: jwt,
				scopes: ["reports.read"],
			},
		});

		expect(res.scopes).toEqual(["reports.read"]);
	});

	it("should reject scopes that exceed enrollment baseScopes", async () => {
		const enrKp = await generateAgentKeypair();
		const enrRes = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		const jwt = await signAgentJWT({
			agentId: enrRes.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const agentKp = await generateAgentKeypair();
		try {
			await auth.api.createAgent({
				body: {
					name: "Overscoped Agent",
					publicKey: agentKp.publicKey,
					enrollmentJWT: jwt,
					scopes: ["reports.read", "admin.write"],
				},
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string };
			expect(err.status).toBe("BAD_REQUEST");
		}
	});

	it("should reject silent creation with invalid JWT", async () => {
		const wrongKp = await generateAgentKeypair();
		const badJwt = await signAgentJWT({
			agentId: enrollmentId,
			privateKey: wrongKp.privateKey,
		});

		const kp = await generateAgentKeypair();
		try {
			await auth.api.createAgent({
				body: {
					name: "Bad JWT Agent",
					publicKey: kp.publicKey,
					enrollmentJWT: badJwt,
				},
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string };
			expect(err.status).toBe("UNAUTHORIZED");
		}
	});

	it("should cascade revoke enrollment to all agents", async () => {
		const cascadeKp = await generateAgentKeypair();
		const cascadeEnr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: cascadeKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		const jwt = await signAgentJWT({
			agentId: cascadeEnr.enrollmentId,
			privateKey: cascadeKp.privateKey,
		});

		const kp1 = await generateAgentKeypair();
		const kp2 = await generateAgentKeypair();

		const agent1 = await auth.api.createAgent({
			body: {
				name: "Cascade Agent 1",
				publicKey: kp1.publicKey,
				enrollmentJWT: jwt,
			},
		});

		const jwt2 = await signAgentJWT({
			agentId: cascadeEnr.enrollmentId,
			privateKey: cascadeKp.privateKey,
		});
		const agent2 = await auth.api.createAgent({
			body: {
				name: "Cascade Agent 2",
				publicKey: kp2.publicKey,
				enrollmentJWT: jwt2,
			},
		});

		const res = await auth.api.revokeEnrollment({
			headers,
			body: { enrollmentId: cascadeEnr.enrollmentId },
		});

		expect(res.success).toBe(true);
		expect(res.revokedAgentCount).toBeGreaterThanOrEqual(2);

		const a1 = await auth.api.getAgent({
			headers,
			query: { agentId: agent1.agentId },
		});
		expect(a1.status).toBe("revoked");

		const a2 = await auth.api.getAgent({
			headers,
			query: { agentId: agent2.agentId },
		});
		expect(a2.status).toBe("revoked");
	});
});

describe("agent-auth enrollment lifetime", async () => {
	const { auth, db, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				agentAuth({
					agentSessionTTL: 3600,
					roles: {
						reader: ["reports.read"],
					},
				}),
			],
		},
		{ clientOptions: { plugins: [agentAuthClient()] } },
	);

	const { headers } = await signInWithTestUser();

	it("should reject agent creation when enrollment expiresAt has passed (ENROLLMENT_EXPIRED)", async () => {
		const enrKp = await generateAgentKeypair();
		const enr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		await db.update({
			model: "agentEnrollment",
			where: [{ field: "id", value: enr.enrollmentId }],
			update: { expiresAt: new Date("2020-01-01T00:00:00Z") },
		});

		const jwt = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const agentKp = await generateAgentKeypair();
		try {
			await auth.api.createAgent({
				body: {
					name: "Expired Enrollment Agent",
					publicKey: agentKp.publicKey,
					enrollmentJWT: jwt,
				},
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string; body?: { message?: string } };
			expect(err.status).toBe("FORBIDDEN");
		}
	});

	it("should reactivate expired enrollment via proof-of-possession", async () => {
		const enrKp = await generateAgentKeypair();
		const enr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		await db.update({
			model: "agentEnrollment",
			where: [{ field: "id", value: enr.enrollmentId }],
			update: { status: "expired" },
		});

		const proof = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const res = await auth.api.reactivateEnrollment({
			body: {
				enrollmentId: enr.enrollmentId,
				proof,
			},
		});

		expect(res.status).toBe("active");
		expect(res.enrollmentId).toBe(enr.enrollmentId);

		const jwt = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});
		const agentKp = await generateAgentKeypair();
		const agent = await auth.api.createAgent({
			body: {
				name: "Post-Reactivation Agent",
				publicKey: agentKp.publicKey,
				enrollmentJWT: jwt,
			},
		});
		expect(agent.agentId).toBeDefined();
	});

	it("should not reactivate a revoked enrollment", async () => {
		const enrKp = await generateAgentKeypair();
		const enr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		await auth.api.revokeEnrollment({
			headers,
			body: { enrollmentId: enr.enrollmentId },
		});

		const proof = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		try {
			await auth.api.reactivateEnrollment({
				body: { enrollmentId: enr.enrollmentId, proof },
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string };
			expect(err.status).toBe("FORBIDDEN");
		}
	});

	it("should idempotently reactivate enrollment when same kid is resubmitted (§4.3)", async () => {
		const enrKp = await generateAgentKeypair();
		const first = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		await db.update({
			model: "agentEnrollment",
			where: [{ field: "id", value: first.enrollmentId }],
			update: { status: "expired" },
		});

		const second = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read", "reports.write"],
			},
		});

		expect(second.enrollmentId).toBe(first.enrollmentId);
		expect(second.status).toBe("active");
		expect(second.reactivated).toBe(true);
		expect(second.baseScopes).toEqual(["reports.read", "reports.write"]);
	});

	it("should reject replayed enrollment JWTs (JTI cache)", async () => {
		const enrKp = await generateAgentKeypair();
		const enr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		const jwt = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const agentKp1 = await generateAgentKeypair();
		await auth.api.createAgent({
			body: {
				name: "First Use",
				publicKey: agentKp1.publicKey,
				enrollmentJWT: jwt,
			},
		});

		const agentKp2 = await generateAgentKeypair();
		try {
			await auth.api.createAgent({
				body: {
					name: "Replayed Use",
					publicKey: agentKp2.publicKey,
					enrollmentJWT: jwt,
				},
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string };
			expect(err.status).toBe("UNAUTHORIZED");
		}
	});

	it("should update enrollment lastUsedAt and expiresAt on use (TTL heartbeat)", async () => {
		const enrKp = await generateAgentKeypair();
		const enr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		const jwt = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const agentKp = await generateAgentKeypair();
		await auth.api.createAgent({
			body: {
				name: "Heartbeat Agent",
				publicKey: agentKp.publicKey,
				enrollmentJWT: jwt,
			},
		});

		await new Promise((r) => setTimeout(r, 200));

		const updated = await auth.api.getEnrollment({
			headers,
			query: { enrollmentId: enr.enrollmentId },
		});
		expect(updated.lastUsedAt).not.toBeNull();
		expect(updated.expiresAt).not.toBeNull();
	});
});

describe("agent-auth enrollment lifetime clocks", async () => {
	const { auth, db, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				agentAuth({
					agentSessionTTL: 3600,
					agentMaxLifetime: 86400,
					absoluteLifetime: 172800,
					roles: { reader: ["reports.read"] },
				}),
			],
		},
		{ clientOptions: { plugins: [agentAuthClient()] } },
	);

	const { headers } = await signInWithTestUser();

	it("should revoke enrollment when absoluteLifetime elapses (§9.2)", async () => {
		const enrKp = await generateAgentKeypair();
		const enr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		await db.update({
			model: "agentEnrollment",
			where: [{ field: "id", value: enr.enrollmentId }],
			update: { createdAt: new Date("2020-01-01T00:00:00Z") },
		});

		const jwt = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const agentKp = await generateAgentKeypair();
		try {
			await auth.api.createAgent({
				body: {
					name: "AbsoluteLifetime Agent",
					publicKey: agentKp.publicKey,
					enrollmentJWT: jwt,
				},
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string };
			expect(err.status).toBe("FORBIDDEN");
		}

		const enrollment = await auth.api.getEnrollment({
			headers,
			query: { enrollmentId: enr.enrollmentId },
		});
		expect(enrollment.status).toBe("revoked");
	});

	it("should expire enrollment when agentMaxLifetime elapses and allow reactivation (§9.2)", async () => {
		const enrKp = await generateAgentKeypair();
		const enr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		await db.update({
			model: "agentEnrollment",
			where: [{ field: "id", value: enr.enrollmentId }],
			update: { activatedAt: new Date("2020-01-01T00:00:00Z") },
		});

		const jwt = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const agentKp = await generateAgentKeypair();
		try {
			await auth.api.createAgent({
				body: {
					name: "MaxLifetime Agent",
					publicKey: agentKp.publicKey,
					enrollmentJWT: jwt,
				},
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string };
			expect(err.status).toBe("FORBIDDEN");
		}

		const expired = await auth.api.getEnrollment({
			headers,
			query: { enrollmentId: enr.enrollmentId },
		});
		expect(expired.status).toBe("expired");

		const proof = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});
		const res = await auth.api.reactivateEnrollment({
			body: { enrollmentId: enr.enrollmentId, proof },
		});
		expect(res.status).toBe("active");

		const jwt2 = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});
		const agentKp2 = await generateAgentKeypair();
		const agent = await auth.api.createAgent({
			body: {
				name: "Post-MaxLifetime Agent",
				publicKey: agentKp2.publicKey,
				enrollmentJWT: jwt2,
			},
		});
		expect(agent.agentId).toBeDefined();
	});

	it("should reject reactivateEnrollment when absoluteLifetime has elapsed (§9.2)", async () => {
		const enrKp = await generateAgentKeypair();
		const enr = await auth.api.createEnrollment({
			headers,
			body: {
				publicKey: enrKp.publicKey,
				baseScopes: ["reports.read"],
			},
		});

		await db.update({
			model: "agentEnrollment",
			where: [{ field: "id", value: enr.enrollmentId }],
			update: {
				status: "expired",
				createdAt: new Date("2020-01-01T00:00:00Z"),
			},
		});

		const proof = await signAgentJWT({
			agentId: enr.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		try {
			await auth.api.reactivateEnrollment({
				body: { enrollmentId: enr.enrollmentId, proof },
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string };
			expect(err.status).toBe("FORBIDDEN");
		}

		const enrollment = await auth.api.getEnrollment({
			headers,
			query: { enrollmentId: enr.enrollmentId },
		});
		expect(enrollment.status).toBe("revoked");
	});
});

describe("agent-auth three-state lifecycle", async () => {
	const { auth, db, customFetchImpl, signInWithTestUser } =
		await getTestInstance(
			{
				plugins: [
					agentAuth({
						agentSessionTTL: 3600,
						agentMaxLifetime: 86400,
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClient()] } },
		);

	const { headers } = await signInWithTestUser();

	it("should transparently reactivate when TTL elapses and JWT is valid (§7.1)", async () => {
		const kp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			headers,
			body: { name: "TTL Agent", publicKey: kp.publicKey },
		});

		await db.update({
			model: "agent",
			where: [{ field: "id", value: created.agentId }],
			update: { expiresAt: new Date("2020-01-01T00:00:00Z") },
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
		expect(data.agent.id).toBe(created.agentId);

		await new Promise((r) => setTimeout(r, 200));

		const agent = await auth.api.getAgent({
			headers,
			query: { agentId: created.agentId },
		});
		expect(agent.status).toBe("active");
	});

	it("should reactivate expired agent via proof-of-possession", async () => {
		const kp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			headers,
			body: { name: "Reactivatable Agent", publicKey: kp.publicKey },
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
		expect(res.agentId).toBe(created.agentId);
		expect(res.activatedAt).toBeDefined();
	});

	it("should not reactivate revoked agent", async () => {
		const kp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			headers,
			body: { name: "Revoked Agent", publicKey: kp.publicKey },
		});

		await db.update({
			model: "agent",
			where: [{ field: "id", value: created.agentId }],
			update: { status: "revoked", publicKey: "", kid: null },
		});

		const proof = await signAgentJWT({
			agentId: created.agentId,
			privateKey: kp.privateKey,
		});

		try {
			await auth.api.reactivateAgent({
				body: { agentId: created.agentId, proof },
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string; statusCode?: number };
			expect(err.status === "FORBIDDEN" || err.statusCode === 403).toBe(true);
		}
	});

	it("should decay scopes to enrollment baseScopes on reactivation", async () => {
		const enrKp = await generateAgentKeypair();
		const enrollRes = await auth.api.createEnrollment({
			headers,
			body: { publicKey: enrKp.publicKey, baseScopes: ["base.read"] },
		});

		const enrollmentJWT = await signAgentJWT({
			agentId: enrollRes.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const kp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			body: {
				name: "Decay Agent",
				publicKey: kp.publicKey,
				enrollmentJWT,
			},
		});

		expect(created.scopes).toEqual(["base.read"]);

		await db.update({
			model: "agent",
			where: [{ field: "id", value: created.agentId }],
			update: {
				scopes: JSON.stringify(["base.read", "escalated.write"]),
				status: "expired",
			},
		});

		const proof = await signAgentJWT({
			agentId: created.agentId,
			privateKey: kp.privateKey,
		});

		const res = await auth.api.reactivateAgent({
			body: { agentId: created.agentId, proof },
		});

		expect(res.scopes).toEqual(["base.read"]);
	});

	it("should transparently decay scopes on expired agent request", async () => {
		const enrKp = await generateAgentKeypair();
		const enrollRes = await auth.api.createEnrollment({
			headers,
			body: { publicKey: enrKp.publicKey, baseScopes: ["base.read"] },
		});

		const enrollmentJWT = await signAgentJWT({
			agentId: enrollRes.enrollmentId,
			privateKey: enrKp.privateKey,
		});

		const kp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			body: {
				name: "Transparent Decay Agent",
				publicKey: kp.publicKey,
				enrollmentJWT,
			},
		});

		await db.update({
			model: "agent",
			where: [{ field: "id", value: created.agentId }],
			update: {
				scopes: JSON.stringify(["base.read", "escalated.write"]),
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
		expect(data.agent.scopes).toEqual(["base.read"]);
	});
});

describe("agent-auth absoluteLifetime", async () => {
	const { auth, db, customFetchImpl, signInWithTestUser } =
		await getTestInstance(
			{
				plugins: [
					agentAuth({
						absoluteLifetime: 600,
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClient()] } },
		);

	const { headers } = await signInWithTestUser();

	it("should revoke (not expire) when absoluteLifetime elapses", async () => {
		const kp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			headers,
			body: { name: "Absolute Agent", publicKey: kp.publicKey },
		});

		await db.update({
			model: "agent",
			where: [{ field: "id", value: created.agentId }],
			update: { createdAt: new Date("2020-01-01T00:00:00Z") },
		});

		const jwt = await signAgentJWT({
			agentId: created.agentId,
			privateKey: kp.privateKey,
		});

		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{ headers: { Authorization: `Bearer ${jwt}` } },
		);
		expect(res.status).toBe(401);

		await new Promise((r) => setTimeout(r, 200));

		const agent = await auth.api.getAgent({
			headers,
			query: { agentId: created.agentId },
		});
		expect(agent.status).toBe("revoked");
	});
});

describe("agent-auth JTI replay", async () => {
	const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance(
		{
			plugins: [agentAuth()],
		},
		{ clientOptions: { plugins: [agentAuthClient()] } },
	);

	const { headers } = await signInWithTestUser();

	it("should reject replayed JWTs", async () => {
		const kp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			headers,
			body: { name: "Replay Agent", publicKey: kp.publicKey },
		});

		const jwt = await signAgentJWT({
			agentId: created.agentId,
			privateKey: kp.privateKey,
		});

		const res1 = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{ headers: { Authorization: `Bearer ${jwt}` } },
		);
		expect(res1.status).toBe(200);

		const res2 = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/get-session",
			{ headers: { Authorization: `Bearer ${jwt}` } },
		);
		expect(res2.status).toBe(401);
	});
});

describe("agent-auth discovery", async () => {
	const { auth } = await getTestInstance(
		{
			plugins: [
				agentAuth({
					roles: {
						reader: ["reports.read"],
						writer: ["reports.read", "reports.write"],
					},
					allowedKeyAlgorithms: ["Ed25519", "P-256"],
					blockedScopes: ["admin.delete"],
				}),
			],
		},
		{ clientOptions: { plugins: [agentAuthClient()] } },
	);

	it("should return configuration via discovery endpoint", async () => {
		const res = await auth.api.discover({});
		expect(res.supportedAlgorithms).toEqual(["Ed25519", "P-256"]);
		expect(res.availableScopes).toContain("reports.read");
		expect(res.availableScopes).toContain("reports.write");
		expect(res.roles).toEqual(["reader", "writer"]);
		expect(res.blockedScopes).toEqual(["admin.delete"]);
		expect(typeof res.jwtMaxAge).toBe("number");
		expect(typeof res.sessionTTL).toBe("number");
	});
});

describe("agent-auth blocked scopes", async () => {
	const { auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				agentAuth({
					blockedScopes: ["admin.*", "system.shutdown"],
				}),
			],
		},
		{ clientOptions: { plugins: [agentAuthClient()] } },
	);

	const { headers } = await signInWithTestUser();

	it("should reject agent creation with blocked scopes", async () => {
		const kp = await generateAgentKeypair();
		try {
			await auth.api.createAgent({
				headers,
				body: {
					name: "Blocked Agent",
					publicKey: kp.publicKey,
					scopes: ["reports.read", "admin.delete"],
				},
			});
			expect.unreachable();
		} catch (e: unknown) {
			const err = e as { status: string; statusCode?: number };
			expect(err.status === "BAD_REQUEST" || err.statusCode === 400).toBe(true);
		}
	});

	it("should allow agent creation with non-blocked scopes", async () => {
		const kp = await generateAgentKeypair();
		const res = await auth.api.createAgent({
			headers,
			body: {
				name: "Allowed Agent",
				publicKey: kp.publicKey,
				scopes: ["reports.read", "reports.write"],
			},
		});
		expect(res.agentId).toBeDefined();
	});
});

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
