/** Generate an 8-character user code for device authorization (§9.1). */
export function generateUserCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const bytes = new Uint8Array(8);
	globalThis.crypto.getRandomValues(bytes);
	let code = "";
	for (const byte of bytes) {
		code += chars[byte % chars.length];
	}
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Generate a cryptographically random enrollment token and its SHA-256 hash. */
export async function generateEnrollmentToken(): Promise<{
	plaintext: string;
	hash: string;
}> {
	const bytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	const plaintext = btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	const hash = await hashToken(plaintext);
	return { plaintext, hash };
}

/** SHA-256 hash a token string, base64url-encoded. */
export async function hashToken(token: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
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
