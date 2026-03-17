import type { SecondaryStorage } from "@better-auth/core/db";
import type { AgentJWK } from "../types";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_URL_LENGTH = 2048;
const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_REDIRECTS = 3;

const BLOCKED_HOSTNAMES = new Set([
	"localhost",
	"127.0.0.1",
	"[::1]",
	"0.0.0.0",
]);

function isBlockedHostname(hostname: string): boolean {
	if (BLOCKED_HOSTNAMES.has(hostname)) return true;
	const bare = hostname.replace(/^\[|\]$/g, "");
	if (bare === "::1" || bare === "0:0:0:0:0:0:0:1") return true;
	if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname))
		return true;
	// IPv6 link-local (fe80::/10) and unique-local (fc00::/7)
	if (/^fe[89ab]/i.test(bare) || /^f[cd]/i.test(bare)) return true;
	if (hostname.endsWith(".local") || hostname.endsWith(".internal"))
		return true;
	return false;
}

export interface JwksCacheStore {
	getKeyByKid(
		jwksUrl: string,
		kid: string,
	): Promise<AgentJWK | null>;
	clear(): void | Promise<void>;
}

async function fetchKeys(url: string): Promise<AgentJWK[] | null> {
	try {
		let currentUrl = url;

		for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
			const parsed = new URL(currentUrl);
			if (parsed.protocol !== "https:") return null;
			if (isBlockedHostname(parsed.hostname)) return null;

			const controller = new AbortController();
			const timer = setTimeout(
				() => controller.abort(),
				FETCH_TIMEOUT_MS,
			);

			const res = await fetch(currentUrl, {
				signal: controller.signal,
				headers: { Accept: "application/json" },
				redirect: "manual",
			});
			clearTimeout(timer);

			if (res.status >= 300 && res.status < 400) {
				const location = res.headers.get("location");
				if (!location || redirects === MAX_REDIRECTS) return null;
				currentUrl = new URL(location, currentUrl).href;
				continue;
			}

			if (!res.ok) {
				console.error(`[agent-auth] JWKS fetch failed: ${currentUrl} responded with status ${res.status}`);
				return null;
			}

			const contentLength = res.headers.get("content-length");
			if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
				return null;
			}

			const text = await res.text();
			if (text.length > MAX_RESPONSE_BYTES) return null;

			const body = JSON.parse(text) as { keys?: AgentJWK[] };
			if (!body.keys || !Array.isArray(body.keys)) return null;

			return body.keys;
		}

		return null;
	} catch (err) {
		console.error("[agent-auth] JWKS fetch error:", err);
		return null;
	}
}

function validateUrl(url: string): boolean {
	if (url.length > MAX_URL_LENGTH || !url.startsWith("https://")) return false;
	try {
		const parsed = new URL(url);
		if (isBlockedHostname(parsed.hostname)) return false;
		return true;
	} catch {
		return false;
	}
}

export class MemoryJwksCache implements JwksCacheStore {
	private cache = new Map<string, { keys: AgentJWK[]; fetchedAt: number }>();
	private ttlMs: number;

	constructor(ttlMs = DEFAULT_TTL_MS) {
		this.ttlMs = ttlMs;
	}

	async getKeyByKid(jwksUrl: string, kid: string): Promise<AgentJWK | null> {
		if (!validateUrl(jwksUrl)) return null;

		let entry = this.cache.get(jwksUrl);
		const now = Date.now();

		if (!entry || now - entry.fetchedAt > this.ttlMs) {
			const keys = await fetchKeys(jwksUrl);
			if (!keys) return null;
			entry = { keys, fetchedAt: now };
			this.cache.set(jwksUrl, entry);
		}

		const match = entry.keys.find((k) => k.kid === kid);
		if (match) return match;

		const freshKeys = await fetchKeys(jwksUrl);
		if (!freshKeys) return null;
		entry = { keys: freshKeys, fetchedAt: Date.now() };
		this.cache.set(jwksUrl, entry);

		return entry.keys.find((k) => k.kid === kid) ?? null;
	}

	clear(): void {
		this.cache.clear();
	}
}

const JWKS_PREFIX = "agent-auth:jwks:";

export class SecondaryStorageJwksCache implements JwksCacheStore {
	private ttlSec: number;

	constructor(
		private storage: SecondaryStorage,
		ttlMs = DEFAULT_TTL_MS,
	) {
		this.ttlSec = Math.ceil(ttlMs / 1000);
	}

	async getKeyByKid(jwksUrl: string, kid: string): Promise<AgentJWK | null> {
		if (!validateUrl(jwksUrl)) return null;

		const cacheKey = `${JWKS_PREFIX}${jwksUrl}`;
		const cached = await this.storage.get(cacheKey);

		let keys: AgentJWK[] | null = null;
		if (cached) {
			try {
				keys = typeof cached === "string" ? JSON.parse(cached) as AgentJWK[] : cached as AgentJWK[] | null;
			} catch {
				keys = null;
			}
		}

		if (!keys) {
			keys = await fetchKeys(jwksUrl);
			if (!keys) return null;
			await this.storage.set(cacheKey, JSON.stringify(keys), this.ttlSec);
		}

		const match = keys.find((k) => k.kid === kid);
		if (match) return match;

		const freshKeys = await fetchKeys(jwksUrl);
		if (!freshKeys) return null;
		await this.storage.set(cacheKey, JSON.stringify(freshKeys), this.ttlSec);

		return freshKeys.find((k) => k.kid === kid) ?? null;
	}

	async clear(): Promise<void> {
		// Secondary storage doesn't support prefix deletion;
		// entries expire via TTL.
	}
}

export class JwksCacheProxy implements JwksCacheStore {
	inner: JwksCacheStore;

	constructor(ttlMs = DEFAULT_TTL_MS) {
		this.inner = new MemoryJwksCache(ttlMs);
	}

	useSecondaryStorage(storage: SecondaryStorage): void {
		if (this.inner instanceof MemoryJwksCache) {
			this.inner.clear();
		}
		this.inner = new SecondaryStorageJwksCache(storage);
	}

	getKeyByKid(jwksUrl: string, kid: string): Promise<AgentJWK | null> {
		return this.inner.getKeyByKid(jwksUrl, kid);
	}

	clear(): void | Promise<void> {
		return this.inner.clear();
	}
}
