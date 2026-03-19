import { APIError } from "@better-auth/core/error";

export interface ErrorDef {
  readonly code: string;
  readonly message: string;
}

/**
 * Create a spec-compliant error (Agent Auth Protocol §5.13).
 * Response body: `{ error: "error_code", message: "Human-readable description", ...extra }`
 */
export function agentError(
  status: ConstructorParameters<typeof APIError>[0],
  err: ErrorDef,
  overrideMessage?: string,
  headers?: Record<string, string>,
  extra?: Record<string, unknown>,
): APIError {
  return new APIError(
    status,
    {
      error: err.code,
      message: overrideMessage ?? err.message,
      ...extra,
    },
    headers ?? {},
  );
}

/**
 * Build the `WWW-Authenticate: AgentAuth` challenge header value (§6.14).
 */
export function agentAuthChallenge(baseURL: string): Record<string, string> {
  const origin = new URL(baseURL).origin;
  return {
    "WWW-Authenticate": `AgentAuth discovery="${origin}/.well-known/agent-configuration"`,
  };
}

export const AGENT_AUTH_ERROR_CODES = {
  INVALID_REQUEST: {
    code: "invalid_request",
    message: "Malformed request, missing required fields, or invalid parameter types",
  },
  INVALID_JWT: {
    code: "invalid_jwt",
    message: "JWT is invalid, expired, or signature failed",
  },
  AGENT_REVOKED: {
    code: "agent_revoked",
    message: "Agent has been revoked",
  },
  AGENT_EXPIRED: {
    code: "agent_expired",
    message: "Agent session has expired",
  },
  ABSOLUTE_LIFETIME_EXCEEDED: {
    code: "absolute_lifetime_exceeded",
    message: "Agent's absolute lifetime has elapsed",
  },
  AGENT_PENDING: {
    code: "agent_pending",
    message: "Agent is still pending approval",
  },
  AGENT_REJECTED: {
    code: "agent_rejected",
    message: "Agent registration was denied",
  },
  AGENT_CLAIMED: {
    code: "agent_claimed",
    message: "Agent has been claimed and is no longer active",
  },
  AGENT_NOT_EXPIRED: {
    code: "agent_not_expired",
    message: "Agent is not in an expired state",
  },
  HOST_REVOKED: {
    code: "host_revoked",
    message: "Host has been revoked",
  },
  HOST_PENDING: {
    code: "host_pending",
    message: "Host is still pending approval",
  },
  UNAUTHORIZED: {
    code: "unauthorized",
    message: "Caller is not authorized for this operation",
  },
  RATE_LIMITED: {
    code: "rate_limited",
    message: "Too many requests",
  },
  INTERNAL_ERROR: {
    code: "internal_error",
    message: "Server-side failure",
  },
  UNSUPPORTED_MODE: {
    code: "unsupported_mode",
    message: "Requested mode is not supported by this server",
  },
  UNSUPPORTED_ALGORITHM: {
    code: "unsupported_algorithm",
    message: "Key algorithm is not in the server's supported set",
  },
  INVALID_CAPABILITIES: {
    code: "invalid_capabilities",
    message: "One or more requested capability names don't exist or are blocked",
  },
  AGENT_EXISTS: {
    code: "agent_exists",
    message: "An agent with this public key is already registered",
  },
  ALREADY_GRANTED: {
    code: "already_granted",
    message: "All requested capabilities are already granted",
  },
  CAPABILITY_NOT_GRANTED: {
    code: "capability_not_granted",
    message: "Agent does not have an active grant for this capability",
  },
  LIMIT_EXCEEDED: {
    code: "limit_exceeded",
    message: "Request exceeds the agent's limits for this capability",
  },
  CAPABILITY_BLOCKED: {
    code: "capability_blocked",
    message: "One or more requested capabilities are blocked by server policy",
  },
  AGENT_NOT_FOUND: {
    code: "agent_not_found",
    message: "Agent not found",
  },
  HOST_NOT_FOUND: {
    code: "host_not_found",
    message: "Host not found",
  },
  UNAUTHORIZED_SESSION: {
    code: "unauthorized",
    message: "Authentication required",
  },
  INVALID_PUBLIC_KEY: {
    code: "invalid_public_key",
    message: "Public key is invalid or malformed",
  },
  JWT_REPLAY: {
    code: "jti_replay",
    message: "JWT has already been used",
  },
  REQUEST_BINDING_MISMATCH: {
    code: "request_binding_mismatch",
    message: "Request binding does not match the JWT",
  },
  HOST_EXPIRED: {
    code: "host_expired",
    message: "Host has expired",
  },
  HOST_ALREADY_LINKED: {
    code: "host_already_linked",
    message: "Host is already linked to a different user",
  },
  HOST_NOT_PENDING_ENROLLMENT: {
    code: "host_not_pending_enrollment",
    message: "Host is not in a pending enrollment state",
  },
  DYNAMIC_HOST_REGISTRATION_DISABLED: {
    code: "dynamic_host_registration_disabled",
    message: "Dynamic host registration is not enabled on this server",
  },
  ENROLLMENT_TOKEN_INVALID: {
    code: "enrollment_token_invalid",
    message: "Enrollment token is invalid",
  },
  ENROLLMENT_TOKEN_EXPIRED: {
    code: "enrollment_token_expired",
    message: "Enrollment token has expired",
  },
  CAPABILITY_REQUEST_NOT_FOUND: {
    code: "capability_request_not_found",
    message: "Capability request not found",
  },
  CAPABILITY_REQUEST_ALREADY_RESOLVED: {
    code: "capability_request_already_resolved",
    message: "Capability request has already been resolved",
  },
  CAPABILITY_REQUEST_OWNER_MISMATCH: {
    code: "capability_request_owner_mismatch",
    message: "Capability request does not belong to this user",
  },
  FRESH_SESSION_REQUIRED: {
    code: "fresh_session_required",
    message: "A fresh authentication session is required for this operation",
  },
  CAPABILITY_DENIED: {
    code: "capability_denied",
    message: "Capability request was denied",
  },
  AGENT_LIMIT_REACHED: {
    code: "agent_limit_reached",
    message: "Maximum number of active agents per user reached",
  },
  AUTONOMOUS_OWNER_REQUIRED: {
    code: "autonomous_owner_required",
    message: "Autonomous agents require an owner to be resolved",
  },
  CIBA_NOT_FOUND: {
    code: "ciba_not_found",
    message: "CIBA authentication request not found",
  },
  CIBA_EXPIRED: {
    code: "ciba_expired",
    message: "CIBA authentication request has expired",
  },
  CIBA_ALREADY_RESOLVED: {
    code: "ciba_already_resolved",
    message: "CIBA authentication request has already been resolved",
  },
  CIBA_SLOW_DOWN: {
    code: "slow_down",
    message: "Polling too frequently, slow down",
  },
  UNKNOWN_CAPABILITIES: {
    code: "unknown_capabilities",
    message: "One or more capability names are not recognized",
  },
  CAPABILITY_NOT_FOUND: {
    code: "capability_not_found",
    message: "Capability does not exist",
  },
  AUTH_REQUIRED_FOR_CAPABILITIES: {
    code: "authentication_required",
    message:
      "This server requires authentication to list capabilities. Connect an agent first, then retry with the agent JWT.",
  },
  CONSTRAINT_VIOLATED: {
    code: "constraint_violated",
    message: "One or more capability constraints were violated",
  },
  EXECUTE_NOT_CONFIGURED: {
    code: "execute_not_configured",
    message: "Server has not configured a capability execution handler",
  },
  UNKNOWN_CONSTRAINT_OPERATOR: {
    code: "unknown_constraint_operator",
    message: "Constraint contains an unrecognized operator",
  },
  INVALID_USER_CODE: {
    code: "invalid_user_code",
    message: "The user code is missing or does not match",
  },
  APPROVAL_EXPIRED: {
    code: "approval_expired",
    message: "The approval request has expired",
  },
  WEBAUTHN_NOT_ENROLLED: {
    code: "webauthn_not_enrolled",
    message:
      "No passkeys registered. Register a passkey before approving capabilities that require proof of physical presence.",
  },
  WEBAUTHN_REQUIRED: {
    code: "webauthn_required",
    message: "This approval requires proof of physical presence. Complete the WebAuthn challenge.",
  },
  WEBAUTHN_VERIFICATION_FAILED: {
    code: "webauthn_verification_failed",
    message: "WebAuthn verification failed",
  },
} as const satisfies Record<string, ErrorDef>;
