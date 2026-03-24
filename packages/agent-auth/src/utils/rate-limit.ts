import type { AgentAuthOptions } from "../types";

const DEFAULT_WINDOW = 60;
const DEFAULT_MAX = 60;
const CREATE_MAX = 10;
const SENSITIVE_MAX = 5;
const POLLING_MAX = 300;

const POLLING_PATHS = new Set(["/agent/status", "/agent/ciba/pending"]);

export function buildRateLimits(overrides: AgentAuthOptions["rateLimit"]) {
  return [
    {
      pathMatcher(path: string) {
        return path === "/agent/register";
      },
      window: overrides?.["/agent/register"]?.window ?? DEFAULT_WINDOW,
      max: overrides?.["/agent/register"]?.max ?? CREATE_MAX,
    },
    {
      pathMatcher(path: string) {
        return path === "/agent/rotate-key" || path === "/agent/cleanup";
      },
      window:
        overrides?.["/agent/rotate-key"]?.window ??
        overrides?.["/agent/cleanup"]?.window ??
        DEFAULT_WINDOW,
      max:
        overrides?.["/agent/rotate-key"]?.max ??
        overrides?.["/agent/cleanup"]?.max ??
        SENSITIVE_MAX,
    },
    {
      pathMatcher(path: string) {
        return path === "/agent/approve-capability";
      },
      window: overrides?.["/agent/approve-capability"]?.window ?? DEFAULT_WINDOW,
      max: overrides?.["/agent/approve-capability"]?.max ?? SENSITIVE_MAX,
    },
    {
      pathMatcher(path: string) {
        return path === "/agent/ciba/authorize";
      },
      window: overrides?.["/agent/ciba/authorize"]?.window ?? DEFAULT_WINDOW,
      max: overrides?.["/agent/ciba/authorize"]?.max ?? SENSITIVE_MAX,
    },
    {
      pathMatcher(path: string) {
        return POLLING_PATHS.has(path);
      },
      window:
        overrides?.["/agent/status"]?.window ??
        overrides?.["/agent/ciba/pending"]?.window ??
        DEFAULT_WINDOW,
      max:
        overrides?.["/agent/status"]?.max ?? overrides?.["/agent/ciba/pending"]?.max ?? POLLING_MAX,
    },
    {
      pathMatcher(path: string) {
        return path.startsWith("/agent/") || path.startsWith("/capability/");
      },
      window: DEFAULT_WINDOW,
      max: DEFAULT_MAX,
    },
  ];
}
