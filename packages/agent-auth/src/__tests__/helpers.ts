import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { agentAuthClient } from "../client";
import { agentAuth as _agentAuth } from "../index";
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
	hostId?: string
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
	}
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

export function createTestClient(
	authHandler: (req: Request) => Promise<Response>
) {
	function api(path: string, init?: RequestInit): Promise<Response> {
		return authHandler(
			new Request(`${API}${path}`, {
				...init,
				headers: {
					"content-type": "application/json",
					...(init?.headers as Record<string, string> | undefined),
				},
			})
		);
	}

	function authedPost(
		path: string,
		body: unknown,
		cookie: string,
		extraHeaders?: Record<string, string>
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
		extraHeaders?: Record<string, string>
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
			opts.hostId
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
