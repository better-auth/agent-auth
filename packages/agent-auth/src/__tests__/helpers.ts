import { getTestInstance, signInWithTestUser } from "better-auth/test";
import { exportJWK, generateKeyPair, importJWK, SignJWT, calculateJwkThumbprint } from "jose";
import { expect } from "vitest";
import { agentAuth as _agentAuth } from "../index";
import { agentAuthClient } from "../client";
import type { AgentAuthOptions, AgentJWK } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const agentAuth = (opts?: AgentAuthOptions): any => _agentAuth(opts);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const agentAuthClientPlugin = (): any => agentAuthClient();

export const BASE = "http://localhost:3000";
export const API = `${BASE}/api/auth`;

export async function generateTestKeypair(): Promise<{
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

export async function signTestJWT(opts: {
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

export async function createHostJWT(
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

export async function createAgentJWT(
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

export async function json<T = unknown>(res: Response): Promise<T> {
	return res.json() as Promise<T>;
}

export function createTestClient(authHandler: (req: Request) => Promise<Response>) {
	function api(path: string, init?: RequestInit): Promise<Response> {
		return authHandler(
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
		cookie: string,
		extraHeaders?: Record<string, string>,
	): Promise<Response> {
		return api(path, {
			method: "POST",
			headers: { cookie, ...extraHeaders },
			body: JSON.stringify(body),
		});
	}

	function authedGet(
		path: string,
		cookie: string,
		extraHeaders?: Record<string, string>,
	): Promise<Response> {
		return api(path, {
			method: "GET",
			headers: { cookie, ...extraHeaders },
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
		const body = await json<Record<string, unknown>>(res);
		if (!res.ok) {
			throw new Error(`registerAgentViaHost failed: ${JSON.stringify(body)}`);
		}
		return { agentId: body.agent_id as string, body };
	}

	return { api, authedPost, authedGet, registerAgentViaHost };
}

/**
 * Assert that a response carries a spec-compliant error body.
 * Handles Better Auth's inconsistent status propagation by checking
 * both the response status and the body's `error` field.
 */
export async function expectError(
	res: Response,
	errorCode: string,
	expectedStatus?: number,
): Promise<Record<string, unknown>> {
	const body = await json<Record<string, unknown>>(res);
	if (expectedStatus) {
		expect(res.status).toBe(expectedStatus);
	} else {
		expect(res.ok).toBe(false);
	}
	expect(body.error).toBe(errorCode);
	return body;
}

/**
 * Set up a complete test environment with signed-in user and client.
 * Reduces boilerplate in test files.
 */
export async function createTestContext(pluginOpts?: AgentAuthOptions) {
	const t = await getTestInstance(
		{
			plugins: [agentAuth(pluginOpts)],
		},
		{
			clientOptions: { plugins: [agentAuthClientPlugin()] },
		},
	);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const auth = t.auth as any;
	const client = createTestClient((req: Request) => auth.handler(req));

	const { headers } = await signInWithTestUser(t);
	const sessionCookie = headers.get("set-cookie") ?? "";
	const sessionRes = await client.api("/get-session", {
		method: "GET",
		headers: { cookie: sessionCookie },
	});
	const sessionBody = await json<Record<string, unknown>>(sessionRes);
	const userId = (sessionBody as { user?: { id?: string } }).user?.id ?? "";

	async function createHost(opts?: {
		capabilities?: string[];
		name?: string;
	}): Promise<{
		hostId: string;
		hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
	}> {
		const hostKeypair = await generateTestKeypair();
		const hostRes = await client.authedPost(
			"/host/create",
			{
				name: opts?.name ?? "Test Host",
				public_key: hostKeypair.publicKey,
				default_capabilities: opts?.capabilities ?? [],
			},
			sessionCookie,
		);
		const hostBody = await json<{ id: string }>(hostRes);
		return { hostId: hostBody.id, hostKeypair };
	}

	async function registerAgent(opts: {
		hostId: string;
		hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
		capabilities?: string[];
		name?: string;
		mode?: "delegated" | "autonomous";
	}): Promise<{
		agentId: string;
		agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
		body: Record<string, unknown>;
	}> {
		const agentKeypair = await generateTestKeypair();
		const { agentId, body } = await client.registerAgentViaHost({
			hostKeypair: opts.hostKeypair,
			agentKeypair,
			hostId: opts.hostId,
			name: opts.name,
			capabilities: opts.capabilities,
			mode: opts.mode,
		});
		return { agentId, agentKeypair, body };
	}

	return {
		auth,
		client,
		sessionCookie,
		userId,
		createHost,
		registerAgent,
	};
}

/**
 * Compute the JWK thumbprint for a public key, matching
 * how the system derives host IDs from keys.
 */
export async function computeThumbprint(publicKey: AgentJWK): Promise<string> {
	return calculateJwkThumbprint(publicKey as Parameters<typeof calculateJwkThumbprint>[0]);
}
