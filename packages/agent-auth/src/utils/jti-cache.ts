import type { SecondaryStorage } from "@better-auth/core/db";

const EVICTION_INTERVAL_MS = 30_000;

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
  private nextEvictionAt = 0;

  has(jti: string): boolean {
    const now = Date.now();
    const expiry = this.seen.get(jti);
    if (expiry === undefined) return false;
    if (now > expiry) {
      this.seen.delete(jti);
      return false;
    }
    this.maybeEvict(now);
    return true;
  }

  add(jti: string, maxAgeSec: number): void {
    const now = Date.now();
    this.maybeEvict(now);
    this.seen.set(jti, now + maxAgeSec * 1000);
  }

  private maybeEvict(now: number): void {
    if (now < this.nextEvictionAt) {
      return;
    }

    this.nextEvictionAt = now + EVICTION_INTERVAL_MS;

    for (const [jti, expiry] of this.seen) {
      if (now > expiry) this.seen.delete(jti);
    }
  }

  destroy(): void {
    this.seen.clear();
    this.nextEvictionAt = 0;
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
