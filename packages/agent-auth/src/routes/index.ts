import type { JtiReplayCache } from "../jti-cache";
import type { ResolvedAgentAuthOptions } from "../types";
import { approveScope } from "./approve-scope";
import { cleanupAgents } from "./cleanup-agents";
import { createAgent } from "./create-agent";
import { discover } from "./discover";
import {
	createHost,
	getHost,
	listHosts,
	reactivateHost,
	revokeHost,
} from "./enrollment";
import { getAgent } from "./get-agent";
import { getAgentSession } from "./get-agent-session";
import { listAgents } from "./list-agents";
import { reactivateAgent } from "./reactivate-agent";
import { requestScope } from "./request-scope";
import { revokeAgent } from "./revoke-agent";
import { rotateKey } from "./rotate-key";
import { scopeRequestStatus } from "./scope-request-status";
import { updateAgent } from "./update-agent";

export function createAgentRoutes(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return {
		createAgent: createAgent(opts, jtiCache),
		listAgents: listAgents(),
		getAgent: getAgent(),
		updateAgent: updateAgent(),
		revokeAgent: revokeAgent(opts),
		rotateKey: rotateKey(opts),
		reactivateAgent: reactivateAgent(opts, jtiCache),
		getAgentSession: getAgentSession(),
		cleanupAgents: cleanupAgents(),
		requestScope: requestScope(opts),
		scopeRequestStatus: scopeRequestStatus(),
		approveScope: approveScope(opts),
		discover: discover(opts),
		createHost: createHost(opts),
		listHosts: listHosts(),
		getHost: getHost(),
		revokeHost: revokeHost(),
		reactivateHost: reactivateHost(opts, jtiCache),
	};
}
