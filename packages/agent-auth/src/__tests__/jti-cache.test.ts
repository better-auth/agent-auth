import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryJtiCache, JtiCacheProxy, SecondaryStorageJtiCache } from "../utils/jti-cache";

describe("MemoryJtiCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for unseen JTI", () => {
    const cache = new MemoryJtiCache();
    expect(cache.has("abc")).toBe(false);
    cache.destroy();
  });

  it("returns true after add", () => {
    const cache = new MemoryJtiCache();
    cache.add("abc", 60);
    expect(cache.has("abc")).toBe(true);
    cache.destroy();
  });

  it("returns false after TTL expires", () => {
    const cache = new MemoryJtiCache();
    cache.add("abc", 60);
    vi.advanceTimersByTime(61_000);
    expect(cache.has("abc")).toBe(false);
    cache.destroy();
  });

  it("returns true within TTL", () => {
    const cache = new MemoryJtiCache();
    cache.add("abc", 60);
    vi.advanceTimersByTime(30_000);
    expect(cache.has("abc")).toBe(true);
    cache.destroy();
  });

  it("evicts expired entries on interval", () => {
    const cache = new MemoryJtiCache();
    cache.add("abc", 10);
    vi.advanceTimersByTime(15_000);
    // Trigger eviction (runs every 30s)
    vi.advanceTimersByTime(30_000);
    expect(cache.has("abc")).toBe(false);
    cache.destroy();
  });

  it("destroy clears all entries and stops interval", () => {
    const cache = new MemoryJtiCache();
    cache.add("abc", 60);
    cache.destroy();
    expect(cache.has("abc")).toBe(false);
  });
});

describe("JtiCacheProxy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with memory cache", () => {
    const proxy = new JtiCacheProxy();
    proxy.add("test", 60);
    expect(proxy.has("test")).toBe(true);
  });

  it("switches to secondary storage", async () => {
    const storage = new Map<string, { value: string; expiresAt: number }>();
    const secondaryStorage = {
      get: async (key: string) => {
        const entry = storage.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
          storage.delete(key);
          return null;
        }
        return entry.value;
      },
      set: async (key: string, value: string, ttl?: number) => {
        storage.set(key, {
          value,
          expiresAt: Date.now() + (ttl ?? 60) * 1000,
        });
      },
      delete: async (key: string) => {
        storage.delete(key);
      },
    };

    const proxy = new JtiCacheProxy();
    proxy.add("old-key", 60);
    expect(proxy.has("old-key")).toBe(true);

    proxy.useSecondaryStorage(secondaryStorage);

    // Old memory cache entries are gone
    expect(proxy.has("old-key")).resolves.toBe(false);

    // New entries go to secondary storage
    await proxy.add("new-key", 60);
    expect(await proxy.has("new-key")).toBe(true);
  });
});

describe("SecondaryStorageJtiCache", () => {
  it("stores and retrieves JTI via secondary storage", async () => {
    const storage = new Map<string, string>();
    const secondaryStorage = {
      get: async (key: string) => storage.get(key) ?? null,
      set: async (key: string, value: string) => {
        storage.set(key, value);
      },
      delete: async (key: string) => {
        storage.delete(key);
      },
    };

    const cache = new SecondaryStorageJtiCache(secondaryStorage);
    expect(await cache.has("jti-1")).toBe(false);
    await cache.add("jti-1", 60);
    expect(await cache.has("jti-1")).toBe(true);
  });
});
