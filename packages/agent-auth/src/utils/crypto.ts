import {
	exportJWK,
	generateKeyPair,
	jwtVerify,
	SignJWT,
	importJWK,
	decodeProtectedHeader,
} from "jose";
import type { AgentJWK } from "../types";

const CRV_TO_ALG: Record<string, string> = {
	Ed25519: "EdDSA",
	Ed448: "EdDSA",
	"P-256": "ES256",
	"P-384": "ES384",
	"P-521": "ES512",
};

/** Derive the JWA algorithm identifier from a JWK's `crv` or `kty`. */
function resolveAlgorithm(key: AgentJWK): string {
	if (key.crv && CRV_TO_ALG[key.crv]) return CRV_TO_ALG[key.crv];
	if (key.kty === "OKP") return "EdDSA";
	if (key.kty === "RSA") return "RS256";
	return "EdDSA";
}

/** Generate an Ed25519 keypair and return both keys as JWK objects. */
export async function generateAgentKeypair(): Promise<{
	publicKey: AgentJWK;
	privateKey: AgentJWK;
}> {
	const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
		crv: "Ed25519",
	});
	const pubJWK = await exportJWK(publicKey);
	const privJWK = await exportJWK(privateKey);
	return {
		publicKey: pubJWK as AgentJWK,
		privateKey: privJWK as AgentJWK,
	};
}

/** SHA-256 hash of a request body, base64url-encoded (for DPoP `ath`). */
export async function hashRequestBody(body: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(body),
	);
	const bytes = new Uint8Array(digest);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export interface SignAgentJWTOptions {
	privateKey: AgentJWK;
	/** JWT `sub` claim. */
	subject: string;
	/** JWT `aud` claim — the server's issuer URL. */
	audience: string;
	/** Expiry in seconds from now. @default 60 */
	expiresInSeconds?: number;
	/** Optional capability IDs to restrict this JWT to (§5.3). */
	capabilityIds?: string[];
	/** Optional DPoP-style claims. */
	htm?: string;
	htu?: string;
	ath?: string;
	/** Additional claims. */
	additionalClaims?: Record<string, unknown>;
}

/** Sign a short-lived JWT with the given private key (§5.2 / §5.3). */
export async function signAgentJWT(
	opts: SignAgentJWTOptions,
): Promise<string> {
	const alg = resolveAlgorithm(opts.privateKey);
	const key = await importJWK(opts.privateKey, alg);
	const builder = new SignJWT({
		...(opts.capabilityIds ? { capability_ids: opts.capabilityIds } : {}),
		...(opts.htm ? { htm: opts.htm } : {}),
		...(opts.htu ? { htu: opts.htu } : {}),
		...(opts.ath ? { ath: opts.ath } : {}),
		...opts.additionalClaims,
	})
		.setProtectedHeader({ alg })
		.setSubject(opts.subject)
		.setAudience(opts.audience)
		.setIssuedAt()
		.setExpirationTime(`${opts.expiresInSeconds ?? 60}s`)
		.setJti(globalThis.crypto.randomUUID());

	return builder.sign(key);
}

export interface VerifyAgentJWTOptions {
	jwt: string;
	publicKey: AgentJWK;
	/** Maximum acceptable age in seconds. */
	maxAge: number;
}

/**
 * Verify a JWT against a public key and return the payload,
 * or `null` if verification fails.
 */
export async function verifyAgentJWT(
	opts: VerifyAgentJWTOptions,
): Promise<Record<string, unknown> | null> {
	try {
		let alg = resolveAlgorithm(opts.publicKey);
		try {
			const header = decodeProtectedHeader(opts.jwt);
			if (header.alg) alg = header.alg;
		} catch {}
		const key = await importJWK(opts.publicKey, alg);
		const { payload } = await jwtVerify(opts.jwt, key, {
			maxTokenAge: `${opts.maxAge}s`,
		});
		return payload as Record<string, unknown>;
	} catch {
		return null;
	}
}
