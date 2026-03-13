const DEFAULT_TTL_MS = 120_000; // 2 minutes
const MAX_ENTRIES = 10_000;

interface CacheEntry {
	challenge: string;
	expiresAt: number;
}

/**
 * Ephemeral in-memory cache for WebAuthn challenges.
 *
 * Challenges are keyed by `userId:agentId` and auto-expire after 2 minutes.
 * A single user can only have one active challenge per agent at a time
 * (generating a new challenge overwrites the previous one).
 *
 * Capped at {@link MAX_ENTRIES} to prevent unbounded memory growth.
 */
export class WebAuthnChallengeCache {
	private store = new Map<string, CacheEntry>();
	private sweepTimer: ReturnType<typeof setInterval> | null = null;

	private key(userId: string, agentId: string): string {
		return `${userId}:${agentId}`;
	}

	set(userId: string, agentId: string, challenge: string): void {
		if (this.store.size >= MAX_ENTRIES) {
			// Evict oldest expired entries first, then oldest by insertion order
			const now = Date.now();
			for (const [k, v] of this.store) {
				if (v.expiresAt < now) this.store.delete(k);
			}
			// If still at capacity, drop the oldest entry
			if (this.store.size >= MAX_ENTRIES) {
				const oldest = this.store.keys().next().value;
				if (oldest) this.store.delete(oldest);
			}
		}
		this.store.set(this.key(userId, agentId), {
			challenge,
			expiresAt: Date.now() + DEFAULT_TTL_MS,
		});
		this.ensureSweep();
	}

	consume(userId: string, agentId: string): string | null {
		const k = this.key(userId, agentId);
		const entry = this.store.get(k);
		if (!entry) return null;
		this.store.delete(k);
		if (entry.expiresAt < Date.now()) return null;
		return entry.challenge;
	}

	private ensureSweep(): void {
		if (this.sweepTimer) return;
		this.sweepTimer = setInterval(() => {
			const now = Date.now();
			for (const [k, v] of this.store) {
				if (v.expiresAt < now) this.store.delete(k);
			}
			if (this.store.size === 0 && this.sweepTimer) {
				clearInterval(this.sweepTimer);
				this.sweepTimer = null;
			}
		}, 60_000);
		if (typeof this.sweepTimer === "object" && "unref" in this.sweepTimer) {
			this.sweepTimer.unref();
		}
	}
}
