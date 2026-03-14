import { describe, expect, it, beforeAll } from "vitest";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { passkey as _passkey } from "@better-auth/passkey";
import { agentAuth as _agentAuth } from "../index";
import { agentAuthClient } from "../client";
import type { AgentAuthOptions, AgentJWK } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentAuth = (opts?: AgentAuthOptions): any => _agentAuth(opts);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const passkey = (): any => _passkey();
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

	if (opts.issuer) builder.setIssuer(opts.issuer);
	return builder.sign(key);
}

async function createHostJWTForAgent(
	hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK },
	agentPublicKey: AgentJWK,
	hostId: string,
): Promise<string> {
	return signTestJWT({
		privateKey: hostKeypair.privateKey,
		subject: hostId,
		issuer: hostId,
		audience: BASE,
		typ: "host+jwt",
		additionalClaims: {
			host_public_key: hostKeypair.publicKey,
			agent_public_key: agentPublicKey,
		},
	});
}

async function registerAgent(opts: {
	hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	hostId: string;
	name?: string;
	capabilities?: string[];
}): Promise<string> {
	const hostJWT = await createHostJWTForAgent(
		opts.hostKeypair,
		opts.agentKeypair.publicKey,
		opts.hostId,
	);
	const res = await apiReq("/agent/register", {
		method: "POST",
		headers: { authorization: `Bearer ${hostJWT}` },
		body: JSON.stringify({
			name: opts.name ?? "Test Agent",
			capabilities: opts.capabilities,
			mode: "delegated",
		}),
	});
	expect(res.ok).toBe(true);
	const body = await json<{ agent_id: string }>(res);
	return body.agent_id;
}

const BASE = "http://localhost:3000";
const API = `${BASE}/api/auth`;

const CAPABILITIES_WITH_STRENGTH = [
	{
		name: "read_data",
		description: "Read user data",
		approvalStrength: "session" as const,
	},
	{
		name: "delete_project",
		description: "Delete a project permanently",
		approvalStrength: "webauthn" as const,
	},
	{
		name: "list_items",
		description: "List items (no strength set)",
	},
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let testUserId: string;

beforeAll(async () => {
	const t = await getTestInstance(
		{
			plugins: [
				passkey(),
				agentAuth({
					providerName: "webauthn-test",
					capabilities: CAPABILITIES_WITH_STRENGTH,
					defaultHostCapabilities: ["read_data"],
					proofOfPresence: {
						enabled: true,
						rpId: "localhost",
						origin: "http://localhost:3000",
					},
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

async function apiReq(
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
	return apiReq(path, {
		method: "POST",
		headers: { cookie: sessionCookie, ...extraHeaders },
		body: JSON.stringify(body),
	});
}

async function authedGet(
	path: string,
	extraHeaders?: Record<string, string>,
): Promise<Response> {
	return apiReq(path, {
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
	hostId: string,
): Promise<string> {
	return signTestJWT({
		privateKey: hostPrivateKey,
		subject: hostId,
		issuer: hostId,
		audience: BASE,
		typ: "host+jwt",
		capabilities: ["read_data", "delete_project"],
		additionalClaims: {
			cnf: { jwk: agentPublicKey },
			host_public_key: hostPublicKey,
		},
	} as Parameters<typeof signTestJWT>[0] & {
		additionalClaims: Record<string, unknown>;
	});
}

describe("WebAuthn Proof of Presence", () => {
	describe("Discovery", () => {
		it("includes proof_of_presence_methods in discovery document", async () => {
			const res = await apiReq("/agent-configuration", { method: "GET" });
			expect(res.ok).toBe(true);
			const body = await json<Record<string, unknown>>(res);
			expect(body.proof_of_presence_methods).toEqual(["webauthn"]);
		});
	});

	describe("Capability list", () => {
		it("includes approval_strength in capability list", async () => {
			const res = await apiReq("/capability/list", { method: "GET" });
			expect(res.ok).toBe(true);
			const body = await json<{
				capabilities: Array<Record<string, unknown>>;
			}>(res);

			const deleteProject = body.capabilities.find(
				(c) => c.name === "delete_project",
			);
			expect(deleteProject?.approval_strength).toBe("webauthn");

			const readData = body.capabilities.find(
				(c) => c.name === "read_data",
			);
			expect(readData?.approval_strength).toBe("session");

			const listItems = body.capabilities.find(
				(c) => c.name === "list_items",
			);
			expect(listItems?.approval_strength).toBeUndefined();
		});
	});

	describe("Capability describe", () => {
		it("includes approval_strength in describe response", async () => {
			const res = await apiReq(
				"/capability/describe?name=delete_project",
				{ method: "GET" },
			);
			expect(res.ok).toBe(true);
			const body = await json<Record<string, unknown>>(res);
			expect(body.approval_strength).toBe("webauthn");
		});
	});

	describe("Approval endpoint", () => {
		it("returns webauthn_not_enrolled when user has no passkeys", async () => {
			const hostKeypair = await generateTestKeypair();
			const createRes = await authedPost("/host/create", {
				name: "WebAuthn Host",
				public_key: hostKeypair.publicKey,
				default_capabilities: ["read_data"],
			});
			const { hostId } = await json<{ hostId: string }>(createRes);

			const agentKeypair = await generateTestKeypair();
			const agentId = await registerAgent({
				hostKeypair,
				agentKeypair,
				hostId,
				name: "WebAuthn Test Agent",
				capabilities: ["read_data", "delete_project"],
			});

			const approveRes = await authedPost("/agent/approve-capability", {
				agent_id: agentId,
				action: "approve",
			});
			const body = await json<{ code: string; message: string }>(
				approveRes,
			);
			expect(body.code).toBe("webauthn_not_enrolled");
			if (!approveRes.ok) {
				expect(approveRes.status).toBe(403);
			}
		});

		it("approves session-only capabilities without WebAuthn", async () => {
			const hostKeypair = await generateTestKeypair();
			const createRes = await authedPost("/host/create", {
				name: "Session-Only Host",
				public_key: hostKeypair.publicKey,
				default_capabilities: [],
			});
			const { hostId } = await json<{ hostId: string }>(createRes);

			const agentKeypair = await generateTestKeypair();
			const agentId = await registerAgent({
				hostKeypair,
				agentKeypair,
				hostId,
				name: "Session-Only Agent",
				capabilities: ["read_data"],
			});

			const approveRes = await authedPost("/agent/approve-capability", {
				agent_id: agentId,
				action: "approve",
			});

			expect(approveRes.ok).toBe(true);
			const body = await json<{
				status: string;
				added: string[];
			}>(approveRes);
			expect(body.status).toBe("approved");
			expect(body.added).toContain("read_data");
		});

		it("deny works regardless of approval strength", async () => {
			const hostKeypair = await generateTestKeypair();
			const createRes = await authedPost("/host/create", {
				name: "Deny Host",
				public_key: hostKeypair.publicKey,
				default_capabilities: ["read_data"],
			});
			const { hostId } = await json<{ hostId: string }>(createRes);

			const agentKeypair = await generateTestKeypair();
			const agentId = await registerAgent({
				hostKeypair,
				agentKeypair,
				hostId,
				name: "Deny Agent",
				capabilities: ["delete_project"],
			});

			const denyRes = await authedPost("/agent/approve-capability", {
				agent_id: agentId,
				action: "deny",
			});

			expect(denyRes.ok).toBe(true);
			const body = await json<{ status: string }>(denyRes);
			expect(body.status).toBe("denied");
		});
	});
});
