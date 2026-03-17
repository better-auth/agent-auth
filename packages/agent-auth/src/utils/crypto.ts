import {
	exportJWK,
	generateKeyPair,
	importJWK,
	errors as joseErrors,
	jwtVerify,
	SignJWT,
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
	const crvAlg = key.crv ? CRV_TO_ALG[key.crv] : undefined;
	if (crvAlg) {
		return crvAlg;
	}
	if (key.kty === "OKP") {
		return "EdDSA";
	}
	if (key.kty === "RSA") {
		return "RS256";
	}
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

/** Base64url-encode a Uint8Array without padding. */
function base64url(bytes: Uint8Array): string {
	const lookup =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	let result = "";
	const len = bytes.length;
	for (let i = 0; i < len; i += 3) {
		const b0 = bytes[i]!;
		const b1 = i + 1 < len ? bytes[i + 1]! : 0;
		const b2 = i + 2 < len ? bytes[i + 2]! : 0;
		result += lookup[b0 >> 2];
		result += lookup[((b0 & 0x03) << 4) | (b1 >> 4)];
		if (i + 1 < len) {
			result += lookup[((b1 & 0x0f) << 2) | (b2 >> 6)];
		}
		if (i + 2 < len) {
			result += lookup[b2 & 0x3f];
		}
	}
	return result;
}

/** SHA-256 hash of a request body, base64url-encoded (for DPoP `ath`). */
export async function hashRequestBody(body: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(body)
	);
	return base64url(new Uint8Array(digest));
}

export interface SignAgentJWTOptions {
	/** Additional claims. */
	additionalClaims?: Record<string, unknown>;
	ath?: string;
	/** JWT `aud` claim — the server's issuer URL. */
	audience: string;
	/** Optional capabilities to restrict this JWT to (§5.3). */
	capabilities?: string[];
	/** Expiry in seconds from now. @default 60 */
	expiresInSeconds?: number;
	/** Optional DPoP-style claims. */
	htm?: string;
	htu?: string;
	/** JWT `iss` claim — required for host JWTs (§4.2). */
	issuer?: string;
	privateKey: AgentJWK;
	/** JWT `sub` claim. */
	subject: string;
	/** JWT `typ` header (§4.2/§4.5). @default "agent+jwt" */
	typ?: "host+jwt" | "agent+jwt";
}

/** Sign a short-lived JWT with the given private key (§5.2 / §5.3). */
export async function signAgentJWT(opts: SignAgentJWTOptions): Promise<string> {
	const alg = resolveAlgorithm(opts.privateKey);
	const key = await importJWK(opts.privateKey, alg);
	const builder = new SignJWT({
		...(opts.capabilities ? { capabilities: opts.capabilities } : {}),
		...(opts.htm ? { htm: opts.htm } : {}),
		...(opts.htu ? { htu: opts.htu } : {}),
		...(opts.ath ? { ath: opts.ath } : {}),
		...opts.additionalClaims,
	})
		.setProtectedHeader({ alg, typ: opts.typ ?? "agent+jwt" })
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

export interface VerifyJWTOptions {
	jwt: string;
	/** Maximum acceptable age in seconds. */
	maxAge: number;
	publicKey: AgentJWK;
}

/**
 * Verify a JWT against a public key and return the payload,
 * or `null` if verification fails for a legitimate JOSE reason.
 *
 * The algorithm is always derived from the key, never from the
 * JWT header, to prevent algorithm confusion attacks (§5.1).
 */
export async function verifyJWT(
	opts: VerifyJWTOptions
): Promise<Record<string, unknown> | null> {
	try {
		const alg = resolveAlgorithm(opts.publicKey);
		const key = await importJWK(opts.publicKey, alg);
		const { payload } = await jwtVerify(opts.jwt, key, {
			maxTokenAge: `${opts.maxAge}s`,
			algorithms: [alg],
		});
		return payload as Record<string, unknown>;
	} catch (err) {
		if (err instanceof joseErrors.JOSEError) {
			return null;
		}
		throw err;
	}
}

/** @deprecated Use `VerifyJWTOptions` instead. */
export type VerifyAgentJWTOptions = VerifyJWTOptions;

/** @deprecated Use `verifyJWT` instead. */
export const verifyAgentJWT = verifyJWT;
