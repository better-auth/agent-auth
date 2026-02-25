import type { ResolvedAgentAuthOptions } from "../types";
import { approveScope } from "./approve-scope";
import { cleanupAgents } from "./cleanup-agents";
import { createAgent } from "./create-agent";
import { getAgent } from "./get-agent";
import { getAgentSession } from "./get-agent-session";
import { listAgents } from "./list-agents";
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
		updateAgent: updateAgent(),
		revokeAgent: revokeAgent(),
		rotateKey: rotateKey(),
		getAgentSession: getAgentSession(),
		cleanupAgents: cleanupAgents(),
		requestScope: requestScope(),
		scopeRequestStatus: scopeRequestStatus(),
		approveScope: approveScope(),
		createWorkgroup: createWorkgroup(),
		listWorkgroups: listWorkgroups(),
		updateWorkgroup: updateWorkgroup(),
		deleteWorkgroup: deleteWorkgroup(),
	};
}
