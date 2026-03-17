import { describe, expect, it, beforeAll } from "vitest";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { agentAuth as _agentAuth } from "../index";
import { agentAuthClient } from "../client";
import type { AgentAuthOptions, AgentJWK } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentAuth = (opts?: AgentAuthOptions): any => _agentAuth(opts);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentAuthClientPlugin = (): any => agentAuthClient();

const BASE = "http://localhost:3000";
const API = `${BASE}/api/auth`;

const TEST_CAPABILITIES = [
	{ name: "check_balance", description: "Check account balance" },
	{ name: "transfer", description: "Transfer money" },
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
	additionalClaims?: Record<string, unknown>;
}): Promise<string> {
	const key = await importJWK(opts.privateKey, "EdDSA");
	const builder = new SignJWT({
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

async function json<T = unknown>(res: Response): Promise<T> {
	return res.json() as Promise<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let hostId: string;
let hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };

function apiCall(path: string, init?: RequestInit): Promise<Response> {
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
	return apiCall(path, {
		method: "POST",
		headers: { cookie: sessionCookie, ...extraHeaders },
		body: JSON.stringify(body),
	});
}

beforeAll(async () => {
	const t = await getTestInstance(
		{
			plugins: [
				agentAuth({
					providerName: "ciba-security-test",
					capabilities: TEST_CAPABILITIES,
					modes: ["delegated"],
					approvalMethods: ["ciba", "device_authorization"],
				}),
			],
		},
		{ clientOptions: { plugins: [agentAuthClientPlugin()] } },
	);
	auth = t.auth;

	const { headers } = await t.signInWithTestUser();
	sessionCookie = headers.get("cookie") ?? "";

	hostKeypair = await generateTestKeypair();
	const createRes = await authedPost("/host/create", {
		name: "CIBA Security Host",
		public_key: hostKeypair.publicKey,
		default_capabilities: ["check_balance"],
	});
	const body = await json<{ hostId: string }>(createRes);
	hostId = body.hostId;
});

async function cibaAuthorize(loginHint: string, agentId?: string) {
	const hostJWT = await signTestJWT({
		privateKey: hostKeypair.privateKey,
		subject: hostId,
		issuer: hostId,
		typ: "host+jwt",
		audience: BASE,
		additionalClaims: {
			host_public_key: hostKeypair.publicKey,
		},
	});
	return apiCall("/agent/ciba/authorize", {
		method: "POST",
		headers: { authorization: `Bearer ${hostJWT}` },
		body: JSON.stringify({
			login_hint: loginHint,
			...(agentId ? { agent_id: agentId } : {}),
		}),
	});
}

async function registerPendingAgent(): Promise<string> {
	const agentKeypair = await generateTestKeypair();
	const hostJWT = await signTestJWT({
		privateKey: hostKeypair.privateKey,
		subject: hostId,
		issuer: hostId,
		typ: "host+jwt",
		audience: BASE,
		additionalClaims: {
			host_public_key: hostKeypair.publicKey,
			agent_public_key: agentKeypair.publicKey,
		},
	});
	const res = await apiCall("/agent/register", {
		method: "POST",
		headers: { authorization: `Bearer ${hostJWT}` },
		body: JSON.stringify({
			name: "CIBA Test Agent",
			capabilities: ["check_balance", "transfer"],
			mode: "delegated",
		}),
	});
	const body = await json<{ agent_id: string }>(res);
	return body.agent_id;
}

describe("CIBA login_hint user enumeration prevention", () => {
	it("returns 200 with auth_req_id for existing user", async () => {
		const res = await cibaAuthorize("test@test.com");

		expect(res.status).toBe(200);
		const body = await json<Record<string, unknown>>(res);
		expect(body).toHaveProperty("auth_req_id");
		expect(body).toHaveProperty("expires_in");
		expect(body).toHaveProperty("interval");
	});

	it("returns 200 with identical shape for non-existing user", async () => {
		const res = await cibaAuthorize("nonexistent@example.com");

		expect(res.status).toBe(200);
		const body = await json<Record<string, unknown>>(res);
		expect(body).toHaveProperty("auth_req_id");
		expect(body.expires_in).toBe(300);
		expect(body.interval).toBe(5);
	});

	it("does not include error fields in either response", async () => {
		const realRes = await cibaAuthorize("test@test.com");
		const fakeRes = await cibaAuthorize("nonexistent@example.com");

		const realBody = await json<Record<string, unknown>>(realRes);
		const fakeBody = await json<Record<string, unknown>>(fakeRes);

		expect(realBody).not.toHaveProperty("error");
		expect(realBody).not.toHaveProperty("message");
		expect(fakeBody).not.toHaveProperty("error");
		expect(fakeBody).not.toHaveProperty("message");
	});

	it("real auth_req_id resolves via approve-capability", async () => {
		const agentId = await registerPendingAgent();

		const cibaRes = await cibaAuthorize("test@test.com", agentId);
		const { auth_req_id } = await json<{ auth_req_id: string }>(cibaRes);

		const approveRes = await authedPost("/agent/approve-capability", {
			approval_id: auth_req_id,
			action: "approve",
		});

		expect(approveRes.ok).toBe(true);
		const body = await json<{ status: string }>(approveRes);
		expect(body.status).toBe("approved");
	});

	it("fake auth_req_id cannot be resolved via approve-capability", async () => {
		const cibaRes = await cibaAuthorize("nonexistent@example.com");
		const { auth_req_id } = await json<{ auth_req_id: string }>(cibaRes);

		const approveRes = await authedPost("/agent/approve-capability", {
			approval_id: auth_req_id,
			action: "approve",
		});

		expect(approveRes.ok).toBe(false);
		expect(approveRes.status).toBe(404);
	});
});
