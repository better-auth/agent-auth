import type { JWK, JWTPayload } from "jose";
import {
	exportJWK,
	generateKeyPair,
	importJWK,
	jwtVerify,
	SignJWT,
} from "jose";

/**
 * Generate a random alphanumeric ID of the given length.
 * Uses Web Crypto (works in Node, Deno, browsers, workers).
 */
function generateId(length: number): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const bytes = new Uint8Array(length);
	globalThis.crypto.getRandomValues(bytes);
	let result = "";
	for (const byte of bytes) {
		result += chars[byte % chars.length];
	}
	return result;
}

/**
 * JSON Web Key with an index signature for zod/record compatibility.
 * Extends jose's `JWK` — all named fields come from the standard library.
 */
export interface AgentJWK extends JWK {
	[key: string]: string | string[] | boolean | undefined;
}

/**
 * Generate an Ed25519 keypair and export as JWK.
 * Adds a unique `kid` to both keys.
 * The private key should never be sent to or stored on any server.
 */
export async function generateAgentKeypair(): Promise<{
	publicKey: AgentJWK;
	privateKey: AgentJWK;
	kid: string;
}> {
	const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
		crv: "Ed25519",
		extractable: true,
	});

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);

	const kid = `agt_key_${generateId(16)}`;
	publicWebKey.kid = kid;
	privateWebKey.kid = kid;

	return {
		publicKey: { ...publicWebKey } as AgentJWK,
		privateKey: { ...privateWebKey } as AgentJWK,
		kid,
	};
}

export interface RequestBinding {
	/** HTTP method (e.g. "POST"). Maps to DPoP `htm` claim. */
	method: string;
	/** Request path (e.g. "/api/emails/send"). Maps to DPoP `htu` claim. */
	path: string;
	/** SHA-256 hash of the request body. Maps to DPoP `ath` claim. Omit for bodyless requests. */
	bodyHash?: string;
}

export interface SignAgentJWTOptions {
	agentId: string;
	privateKey: AgentJWK;
	/** The server's issuer URL (origin). Required per §3.2. */
	audience?: string;
	expiresIn?: number;
	format?: "simple" | "aap";
	additionalClaims?: Record<string, unknown>;
	/** Bind this JWT to a specific HTTP request (DPoP-style). */
	requestBinding?: RequestBinding;
}

/**
 * Compute a SHA-256 hash of a request body for request binding.
 * Returns a base64url-encoded digest.
 */
export async function hashRequestBody(
	body: string | Uint8Array,
): Promise<string> {
	const data = typeof body === "string" ? new TextEncoder().encode(body) : body;
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		data.buffer as ArrayBuffer,
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

/**
 * Sign a short-lived JWT with the agent's Ed25519 private key.
 * Optionally binds the JWT to a specific HTTP request via DPoP-style claims.
 */
export async function signAgentJWT(options: SignAgentJWTOptions) {
	const {
		agentId,
		privateKey,
		audience,
		expiresIn = 60,
		format = "simple",
		additionalClaims,
		requestBinding,
	} = options;

	const key = await importJWK(privateKey, "EdDSA");
	const now = Math.floor(Date.now() / 1000);

	const bindingClaims: Record<string, string> = {};
	if (requestBinding) {
		bindingClaims.htm = requestBinding.method.toUpperCase();
		bindingClaims.htu = requestBinding.path;
		if (requestBinding.bodyHash) {
			bindingClaims.ath = requestBinding.bodyHash;
		}
	}

	const jwt = new SignJWT({
		...(format === "aap"
			? {
					aap_agent: {
						id: agentId,
						type: "autonomous",
						independent: true,
					},
					...additionalClaims,
				}
			: additionalClaims),
		...bindingClaims,
	})
		.setProtectedHeader({
			alg: "EdDSA",
			typ: "JWT",
			kid: privateKey.kid as string | undefined,
		})
		.setSubject(agentId)
		.setIssuedAt(now)
		.setExpirationTime(now + expiresIn)
		.setJti(generateId(24));

	if (audience) {
		jwt.setAudience(audience);
	}

	return await jwt.sign(key);
}

export interface VerifyAgentJWTOptions {
	jwt: string;
	publicKey: AgentJWK;
	maxAge?: number;
}

/**
 * Verify an agent's JWT using their stored public key.
 * Returns the decoded payload or null if verification fails.
 */
export async function verifyAgentJWT(
	options: VerifyAgentJWTOptions,
): Promise<JWTPayload | null> {
	try {
		const key = await importJWK(options.publicKey, "EdDSA");
		const { payload } = await jwtVerify(options.jwt, key, {
			maxTokenAge: `${options.maxAge ?? 120}s`,
		});
		return payload.sub ? payload : null;
	} catch {
		return null;
	}
}
