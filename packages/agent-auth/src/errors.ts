export interface ErrorDef {
	readonly code: string;
	readonly message: string;
}

function defineErrors<T extends Record<string, string>>(
	codes: T,
): { [K in keyof T & string]: ErrorDef } {
	const result = {} as Record<string, ErrorDef>;
	for (const [key, value] of Object.entries(codes)) {
		result[key] = { code: key, message: value };
	}
	return result as { [K in keyof T & string]: ErrorDef };
}

export const AGENT_AUTH_ERROR_CODES = defineErrors({
	INVALID_REQUEST: "invalid_request",
	INVALID_JWT: "invalid_jwt",
	AGENT_REVOKED: "agent_revoked",
	AGENT_EXPIRED: "agent_expired",
	ABSOLUTE_LIFETIME_EXCEEDED: "absolute_lifetime_exceeded",
	AGENT_PENDING: "agent_pending",
	AGENT_REJECTED: "agent_rejected",
	AGENT_CLAIMED: "agent_claimed",
	AGENT_NOT_EXPIRED: "agent_not_expired",
	HOST_REVOKED: "host_revoked",
	HOST_PENDING: "host_pending",
	UNAUTHORIZED: "unauthorized",
	RATE_LIMITED: "rate_limited",
	INTERNAL_ERROR: "internal_error",
	UNSUPPORTED_MODE: "unsupported_mode",
	UNSUPPORTED_ALGORITHM: "unsupported_algorithm",
	INVALID_CAPABILITIES: "invalid_capabilities",
	AGENT_EXISTS: "agent_exists",
	ALREADY_GRANTED: "already_granted",
	CAPABILITY_NOT_GRANTED: "capability_not_granted",
	LIMIT_EXCEEDED: "limit_exceeded",
	CAPABILITY_BLOCKED: "capability_blocked",
	AGENT_NOT_FOUND: "agent_not_found",
	HOST_NOT_FOUND: "host_not_found",
	UNAUTHORIZED_SESSION: "unauthorized_session",
	INVALID_PUBLIC_KEY: "invalid_public_key",
	JWT_REPLAY: "jti_replay",
	REQUEST_BINDING_MISMATCH: "request_binding_mismatch",
	HOST_EXPIRED: "host_expired",
	HOST_ALREADY_LINKED: "host_already_linked",
	HOST_NOT_PENDING_ENROLLMENT: "host_not_pending_enrollment",
	DYNAMIC_HOST_REGISTRATION_DISABLED:
		"dynamic_host_registration_disabled",
	ENROLLMENT_TOKEN_INVALID: "enrollment_token_invalid",
	ENROLLMENT_TOKEN_EXPIRED: "enrollment_token_expired",
	CAPABILITY_REQUEST_NOT_FOUND: "capability_request_not_found",
	CAPABILITY_REQUEST_ALREADY_RESOLVED:
		"capability_request_already_resolved",
	CAPABILITY_REQUEST_OWNER_MISMATCH:
		"capability_request_owner_mismatch",
	FRESH_SESSION_REQUIRED: "fresh_session_required",
	CAPABILITY_DENIED: "capability_denied",
	AGENT_LIMIT_REACHED: "agent_limit_reached",
	AUTONOMOUS_OWNER_REQUIRED: "autonomous_owner_required",
	CIBA_NOT_FOUND: "ciba_not_found",
	CIBA_EXPIRED: "ciba_expired",
	CIBA_ALREADY_RESOLVED: "ciba_already_resolved",
	CIBA_SLOW_DOWN: "slow_down",
	UNKNOWN_CAPABILITIES: "unknown_capabilities",
	CAPABILITY_NOT_FOUND: "capability_not_found",
	EXECUTE_NOT_CONFIGURED: "execute_not_configured",
});
