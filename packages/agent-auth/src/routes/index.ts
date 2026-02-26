import type { JtiReplayCache } from "../jti-cache";
import type { ResolvedAgentAuthOptions } from "../types";
import { approveScope } from "./approve-scope";
import { cleanupAgents } from "./cleanup-agents";
import { createAgent } from "./create-agent";
import { discover } from "./discover";
import {
	createEnrollment,
	getEnrollment,
	listEnrollments,
	reactivateEnrollment,
	revokeEnrollment,
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
import {
	createWorkgroup,
	deleteWorkgroup,
	listWorkgroups,
	updateWorkgroup,
} from "./workgroup";

export function createAgentRoutes(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiReplayCache,
) {
	return {
		createAgent: createAgent(opts, jtiCache),
		listAgents: listAgents(),
		getAgent: getAgent(),
		updateAgent: updateAgent(opts),
		revokeAgent: revokeAgent(opts),
		rotateKey: rotateKey(opts),
		reactivateAgent: reactivateAgent(opts, jtiCache),
		getAgentSession: getAgentSession(),
		cleanupAgents: cleanupAgents(),
		requestScope: requestScope(opts),
		scopeRequestStatus: scopeRequestStatus(),
		approveScope: approveScope(opts),
		discover: discover(opts),
		createEnrollment: createEnrollment(opts),
		listEnrollments: listEnrollments(),
		getEnrollment: getEnrollment(),
		revokeEnrollment: revokeEnrollment(),
		reactivateEnrollment: reactivateEnrollment(opts, jtiCache),
		createWorkgroup: createWorkgroup(),
		listWorkgroups: listWorkgroups(),
		updateWorkgroup: updateWorkgroup(),
		deleteWorkgroup: deleteWorkgroup(),
	};
}
