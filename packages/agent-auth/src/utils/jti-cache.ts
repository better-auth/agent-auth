import type { SecondaryStorage } from "@better-auth/core/db";

/**
 * Abstract JTI cache contract used throughout the plugin.
 * Both `has` and `add` may return promises when backed by
 * secondary storage.
 */
export interface JtiCacheStore {
	has(jti: string): boolean | Promise<boolean>;
	add(jti: string, maxAgeSec: number): void | Promise<void>;
}

export class MemoryJtiCache implements JtiCacheStore {
	private seen = new Map<string, number>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.cleanupInterval = setInterval(() => this.evict(), 30_000);
		if (
			typeof this.cleanupInterval === "object" &&
			"unref" in this.cleanupInterval
		) {
			this.cleanupInterval.unref();
		}
	}

	has(jti: string): boolean {
		const expiry = this.seen.get(jti);
		if (expiry === undefined) return false;
		if (Date.now() > expiry) {
			this.seen.delete(jti);
			return false;
		}
		return true;
	}

	add(jti: string, maxAgeSec: number): void {
		this.seen.set(jti, Date.now() + maxAgeSec * 1000);
	}

	private evict(): void {
		const now = Date.now();
		for (const [jti, expiry] of this.seen) {
			if (now > expiry) this.seen.delete(jti);
		}
	}

	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.seen.clear();
	}
}

const JTI_PREFIX = "agent-auth:jti:";

export class SecondaryStorageJtiCache implements JtiCacheStore {
	constructor(private storage: SecondaryStorage) {}

	async has(jti: string): Promise<boolean> {
		const val = await this.storage.get(`${JTI_PREFIX}${jti}`);
		return val != null;
	}

	async add(jti: string, maxAgeSec: number): Promise<void> {
		await this.storage.set(`${JTI_PREFIX}${jti}`, "1", maxAgeSec);
	}
}

export class JtiCacheProxy implements JtiCacheStore {
	inner: JtiCacheStore;

	constructor() {
		this.inner = new MemoryJtiCache();
	}

	useSecondaryStorage(storage: SecondaryStorage): void {
		if (this.inner instanceof MemoryJtiCache) {
			this.inner.destroy();
		}
		this.inner = new SecondaryStorageJtiCache(storage);
	}

	has(jti: string): boolean | Promise<boolean> {
		return this.inner.has(jti);
	}

	add(jti: string, maxAgeSec: number): void | Promise<void> {
		return this.inner.add(jti, maxAgeSec);
	}
}
