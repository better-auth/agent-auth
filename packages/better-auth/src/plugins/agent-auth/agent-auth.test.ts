import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { agentAuth } from ".";
import { agentAuthClient } from "./client";
import { generateAgentKeypair, signAgentJWT } from "./crypto";

describe("agent-auth", async () => {
	const { client, auth, db, signInWithTestUser, signInWithUser, customFetchImpl } =
		await getTestInstance(
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

	// =========================================================================
	// CREATE AGENT
	// =========================================================================

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

	// =========================================================================
	// LIST AGENTS
	// =========================================================================

	it("should list agents for the current user", async () => {
		const res = await client.agent.list({}, { headers });

		expect(res.error).toBeNull();
		expect(res.data).toBeDefined();
		expect(Array.isArray(res.data)).toBe(true);
		// We created 3 agents in the tests above
		expect(res.data!.length).toBeGreaterThanOrEqual(3);

		const found = res.data!.find((a: { id: string }) => a.id === agentId);
		expect(found).toBeDefined();
		expect(found?.name).toBe("Test Agent");
		expect(found?.status).toBe("active");
		// Verify scopes come back as a parsed array, not a JSON string
		expect(Array.isArray(found?.scopes)).toBe(true);
		expect(found?.scopes).toEqual(["email.send", "reports.read"]);
	});

	// =========================================================================
	// GET AGENT
	// =========================================================================

	it("should get a single agent by ID", async () => {
		const res = await client.agent.get({ query: { agentId } }, { headers });

		expect(res.error).toBeNull();
		expect(res.data).toBeDefined();
		expect(res.data?.id).toBe(agentId);
		expect(res.data?.name).toBe("Test Agent");
		expect(res.data?.status).toBe("active");
		// Verify scopes come back as a parsed array, not a JSON string
		expect(Array.isArray(res.data?.scopes)).toBe(true);
		expect(res.data?.scopes).toEqual(["email.send", "reports.read"]);
	});

	// =========================================================================
	// UPDATE AGENT
	// =========================================================================

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

		// Verify with get
		const getRes = await client.agent.get({ query: { agentId } }, { headers });
		expect(getRes.data?.name).toBe("Updated Agent");
	});

	// =========================================================================
	// BEFORE HOOK / JWT AUTH
	// =========================================================================

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

		// "not-a-jwt-token" is not 3 segments, so the before hook doesn't match.
		// The endpoint returns 200 with null body (no agentSession set).
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

		// Give the background update a moment to complete
		await new Promise((resolve) => setTimeout(resolve, 200));

		const getRes = await client.agent.get({ query: { agentId } }, { headers });

		expect(getRes.data?.lastUsedAt).toBeDefined();
		expect(getRes.data?.lastUsedAt).not.toBeNull();
	});

	// =========================================================================
	// ROTATE KEY
	// =========================================================================

	it("should rotate key and reject old key", async () => {
		const newKeypair = await generateAgentKeypair();

		// Rotate to new key
		const rotateRes = await client.agent.rotateKey(
			{
				agentId,
				publicKey: newKeypair.publicKey,
			},
			{ headers },
		);
		expect(rotateRes.error).toBeNull();

		// Old key should fail
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

		// New key should work
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

	// =========================================================================
	// REVOKE AGENT
	// =========================================================================

	it("should revoke agent and wipe credentials", async () => {
		// Create a dedicated agent for revocation testing
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

		// Revoke it
		const revokeRes = await client.agent.revoke(
			{ agentId: revokeAgentId },
			{ headers },
		);
		expect(revokeRes.error).toBeNull();
		expect(revokeRes.data?.success).toBe(true);

		// Verify it's revoked
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

		// Revoke it
		await client.agent.revoke({ agentId: revokedId }, { headers });

		// Try to auth with it
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

	// =========================================================================
	// EDGE CASES
	// =========================================================================

	it("should not let a user see or access agents hired by another user", async () => {
		// Create a second user
		await auth.api.signUpEmail({
			body: {
				email: "other@test.com",
				password: "test123456",
				name: "Other User",
			},
		});

		// Sign in as the second user
		const { headers: otherHeaders } = await signInWithUser(
			"other@test.com",
			"test123456",
		);

		// Try to list -- should get empty
		const listRes = await client.agent.list({}, { headers: otherHeaders });
		expect(listRes.data).toBeDefined();
		expect(listRes.data!.length).toBe(0);

		// Try to get the first user's agent -- should fail
		const getRes = await client.agent.get(
			{ query: { agentId } },
			{ headers: otherHeaders },
		);
		expect(getRes.error).toBeDefined();
		expect(getRes.error?.status).toBe(404);
	});

	// =========================================================================
	// ACTIVITY LOGGING
	// =========================================================================

	it("should return activity logs for a user's agents", async () => {
		const actRes = await client.agent.activity({ query: {} }, { headers });

		expect(actRes.error).toBeNull();
		expect(actRes.data).toBeDefined();
		expect(Array.isArray(actRes.data)).toBe(true);
	});

	it("should reject activity query without session", async () => {
		const res = await client.agent.activity({ query: {} });
		expect(res.error).toBeDefined();
		expect(res.error?.status).toBe(401);
	});

	it("should log activity via log-activity endpoint (agent JWT)", async () => {
		const freshKp = await generateAgentKeypair();
		const freshCreate = await client.agent.create(
			{
				name: "Manual Log Agent",
				publicKey: freshKp.publicKey,
			},
			{ headers },
		);
		const logAgentId = freshCreate.data!.agentId;

		const jwt = await signAgentJWT({
			agentId: logAgentId,
			privateKey: freshKp.privateKey,
		});

		const logRes = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/log-activity",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${jwt}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					method: "TOOL",
					path: "github.create_issue",
					status: 200,
				}),
			},
		);

		expect(logRes.status).toBe(200);

		// Wait for background logging from the after-hook too
		await new Promise((resolve) => setTimeout(resolve, 300));

		const actRes = await client.agent.activity(
			{ query: { agentId: logAgentId } },
			{ headers },
		);
		expect(actRes.data).toBeDefined();
		const toolEntry = actRes.data!.find(
			(e: { method: string }) => e.method === "TOOL",
		);
		expect(toolEntry).toBeDefined();
		expect(toolEntry!.path).toBe("github.create_issue");
	});

	it("should reject log-activity without agent JWT", async () => {
		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/log-activity",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					method: "TOOL",
					path: "github.list_repos",
				}),
			},
		);

		// No agent JWT → the before hook doesn't match → no agentSession → 401
		expect(res.status).toBe(401);
	});

	it("should filter activity by agentId", async () => {
		// Query activity for a non-existent agent — should return empty
		const actRes = await client.agent.activity(
			{ query: { agentId: "nonexistent-id" } },
			{ headers },
		);
		expect(actRes.error).toBeNull();
		expect(actRes.data).toBeDefined();
		expect(actRes.data!.length).toBe(0);
	});

	// =========================================================================
	// CLEANUP AGENTS
	// =========================================================================

	it("should cleanup expired agents", async () => {
		// Create an agent with a very short TTL via the server API
		const expKp = await generateAgentKeypair();
		const created = await auth.api.createAgent({
			headers,
			body: {
				name: "Expiring Agent",
				publicKey: expKp.publicKey,
				scopes: ["test.scope"],
			},
		});

		// Manually expire it by setting expiresAt in the past
		await db.update({
			model: "agent",
			where: [{ field: "id", value: created.agentId }],
			update: { expiresAt: new Date("2020-01-01T00:00:00Z") },
		});

		const cleanupRes = await client.agent.cleanup({}, { headers });
		expect(cleanupRes.error).toBeNull();
		expect(cleanupRes.data?.revoked).toBeGreaterThanOrEqual(1);

		// Verify the agent is now revoked
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

	// =========================================================================
	// GATEWAY CONFIG
	// =========================================================================

	it("should return gateway config (public endpoint)", async () => {
		const res = await client.agent.gatewayConfig({});
		expect(res.error).toBeNull();
		expect(res.data).toBeDefined();
		expect(res.data?.providers).toBeDefined();
		expect(Array.isArray(res.data?.providers)).toBe(true);
	});

	// =========================================================================
	// PROVIDER MANAGEMENT
	// =========================================================================

	// Shared instance with authorizeProviderManagement: true for CRUD tests
	const {
		client: provClient,
		signInWithTestUser: provSignIn,
		customFetchImpl: provFetch,
	} = await getTestInstance(
		{ plugins: [agentAuth({ authorizeProviderManagement: true })] },
		{ clientOptions: { plugins: [agentAuthClient()] } },
	);
	const { headers: provHeaders } = await provSignIn();

	function provRegister(body: Record<string, unknown>) {
		return provFetch(
			"http://localhost:3000/api/auth/agent/mcp-provider/register",
			{
				method: "POST",
				headers: {
					...Object.fromEntries(provHeaders.entries()),
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			},
		);
	}

	function provDelete(name: string) {
		return provFetch(
			"http://localhost:3000/api/auth/agent/mcp-provider/delete",
			{
				method: "POST",
				headers: {
					...Object.fromEntries(provHeaders.entries()),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name }),
			},
		);
	}

	// --- registerProvider ---

	it("should register a stdio provider", async () => {
		const res = await provRegister({
			name: "stdio-prov",
			displayName: "Stdio Provider",
			transport: "stdio",
			command: "echo",
			args: ["hello"],
		});
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.name).toBe("stdio-prov");
		expect(data.transport).toBe("stdio");
		expect(data.status).toBe("active");
	});

	it("should register an SSE provider", async () => {
		const res = await provRegister({
			name: "sse-prov",
			displayName: "SSE Provider",
			transport: "sse",
			url: "https://mcp.example.com/sse",
		});
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.name).toBe("sse-prov");
		expect(data.transport).toBe("sse");
		expect(data.status).toBe("active");
	});

	it("should reject duplicate active provider name", async () => {
		const res = await provRegister({
			name: "stdio-prov",
			displayName: "Dup",
			transport: "stdio",
			command: "echo",
		});
		expect(res.status).toBe(400);
	});

	it("should reject stdio transport without command", async () => {
		const res = await provRegister({
			name: "bad-stdio",
			displayName: "Bad Stdio",
			transport: "stdio",
		});
		expect(res.status).toBe(400);
	});

	it("should reject sse transport without url", async () => {
		const res = await provRegister({
			name: "bad-sse",
			displayName: "Bad SSE",
			transport: "sse",
		});
		expect(res.status).toBe(400);
	});

	it("should reject provider registration without admin role (default guard)", async () => {
		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/mcp-provider/register",
			{
				method: "POST",
				headers: {
					...Object.fromEntries(headers.entries()),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: "blocked",
					displayName: "Blocked",
					transport: "stdio",
					command: "echo",
				}),
			},
		);
		expect(res.status).toBe(403);
	});

	// --- listProviders ---

	it("should list only active providers", async () => {
		const listRes = await provClient.agent.mcpProvider.list(
			{},
			{ headers: provHeaders },
		);
		expect(listRes.error).toBeNull();
		const names = listRes.data?.providers?.map(
			(p: { name: string }) => p.name,
		);
		expect(names).toContain("stdio-prov");
		expect(names).toContain("sse-prov");
	});

	it("should not leak env/headers/command in list response", async () => {
		const listRes = await provClient.agent.mcpProvider.list(
			{},
			{ headers: provHeaders },
		);
		const prov = listRes.data?.providers?.[0];
		expect(prov).toBeDefined();
		// Response should only contain safe fields
		expect(prov).not.toHaveProperty("env");
		expect(prov).not.toHaveProperty("headers");
		expect(prov).not.toHaveProperty("command");
		expect(prov).not.toHaveProperty("args");
		expect(prov).not.toHaveProperty("url");
	});

	it("should reject list without session", async () => {
		const res = await provClient.agent.mcpProvider.list({});
		expect(res.error).toBeDefined();
		expect(res.error?.status).toBe(401);
	});

	// --- deleteProvider ---

	it("should soft-delete a provider (set status disabled)", async () => {
		const res = await provDelete("stdio-prov");
		expect(res.status).toBe(200);

		// Should be gone from list
		const listRes = await provClient.agent.mcpProvider.list(
			{},
			{ headers: provHeaders },
		);
		const names = listRes.data?.providers?.map(
			(p: { name: string }) => p.name,
		);
		expect(names).not.toContain("stdio-prov");
	});

	it("should return 404 when deleting already-disabled provider", async () => {
		const res = await provDelete("stdio-prov");
		expect(res.status).toBe(404);
	});

	it("should return 404 when deleting nonexistent provider", async () => {
		const res = await provDelete("does-not-exist");
		expect(res.status).toBe(404);
	});

	it("should reject delete without admin role (default guard)", async () => {
		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/agent/mcp-provider/delete",
			{
				method: "POST",
				headers: {
					...Object.fromEntries(headers.entries()),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: "sse-prov" }),
			},
		);
		expect(res.status).toBe(403);
	});

	// --- reactivation ---

	it("should reactivate a disabled provider on re-register with same name", async () => {
		// stdio-prov was soft-deleted above — re-register with new config
		const res = await provRegister({
			name: "stdio-prov",
			displayName: "Stdio v2",
			transport: "stdio",
			command: "node",
		});
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.displayName).toBe("Stdio v2");
		expect(data.status).toBe("active");

		// Should be back in list
		const listRes = await provClient.agent.mcpProvider.list(
			{},
			{ headers: provHeaders },
		);
		const found = listRes.data?.providers?.find(
			(p: { name: string; displayName: string }) => p.name === "stdio-prov",
		);
		expect(found).toBeDefined();
		expect(found!.displayName).toBe("Stdio v2");
	});

	// =========================================================================
	// KEY ALGORITHM ENFORCEMENT
	// =========================================================================

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

	// =========================================================================
	// AAP FORMAT
	// =========================================================================

	it("should work with AAP format JWT claims", async () => {
		// Create a separate instance with AAP format
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

		// Create agent via server API
		const created = await aapAuth.api.createAgent({
			headers: aapHeaders,
			body: {
				name: "AAP Agent",
				publicKey: aapKeypair.publicKey,
				scopes: ["test.scope"],
			},
		});

		// Sign JWT in AAP format
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
});
