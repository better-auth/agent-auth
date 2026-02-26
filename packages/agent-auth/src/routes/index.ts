import type { ResolvedAgentAuthOptions } from "../types";
import { approveScope } from "./approve-scope";
import { cleanupAgents } from "./cleanup-agents";
import { createAgent } from "./create-agent";
import { discover } from "./discover";
import {
	createEnrollment,
	getEnrollment,
	listEnrollments,
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

export function createAgentRoutes(opts: ResolvedAgentAuthOptions) {
	return {
		createAgent: createAgent(opts),
		listAgents: listAgents(),
		getAgent: getAgent(),
		updateAgent: updateAgent(opts),
		revokeAgent: revokeAgent(),
		rotateKey: rotateKey(opts),
		reactivateAgent: reactivateAgent(opts),
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
		createWorkgroup: createWorkgroup(),
		listWorkgroups: listWorkgroups(),
		updateWorkgroup: updateWorkgroup(),
		deleteWorkgroup: deleteWorkgroup(),
	};
}
