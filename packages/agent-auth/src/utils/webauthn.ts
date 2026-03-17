import {
	type AuthenticationResponseJSON,
	type AuthenticatorTransportFuture,
	generateAuthenticationOptions,
	type PublicKeyCredentialDescriptorJSON,
	type VerifiedAuthenticationResponse,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { ResolvedProofOfPresence } from "../types";

export type { AuthenticationResponseJSON };

/**
 * Shape of a stored passkey record from Better Auth's passkey table.
 *
 * We only need the fields required for WebAuthn authentication —
 * not the full passkey plugin schema.
 */
export interface StoredPasskey {
	counter: number;
	credentialID: string;
	id: string;
	publicKey: string;
	transports?: string | null;
}

/**
 * Generate WebAuthn authentication options for the approval challenge.
 *
 * The returned options should be sent to the browser which calls
 * `navigator.credentials.get()` (or `@simplewebauthn/browser`'s
 * `startAuthentication`).
 */
export async function generateApprovalChallenge(
	config: ResolvedProofOfPresence,
	passkeys: StoredPasskey[]
): Promise<{
	options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
}> {
	const allowCredentials: PublicKeyCredentialDescriptorJSON[] = passkeys.map(
		(pk) => ({
			id: pk.credentialID,
			type: "public-key" as const,
			...(pk.transports
				? {
						transports: pk.transports.split(
							","
						) as AuthenticatorTransportFuture[],
					}
				: {}),
		})
	);

	const options = await generateAuthenticationOptions({
		rpID: config.rpId,
		allowCredentials,
		userVerification: "required",
	});

	return { options };
}

/**
 * Verify a WebAuthn authentication response against a stored passkey.
 */
export async function verifyApprovalResponse(
	config: ResolvedProofOfPresence,
	response: AuthenticationResponseJSON,
	expectedChallenge: string,
	passkey: StoredPasskey
): Promise<VerifiedAuthenticationResponse> {
	const publicKeyBytes = base64UrlToUint8Array(passkey.publicKey);

	return verifyAuthenticationResponse({
		response,
		expectedChallenge,
		expectedOrigin: config.origin,
		expectedRPID: config.rpId,
		credential: {
			id: passkey.credentialID,
			publicKey: publicKeyBytes,
			counter: passkey.counter,
		},
	});
}

function base64UrlToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
	const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
	const pad = base64.length % 4;
	const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
	const binary = atob(padded);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
