/** Generate an 8-character user code for device authorization (§9.1). */
export function generateUserCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const len = chars.length; // 31
	const limit = 256 - (256 % len); // rejection threshold
	let code = "";
	while (code.length < 8) {
		const bytes = new Uint8Array(16);
		globalThis.crypto.getRandomValues(bytes);
		for (const byte of bytes) {
			if (byte >= limit) continue;
			code += chars[byte % len];
			if (code.length === 8) break;
		}
	}
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Base64url-encode a Uint8Array without padding. */
function base64url(bytes: Uint8Array): string {
	const lookup = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	let result = "";
	const len = bytes.length;
	for (let i = 0; i < len; i += 3) {
		const b0 = bytes[i];
		const b1 = i + 1 < len ? bytes[i + 1] : 0;
		const b2 = i + 2 < len ? bytes[i + 2] : 0;
		result += lookup[b0 >> 2];
		result += lookup[((b0 & 0x03) << 4) | (b1 >> 4)];
		if (i + 1 < len) result += lookup[((b1 & 0x0f) << 2) | (b2 >> 6)];
		if (i + 2 < len) result += lookup[b2 & 0x3f];
	}
	return result;
}

/** Generate a cryptographically random enrollment token and its SHA-256 hash. */
export async function generateEnrollmentToken(): Promise<{
	plaintext: string;
	hash: string;
}> {
	const bytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(bytes);
	const plaintext = base64url(bytes);

	const hash = await hashToken(plaintext);
	return { plaintext, hash };
}

/** SHA-256 hash a token string, base64url-encoded. */
export async function hashToken(token: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return base64url(new Uint8Array(digest));
}
