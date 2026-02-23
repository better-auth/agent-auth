import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const AGENT_GATEWAY_ERROR_CODES = defineErrorCodes({
	PROVIDER_NOT_FOUND: "Provider not found or not connected for this user.",
	SCOPE_DENIED: "Agent does not have the required scope for this tool.",
	TOOL_CALL_FAILED: "Failed to execute tool on the provider.",
	INVALID_TOOL_NAME:
		'Invalid tool name. Use "provider.tool" format (e.g. "github.list_issues").',
	UNAUTHORIZED_SESSION: "Unauthorized or invalid agent session.",
});
