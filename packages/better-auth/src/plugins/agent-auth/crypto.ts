import { generateId } from "@better-auth/core/utils/id";
import type { JWK, JWTPayload } from "jose";
import {
	exportJWK,
	generateKeyPair,
	importJWK,
	jwtVerify,
	SignJWT,
} from "jose";

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

export interface SignAgentJWTOptions {
	agentId: string;
	privateKey: AgentJWK;
	expiresIn?: number;
	format?: "simple" | "aap";
	additionalClaims?: Record<string, string | number | boolean>;
}

/**
 * Sign a short-lived JWT with the agent's Ed25519 private key.
 * Encapsulates the simple vs AAP claim format logic.
 */
export async function signAgentJWT(options: SignAgentJWTOptions) {
	const {
		agentId,
		privateKey,
		expiresIn = 60,
		format = "simple",
		additionalClaims,
	} = options;

	const key = await importJWK(privateKey, "EdDSA");
	const now = Math.floor(Date.now() / 1000);

	return await new SignJWT({
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
	})
		.setProtectedHeader({
			alg: "EdDSA",
			kid: privateKey.kid as string | undefined,
		})
		.setSubject(agentId)
		.setIssuedAt(now)
		.setExpirationTime(now + expiresIn)
		.setJti(generateId(24))
		.sign(key);
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
