import type { JtiReplayCache } from "../jti-cache";
import type { ResolvedAgentAuthOptions } from "../types";
import { approveScope } from "./approve-scope";
import { capabilities } from "./capabilities";
import { cibaAuthorize } from "./ciba-authorize";
import { cibaPending } from "./ciba-pending";
import { cibaApprove, cibaDeny } from "./ciba-respond";
import { cibaToken } from "./ciba-token";
import { cleanupAgents } from "./cleanup-agents";
import { connectAccount } from "./connect-account";
import { createAgent } from "./create-agent";
import { discover } from "./discover";
import {
	createHost,
	enrollHost,
	getHost,
	listHosts,
	reactivateHost,
	revokeHost,
	updateHost,
} from "./enrollment";
import { getAgent } from "./get-agent";
import { getAgentSession } from "./get-agent-session";
import { grantPermission } from "./grant-permission";
import { introspect } from "./introspect";
import { listAgents } from "./list-agents";
import { reactivateAgent } from "./reactivate-agent";
import { requestScope } from "./request-scope";
import { revokeAgent } from "./revoke-agent";
import { rotateHostKey } from "./rotate-host-key";
import { rotateKey } from "./rotate-key";
import { scopeRequestStatus } from "./scope-request-status";
import { agentStatus } from "./status";
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
		capabilities: capabilities(opts),
		agentStatus: agentStatus(),
		introspect: introspect(opts, jtiCache),
		connectAccount: connectAccount(),
		createHost: createHost(opts),
		enrollHost: enrollHost(opts),
		listHosts: listHosts(),
		getHost: getHost(),
		revokeHost: revokeHost(),
		reactivateHost: reactivateHost(opts, jtiCache),
		updateHost: updateHost(opts),
		rotateHostKey: rotateHostKey(opts, jtiCache),
		grantPermission: grantPermission(opts),
		cibaAuthorize: cibaAuthorize(opts),
		cibaToken: cibaToken(opts),
		cibaApprove: cibaApprove(opts),
		cibaDeny: cibaDeny(opts),
		cibaPending: cibaPending(),
	};
}
