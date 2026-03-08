import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { agentAuth } from ".";
import { AGENT_AUTH_ERROR_CODES } from "./errors";

export * from "./errors";

export const agentAuthClient = () => {
	return {
		id: "agent-auth",
		$InferServerPlugin: {} as ReturnType<typeof agentAuth>,
		pathMethods: {
			"/agent/agent-configuration": "GET",
			"/capabilities": "GET",
			"/agent/list": "GET",
			"/agent/get": "GET",
			"/agent/status": "GET",
			"/agent/session": "GET",
			"/agent/host/list": "GET",
			"/agent/host/get": "GET",
			"/agent/ciba/pending": "GET",
			"/agent/register": "POST",
			"/agent/update": "POST",
			"/agent/revoke": "POST",
			"/agent/rotate-key": "POST",
			"/agent/reactivate": "POST",
			"/agent/cleanup": "POST",
			"/agent/request-capability": "POST",
			"/agent/approve-capability": "POST",
			"/agent/introspect": "POST",
			"/agent/connect-account": "POST",
			"/agent/approve-connect-account": "POST",
			"/agent/grant-capability": "POST",
			"/agent/host/create": "POST",
			"/agent/host/revoke": "POST",
			"/agent/host/reactivate": "POST",
			"/agent/host/update": "POST",
			"/agent/host/rotate-key": "POST",
			"/agent/host/enroll": "POST",
			"/agent/ciba/authorize": "POST",
			"/agent/ciba/approve": "POST",
			"/agent/ciba/deny": "POST",
		},
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type AgentAuthClientPlugin = ReturnType<typeof agentAuthClient>;

export type * from "./types";
