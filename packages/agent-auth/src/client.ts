import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { agentAuth } from ".";
import { AGENT_AUTH_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const agentAuthClient = () => {
	return {
		id: "agent-auth",
		$InferServerPlugin: {} as ReturnType<typeof agentAuth>,
		pathMethods: {
			"/agent/register": "POST",
			"/agent/update": "POST",
			"/agent/revoke": "POST",
			"/agent/rotate-key": "POST",
			"/agent/reactivate": "POST",
			"/agent/cleanup": "POST",
			"/agent/request-scope": "POST",
			"/agent/approve-scope": "POST",
			"/agent/introspect": "POST",
			"/agent/connect-account": "POST",
			"/agent/grant-permission": "POST",
			"/agent/host/create": "POST",
			"/agent/host/revoke": "POST",
			"/agent/host/reactivate": "POST",
			"/agent/host/update": "POST",
			"/agent/host/rotate-key": "POST",
			"/agent/ciba/authorize": "POST",
			"/agent/ciba/token": "POST",
			"/agent/ciba/approve": "POST",
			"/agent/ciba/deny": "POST",
		},
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type AgentAuthClientPlugin = ReturnType<typeof agentAuthClient>;

export type * from "./types";
