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
			"/capability/list": "GET",
			"/capability/execute": "POST",
			"/agent/list": "GET",
			"/agent/get": "GET",
			"/agent/status": "GET",
			"/agent/session": "GET",
			"/host/list": "GET",
			"/host/get": "GET",
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
			"/agent/grant-capability": "POST",
			"/host/create": "POST",
			"/host/revoke": "POST",
			"/host/update": "POST",
			"/host/rotate-key": "POST",
			"/host/enroll": "POST",
			"/agent/ciba/authorize": "POST",
			"/device/code": "POST",
			"/device/token": "POST",
		},
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type AgentAuthClientPlugin = ReturnType<typeof agentAuthClient>;

export type * from "./types";
