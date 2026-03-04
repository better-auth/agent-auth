/**
 * Re-export from @auth/agents for backwards compatibility.
 * Import directly from "@auth/agents/agent-client" for new code.
 */

export type {
	AgentClientOptions,
	AgentJWK,
	ConnectAgentOptions,
	ConnectAgentResult,
	ConnectAgentViaCibaOptions,
} from "@auth/agents/agent-client";
export {
	connectAgent,
	connectAgentViaCiba,
	createAgentClient,
	generateKeypair,
	signAgentJWT,
} from "@auth/agents/agent-client";
