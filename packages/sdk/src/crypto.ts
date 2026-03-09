import {
	calculateJwkThumbprint,
	exportJWK,
	generateKeyPair,
	importJWK,
	SignJWT,
} from "jose";
import type { AgentJWK, Keypair } from "./types";

const CRV_TO_ALG: Record<string, string> = {
	Ed25519: "EdDSA",
	Ed448: "EdDSA",
	"P-256": "ES256",
	"P-384": "ES384",
	"P-521": "ES512",
};

function resolveAlgorithm(key: AgentJWK): string {
	if (key.crv && CRV_TO_ALG[key.crv]) return CRV_TO_ALG[key.crv];
	if (key.kty === "OKP") return "EdDSA";
	if (key.kty === "RSA") return "RS256";
	return "EdDSA";
}

export async function generateKeypair(): Promise<Keypair> {
	const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
		crv: "Ed25519",
		extractable: true,
	});
	const pubJWK = await exportJWK(publicKey);
	const privJWK = await exportJWK(privateKey);
	const kid = await calculateJwkThumbprint(pubJWK, "sha256");
	pubJWK.kid = kid;
	privJWK.kid = kid;
	return {
		publicKey: pubJWK as AgentJWK,
		privateKey: privJWK as AgentJWK,
	};
}

export interface SignHostJWTOptions {
	hostKeypair: Keypair;
	/**
	 * JWT `sub` claim. Defaults to the public key's `kid` (JWK thumbprint),
	 * which is the recommended value — it's deterministic, derived from
	 * the key itself, and requires no server-assigned ID.
	 */
	subject?: string;
	/** JWT `aud` claim — the server's issuer URL. */
	audience: string;
	/** Agent's public key to embed in the host JWT for registration. */
	agentPublicKey?: AgentJWK;
	/** Host name to include in the JWT. */
	hostName?: string;
	/** Expiry in seconds. @default 60 */
	expiresInSeconds?: number;
}

/**
 * Sign a host JWT per §5.2.
 * Uses the JWK thumbprint as the `sub` claim by default.
 * Includes `host_public_key` and optionally `agent_public_key` for registration.
 */
export async function signHostJWT(opts: SignHostJWTOptions): Promise<string> {
	const alg = resolveAlgorithm(opts.hostKeypair.privateKey);
	const key = await importJWK(opts.hostKeypair.privateKey, alg);
	const kid = opts.hostKeypair.publicKey.kid;
	const sub = opts.subject ?? kid ?? await calculateJwkThumbprint(
		opts.hostKeypair.publicKey,
		"sha256",
	);

	const claims: Record<string, unknown> = {
		host_public_key: opts.hostKeypair.publicKey,
	};

	if (opts.agentPublicKey) {
		claims.agent_public_key = opts.agentPublicKey;
	}
	if (opts.hostName) {
		claims.host_name = opts.hostName;
	}

	return new SignJWT(claims)
		.setProtectedHeader({ alg, ...(kid ? { kid } : {}) })
		.setSubject(sub)
		.setAudience(opts.audience)
		.setIssuedAt()
		.setExpirationTime(`${opts.expiresInSeconds ?? 60}s`)
		.setJti(globalThis.crypto.randomUUID())
		.sign(key);
}

export interface SignAgentJWTOptions {
	agentKeypair: Keypair;
	/** JWT `sub` claim — the agent's ID. */
	agentId: string;
	/** JWT `aud` claim — the server's issuer URL. */
	audience: string;
	/** Restrict this JWT to specific capabilities. */
	capabilities?: string[];
	/** HTTP method for DPoP request binding (§5.3). */
	htm?: string;
	/** HTTP target URI for DPoP request binding (§5.3). */
	htu?: string;
	/** Access token hash for DPoP request binding (§5.3). */
	ath?: string;
	/** Expiry in seconds. @default 60 */
	expiresInSeconds?: number;
}

/**
 * Sign an agent JWT per §5.3.
 * Short-lived, one-per-request token for capability execution.
 */
export async function signAgentJWT(opts: SignAgentJWTOptions): Promise<string> {
	const alg = resolveAlgorithm(opts.agentKeypair.privateKey);
	const key = await importJWK(opts.agentKeypair.privateKey, alg);
	const kid = opts.agentKeypair.publicKey.kid;

	const claims: Record<string, unknown> = {};
	if (opts.capabilities && opts.capabilities.length > 0) {
		claims.capabilities = opts.capabilities;
	}
	if (opts.htm) claims.htm = opts.htm;
	if (opts.htu) claims.htu = opts.htu;
	if (opts.ath) claims.ath = opts.ath;

	return new SignJWT(claims)
		.setProtectedHeader({ alg, ...(kid ? { kid } : {}) })
		.setSubject(opts.agentId)
		.setAudience(opts.audience)
		.setIssuedAt()
		.setExpirationTime(`${opts.expiresInSeconds ?? 60}s`)
		.setJti(globalThis.crypto.randomUUID())
		.sign(key);
}
