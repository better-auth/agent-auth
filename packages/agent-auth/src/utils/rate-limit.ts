import type { AgentAuthOptions } from "../types";

const DEFAULT_WINDOW = 60;
const DEFAULT_MAX = 60;
const CREATE_MAX = 10;
const SENSITIVE_MAX = 5;

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
        return path.startsWith("/agent/") || path.startsWith("/capability/");
      },
      window: DEFAULT_WINDOW,
      max: DEFAULT_MAX,
    },
  ];
}
