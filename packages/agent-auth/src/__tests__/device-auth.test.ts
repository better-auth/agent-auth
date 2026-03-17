import { describe, expect, it, beforeAll, vi } from "vitest";
import { getTestInstance } from "better-auth/test";
import {
	agentAuth,
	agentAuthClientPlugin,
	generateTestKeypair,
	signTestJWT,
	json,
	createTestClient,
	BASE,
} from "./helpers";
import type { AgentJWK } from "../types";

const TEST_CAPABILITIES = [
	{ name: "check_balance", description: "Check account balance" },
	{ name: "transfer", description: "Transfer money" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let client: ReturnType<typeof createTestClient>;

beforeAll(async () => {
	const t = await getTestInstance(
		{
			plugins: [
				agentAuth({
					providerName: "device-auth-test",
					capabilities: TEST_CAPABILITIES,
					modes: ["delegated"],
					approvalMethods: ["device_authorization", "ciba"],
					resolveApprovalMethod: async ({ preferredMethod }) =>
						preferredMethod ?? "device_authorization",
				}),
			],
		},
		{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
	);
	auth = t.auth;
	client = createTestClient((req) => auth.handler(req));

	const { headers } = await t.signInWithTestUser();
	sessionCookie = headers.get("cookie") ?? "";
});

/**
 * Register a pending agent. Requests `transfer` (not in host defaults)
 * so the agent stays pending and gets a device_authorization approval.
 */
async function setupAgent(): Promise<{
	agentId: string;
	userCode: string;
	hostId: string;
	hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	body: Record<string, unknown>;
}> {
	const hostKeypair = await generateTestKeypair();
	const createRes = await client.authedPost(
		"/host/create",
		{
			name: "Device Auth Host",
			public_key: hostKeypair.publicKey,
			default_capabilities: ["check_balance"],
		},
		sessionCookie,
	);
	const { hostId } = await json<{ hostId: string }>(createRes);

	const agentKeypair = await generateTestKeypair();
	const { agentId, body } = await client.registerAgentViaHost({
		hostKeypair,
		agentKeypair,
		hostId,
		capabilities: ["check_balance", "transfer"],
	});

	const approval = body.approval as Record<string, unknown>;
	const userCode = approval.user_code as string;

	return { agentId, userCode, hostId, hostKeypair, agentKeypair, body };
}

// ================================================================
// A. user_code verification (core security)
// ================================================================

describe("user_code verification", () => {
	it("approves with correct user_code", async () => {
		const { agentId, userCode } = await setupAgent();

		const res = await client.authedPost(
			"/agent/approve-capability",
			{ agent_id: agentId, action: "approve", user_code: userCode },
			sessionCookie,
		);

		expect(res.ok).toBe(true);
		const body = await json<{ status: string }>(res);
		expect(body.status).toBe("approved");
	});

	it("rejects approval without user_code", async () => {
		const { agentId } = await setupAgent();

		const res = await client.authedPost(
			"/agent/approve-capability",
			{ agent_id: agentId, action: "approve" },
			sessionCookie,
		);

		expect(res.ok).toBe(false);
		const body = await json<{ error: string }>(res);
		expect(body.error).toBe("invalid_user_code");
	});

	it("rejects approval with wrong user_code", async () => {
		const { agentId } = await setupAgent();

		const res = await client.authedPost(
			"/agent/approve-capability",
			{ agent_id: agentId, action: "approve", user_code: "XXXX-YYYY" },
			sessionCookie,
		);

		expect(res.ok).toBe(false);
		const body = await json<{ error: string }>(res);
		expect(body.error).toBe("invalid_user_code");
	});

	it("accepts case-insensitive user_code", async () => {
		const { agentId, userCode } = await setupAgent();

		const res = await client.authedPost(
			"/agent/approve-capability",
			{ agent_id: agentId, action: "approve", user_code: userCode.toLowerCase() },
			sessionCookie,
		);

		expect(res.ok).toBe(true);
		const body = await json<{ status: string }>(res);
		expect(body.status).toBe("approved");
	});

	it("allows deny without user_code", async () => {
		const { agentId } = await setupAgent();

		const res = await client.authedPost(
			"/agent/approve-capability",
			{ agent_id: agentId, action: "deny" },
			sessionCookie,
		);

		expect(res.ok).toBe(true);
		const body = await json<{ status: string }>(res);
		expect(body.status).toBe("denied");
	});

	it("CIBA approval succeeds without user_code", async () => {
		const t = await getTestInstance(
			{
				plugins: [
					agentAuth({
						providerName: "ciba-test",
						capabilities: TEST_CAPABILITIES,
						modes: ["delegated"],
						approvalMethods: ["ciba", "device_authorization"],
						resolveApprovalMethod: async () => "ciba",
					}),
				],
			},
			{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
		);

		const { headers } = await t.signInWithTestUser();
		const cookie = headers.get("cookie") ?? "";
		const cibaClient = createTestClient((req) => t.auth.handler(req));

		const hostKeypair = await generateTestKeypair();
		const createRes = await cibaClient.authedPost(
			"/host/create",
			{
				name: "CIBA Host",
				public_key: hostKeypair.publicKey,
				default_capabilities: ["check_balance"],
			},
			cookie,
		);
		const { hostId } = await json<{ hostId: string }>(createRes);

		const agentKeypair = await generateTestKeypair();
		// Request "transfer" (not in defaults) so agent stays pending
		const { agentId } = await cibaClient.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance", "transfer"],
		});

		const res = await cibaClient.authedPost(
			"/agent/approve-capability",
			{ agent_id: agentId, action: "approve" },
			cookie,
		);

		expect(res.ok).toBe(true);
		const body = await json<{ status: string }>(res);
		expect(body.status).toBe("approved");
	});
});

// ================================================================
// B. Approval request expiry
// ================================================================

describe("Approval expiry", () => {
	it("rejects approval with expired approval request", async () => {
		const { agentId, userCode } = await setupAgent();

		// Advance time past the approval expiry (300s default)
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(Date.now() + 301 * 1000);
		try {
			const res = await client.authedPost(
				"/agent/approve-capability",
				{ agent_id: agentId, action: "approve", user_code: userCode },
				sessionCookie,
			);

			expect(res.ok).toBe(false);
			const body = await json<{ error: string }>(res);
			expect(body.error).toBe("approval_expired");
		} finally {
			vi.useRealTimers();
		}
	});
});

// ================================================================
// C. /device/code endpoint
// ================================================================

describe("/device/code endpoint", () => {
	it("returns valid RFC 8628 response shape", async () => {
		const { hostId, hostKeypair } = await setupAgent();

		// Register a fresh pending agent under the same host
		const agentKeypair2 = await generateTestKeypair();
		const { agentId: pendingAgentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair: agentKeypair2,
			hostId,
			capabilities: ["check_balance", "transfer"],
		});

		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			issuer: hostId,
			typ: "host+jwt",
			audience: BASE,
		});

		const res = await client.api("/device/code", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: pendingAgentId }),
		});

		expect(res.ok).toBe(true);
		const body = await json<Record<string, unknown>>(res);
		expect(body).toHaveProperty("device_code");
		expect(body).toHaveProperty("user_code");
		expect(body).toHaveProperty("verification_uri");
		expect(body).toHaveProperty("verification_uri_complete");
		expect(body).toHaveProperty("expires_in");
		expect(body).toHaveProperty("interval");
		expect(typeof body.device_code).toBe("string");
		expect(typeof body.user_code).toBe("string");
	});

	it("user_code from /device/code can approve the agent", async () => {
		const { hostId, hostKeypair } = await setupAgent();

		const agentKeypair = await generateTestKeypair();
		const { agentId } = await client.registerAgentViaHost({
			hostKeypair,
			agentKeypair,
			hostId,
			capabilities: ["check_balance", "transfer"],
		});

		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			issuer: hostId,
			typ: "host+jwt",
			audience: BASE,
		});

		const codeRes = await client.api("/device/code", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: agentId }),
		});
		expect(codeRes.ok).toBe(true);
		const { user_code } = await json<{ user_code: string }>(codeRes);

		const approveRes = await client.authedPost(
			"/agent/approve-capability",
			{ agent_id: agentId, action: "approve", user_code },
			sessionCookie,
		);

		expect(approveRes.ok).toBe(true);
		const body = await json<{ status: string }>(approveRes);
		expect(body.status).toBe("approved");
	});

	it("rejects non-pending agent", async () => {
		const { agentId, userCode, hostId, hostKeypair } = await setupAgent();

		await client.authedPost(
			"/agent/approve-capability",
			{ agent_id: agentId, action: "approve", user_code: userCode },
			sessionCookie,
		);

		const hostJWT = await signTestJWT({
			privateKey: hostKeypair.privateKey,
			subject: hostId,
			issuer: hostId,
			typ: "host+jwt",
			audience: BASE,
		});

		const res = await client.api("/device/code", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: agentId }),
		});

		const body = await json<{ error: string }>(res);
		expect(body.error).toBe("invalid_request");
	});

	it("rejects agent from wrong host", async () => {
		const { agentId } = await setupAgent();

		const wrongHostKeypair = await generateTestKeypair();
		const createRes = await client.authedPost(
			"/host/create",
			{
				name: "Wrong Host",
				public_key: wrongHostKeypair.publicKey,
				default_capabilities: [],
			},
			sessionCookie,
		);
		const { hostId: wrongHostId } = await json<{ hostId: string }>(createRes);

		const hostJWT = await signTestJWT({
			privateKey: wrongHostKeypair.privateKey,
			subject: wrongHostId,
			issuer: wrongHostId,
			typ: "host+jwt",
			audience: BASE,
		});

		const res = await client.api("/device/code", {
			method: "POST",
			headers: { authorization: `Bearer ${hostJWT}` },
			body: JSON.stringify({ agent_id: agentId }),
		});

		expect(res.ok).toBe(false);
		expect(res.status).toBe(403);
	});
});

// ================================================================
// D. device_code consistency
// ================================================================

describe("device_code consistency", () => {
	it("device_code from registration is the approval request ID", async () => {
		const { body } = await setupAgent();
		const approval = body.approval as Record<string, unknown>;

		expect(approval.device_code).toBeDefined();
		expect(typeof approval.device_code).toBe("string");
		// device_code should NOT equal agent_id (it's the approval request ID)
		expect(approval.device_code).not.toBe(body.agent_id);
	});
});
