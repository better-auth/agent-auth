import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const AGENT_AUTH_ERROR_CODES = defineErrorCodes({
	AGENT_NOT_FOUND: "Agent not found.",
	AGENT_REVOKED: "Agent has been revoked.",
	AGENT_EXPIRED: "Agent session has expired.",
	AGENT_PENDING: "Agent is still pending approval.",
	AGENT_EXISTS: "An agent with this public key is already registered.",
	INVALID_JWT: "Invalid or expired agent JWT.",
	JWT_REPLAY: "JWT has already been used (replay detected).",
	SCOPE_DENIED: "Agent does not have the required scope.",
	SCOPE_BLOCKED: "One or more requested scopes are blocked.",
	ALREADY_GRANTED: "All requested scopes are already granted.",
	UNAUTHORIZED_SESSION: "Unauthorized or invalid session.",
	UNAUTHORIZED: "Caller is not authorized for this operation.",
	FRESH_SESSION_REQUIRED:
		"A fresh session is required. Please re-authenticate.",
	INVALID_PUBLIC_KEY: "Invalid public key format.",
	AGENT_NAME_REQUIRED: "Agent name is required.",
	INVALID_SCOPES: "Scopes must be an array of strings.",
	UNKNOWN_SCOPES: "One or more requested scopes are not recognized.",
	UNSUPPORTED_MODE: "Requested mode is not supported by this server.",
	UNSUPPORTED_ALGORITHM:
		"Agent's key algorithm is not in the server's supported set.",
	AGENT_LIMIT_REACHED: "Maximum number of active agents reached.",
	SCOPE_REQUEST_NOT_FOUND:
		"No pending permission requests found for this agent.",
	SCOPE_REQUEST_OWNER_MISMATCH: "This agent belongs to a different user.",
	SCOPE_REQUEST_ALREADY_RESOLVED:
		"All permission requests have already been resolved.",
	NO_SCOPE_CHANGES: "No new scopes requested.",
	HOST_NOT_FOUND: "Agent host not found.",
	HOST_REVOKED: "Agent host has been revoked.",
	HOST_EXPIRED:
		"Agent host has expired. Reactivate it via proof-of-possession.",
	HOST_REQUIRED: "An active agent host is required to create agents.",
	DYNAMIC_HOST_REGISTRATION_DISABLED:
		"Dynamic host registration is disabled. Register a host via the dashboard or API first.",
	HOST_ALREADY_LINKED: "Host already has a user_id — unlink first.",
	REQUEST_BINDING_MISMATCH:
		"JWT request binding does not match the actual request.",
	CIBA_USER_NOT_FOUND: "No user found for the provided login_hint.",
	CIBA_REQUEST_NOT_FOUND: "CIBA authentication request not found.",
	CIBA_REQUEST_EXPIRED: "CIBA authentication request has expired.",
	CIBA_SLOW_DOWN: "Polling too frequently. Increase your interval.",
	CIBA_ACCESS_DENIED: "User denied the CIBA authentication request.",
	CIBA_INVALID_DELIVERY_MODE: "Unsupported backchannel_token_delivery_mode.",
	CIBA_MISSING_NOTIFICATION_ENDPOINT:
		"Ping/Push modes require a client_notification_endpoint.",
	CIBA_MISSING_LOGIN_HINT: "login_hint is required for CIBA authentication.",
	CIBA_NOT_ENABLED: "CIBA approval method is not enabled on this server.",
	ENROLLMENT_TOKEN_INVALID: "Invalid or expired enrollment token.",
	ENROLLMENT_TOKEN_EXPIRED: "Enrollment token has expired.",
	HOST_NOT_PENDING_ENROLLMENT: "Host is not in pending_enrollment state.",
});
