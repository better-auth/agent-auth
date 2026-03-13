import type { AgentMode } from "./types";

export const TABLE = {
	agent: "agent",
	host: "agentHost",
	grant: "agentCapabilityGrant",
	approval: "approvalRequest",
} as const;

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
