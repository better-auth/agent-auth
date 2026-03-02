import type { JWK } from "jose";

interface CachedJWKS {
	keys: JWK[];
	fetchedAt: number;
}

/**
 * In-memory JWKS URL cache with configurable TTL.
 * Fetches and caches JSON Web Key Sets from remote URLs.
 * Re-fetches on kid miss (key rotation) and enforces
 * §9.12 URL fetch protections (timeouts, size limits, HTTPS).
 */
export class JWKSCache {
	private cache = new Map<string, CachedJWKS>();
	private ttlMs: number;
	private maxResponseBytes: number;
	private fetchTimeoutMs: number;

	constructor(opts?: {
		ttlMs?: number;
		maxResponseBytes?: number;
		fetchTimeoutMs?: number;
	}) {
		this.ttlMs = opts?.ttlMs ?? 5 * 60 * 1000;
		this.maxResponseBytes = opts?.maxResponseBytes ?? 1_048_576;
		this.fetchTimeoutMs = opts?.fetchTimeoutMs ?? 5000;
	}

	/**
	 * Look up a key by `kid` from a JWKS URL.
	 * Uses cached keys if fresh; re-fetches on miss or stale cache.
	 */
	async getKeyByKid(jwksUrl: string, kid: string): Promise<JWK | null> {
		const cached = this.cache.get(jwksUrl);
		if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
			const key = cached.keys.find((k) => k.kid === kid);
			if (key) return key;
		}

		const keys = await this.fetchJWKS(jwksUrl);
		if (!keys) return null;

		this.cache.set(jwksUrl, { keys, fetchedAt: Date.now() });
		return keys.find((k) => k.kid === kid) ?? null;
	}

	private async fetchJWKS(url: string): Promise<JWK[] | null> {
		try {
			if (!url.startsWith("https://")) return null;

			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

			try {
				const response = await fetch(url, {
					signal: controller.signal,
					headers: { Accept: "application/json" },
					redirect: "follow",
				});

				if (!response.ok) return null;

				const contentLength = response.headers.get("content-length");
				if (contentLength && Number(contentLength) > this.maxResponseBytes) {
					return null;
				}

				const text = await response.text();
				if (text.length > this.maxResponseBytes) return null;

				const jwks = JSON.parse(text) as { keys?: JWK[] };
				if (!jwks.keys || !Array.isArray(jwks.keys)) return null;
				return jwks.keys;
			} finally {
				clearTimeout(timeout);
			}
		} catch {
			return null;
		}
	}

	clear() {
		this.cache.clear();
	}
}
