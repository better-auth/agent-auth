/**
 * In-memory JTI replay cache with TTL-based eviction.
 * Prevents JWT replay attacks within the token's max age window (§15.5, §9.4).
 */
export class JtiReplayCache {
	private cache = new Map<string, number>();
	private lastCleanup = Date.now();
	private cleanupIntervalMs: number;

	constructor(cleanupIntervalMs = 60_000) {
		this.cleanupIntervalMs = cleanupIntervalMs;
	}

	/**
	 * Returns true if the JTI has been seen before and hasn't expired.
	 */
	has(jti: string): boolean {
		this.maybeCleanup();
		const expiresAt = this.cache.get(jti);
		if (expiresAt === undefined) return false;
		if (Date.now() > expiresAt) {
			this.cache.delete(jti);
			return false;
		}
		return true;
	}

	/**
	 * Record a JTI as seen. It will be retained for at least `maxAgeSeconds`.
	 */
	add(jti: string, maxAgeSeconds: number): void {
		this.cache.set(jti, Date.now() + maxAgeSeconds * 1000);
	}

	get size(): number {
		return this.cache.size;
	}

	private maybeCleanup() {
		const now = Date.now();
		if (now - this.lastCleanup < this.cleanupIntervalMs) return;
		this.lastCleanup = now;
		for (const [jti, expiresAt] of this.cache) {
			if (now > expiresAt) this.cache.delete(jti);
		}
	}
}
