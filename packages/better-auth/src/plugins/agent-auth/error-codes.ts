import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const AGENT_AUTH_ERROR_CODES = defineErrorCodes({
	AGENT_NOT_FOUND: "Agent not found.",
	AGENT_REVOKED: "Agent has been revoked.",
	AGENT_EXPIRED: "Agent session has expired.",
	INVALID_JWT: "Invalid or expired agent JWT.",
	SCOPE_DENIED: "Agent does not have the required scope.",
	UNAUTHORIZED_SESSION: "Unauthorized or invalid session.",
	INVALID_PUBLIC_KEY: "Invalid public key format.",
	AGENT_NAME_REQUIRED: "Agent name is required.",
	INVALID_SCOPES: "Scopes must be an array of strings.",
	SCOPE_REQUEST_NOT_FOUND: "Scope request not found or expired.",
	SCOPE_REQUEST_OWNER_MISMATCH: "This scope request belongs to a different user.",
	SCOPE_REQUEST_ALREADY_RESOLVED: "Scope request has already been resolved.",
	NO_SCOPE_CHANGES: "No new scopes or name changes requested.",
});
