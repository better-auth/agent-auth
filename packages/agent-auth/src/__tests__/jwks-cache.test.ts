import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryJwksCache } from "../utils/jwks-cache";

const VALID_JWKS_URL = "https://example.com/.well-known/jwks.json";
const TEST_KEY = {
	kty: "OKP",
	crv: "Ed25519",
	x: "test-x-coordinate",
	kid: "key-1",
};
const VALID_JWKS_RESPONSE = JSON.stringify({ keys: [TEST_KEY] });

describe("MemoryJwksCache — URL validation", () => {
	const cache = new MemoryJwksCache();

	it("rejects non-HTTPS URLs", async () => {
		const result = await cache.getKeyByKid("http://example.com/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects localhost", async () => {
		const result = await cache.getKeyByKid("https://localhost/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects 127.0.0.1", async () => {
		const result = await cache.getKeyByKid("https://127.0.0.1/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects ::1", async () => {
		const result = await cache.getKeyByKid("https://[::1]/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects 0.0.0.0", async () => {
		const result = await cache.getKeyByKid("https://0.0.0.0/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects 10.x private range", async () => {
		const result = await cache.getKeyByKid("https://10.0.0.1/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects 172.16-31.x private range", async () => {
		const result = await cache.getKeyByKid("https://172.16.0.1/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects 192.168.x private range", async () => {
		const result = await cache.getKeyByKid("https://192.168.1.1/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects .local domains", async () => {
		const result = await cache.getKeyByKid("https://myhost.local/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects .internal domains", async () => {
		const result = await cache.getKeyByKid("https://service.internal/jwks", "kid");
		expect(result).toBeNull();
	});

	// Phase 1.8 fix: link-local IP blocking
	it("rejects 169.254.x.x link-local addresses", async () => {
		const result = await cache.getKeyByKid("https://169.254.169.254/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects IPv6 link-local (fe80::)", async () => {
		const result = await cache.getKeyByKid("https://[fe80::1]/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects IPv6 unique-local (fc00::)", async () => {
		const result = await cache.getKeyByKid("https://[fc00::1]/jwks", "kid");
		expect(result).toBeNull();
	});

	it("rejects IPv6 unique-local (fd00::)", async () => {
		const result = await cache.getKeyByKid("https://[fd00::1]/jwks", "kid");
		expect(result).toBeNull();
	});
});

describe("MemoryJwksCache — fetch behavior", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns key when JWKS is valid", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(VALID_JWKS_RESPONSE, {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const cache = new MemoryJwksCache();
		const key = await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		expect(key).toEqual(TEST_KEY);
	});

	it("returns null on non-200 response", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response("not found", { status: 404 }),
		);

		const cache = new MemoryJwksCache();
		const key = await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		expect(key).toBeNull();
	});

	it("returns null when Content-Length exceeds 1MB", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(VALID_JWKS_RESPONSE, {
				status: 200,
				headers: { "Content-Length": "2000000" },
			}),
		);

		const cache = new MemoryJwksCache();
		const key = await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		expect(key).toBeNull();
	});

	it("returns null on fetch timeout/error", async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

		const cache = new MemoryJwksCache();
		const key = await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		expect(key).toBeNull();
	});

	it("returns null for kid not in JWKS", async () => {
		// First call returns cached, second call re-fetches
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(VALID_JWKS_RESPONSE, { status: 200 }),
		);

		const cache = new MemoryJwksCache();
		const key = await cache.getKeyByKid(VALID_JWKS_URL, "nonexistent-kid");
		expect(key).toBeNull();
	});
});

describe("MemoryJwksCache — caching behavior", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		vi.useFakeTimers();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	it("caches JWKS for TTL duration", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(VALID_JWKS_RESPONSE, { status: 200 }),
		);
		globalThis.fetch = fetchMock;

		const cache = new MemoryJwksCache(60_000);

		await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		const callCount = fetchMock.mock.calls.length;

		// Second call within TTL should use cache
		await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		expect(fetchMock.mock.calls.length).toBe(callCount);
	});

	it("re-fetches after TTL expires", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(VALID_JWKS_RESPONSE, { status: 200 }),
		);
		globalThis.fetch = fetchMock;

		const cache = new MemoryJwksCache(60_000);

		await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		const callsAfterFirst = fetchMock.mock.calls.length;

		vi.advanceTimersByTime(61_000);

		await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
	});

	it("clear removes all cached entries", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(VALID_JWKS_RESPONSE, { status: 200 }),
		);
		globalThis.fetch = fetchMock;

		const cache = new MemoryJwksCache();
		await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		const callsAfterFirst = fetchMock.mock.calls.length;

		cache.clear();

		await cache.getKeyByKid(VALID_JWKS_URL, "key-1");
		expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
	});
});
