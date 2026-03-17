import type { AgentMode } from "./types";

export const TABLE = {
	agent: "agent",
	host: "agentHost",
	grant: "agentCapabilityGrant",
	approval: "approvalRequest",
} as const;

/**
 * Buffer added to JTI cache TTL to account for clock skew between servers.
 * JTI entries are cached for `jwtMaxAge + CLOCK_SKEW_TOLERANCE_SEC` to prevent
 * replay within the skew window.
 */
export const CLOCK_SKEW_TOLERANCE_SEC = 30;

export const DEFAULTS = {
	jwtMaxAge: 60,
	agentSessionTTL: 3600,
	agentMaxLifetime: 86400,
	absoluteLifetime: 0,
	maxAgentsPerUser: 25,
	freshSessionWindow: 300,
	allowedKeyAlgorithms: ["Ed25519"] as readonly string[],
	modes: ["delegated", "autonomous"] as readonly AgentMode[],
	approvalMethods: [
		"ciba",
		"device_authorization",
	] as readonly string[],
	blockedCapabilities: [] as readonly string[],
	cibaInterval: 5,
	cibaExpiresIn: 300,
	enrollmentTokenTTL: 3600,
} as const;
