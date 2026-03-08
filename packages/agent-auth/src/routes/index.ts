import type { JtiCacheStore } from "../utils/jti-cache";
import type { JwksCacheStore } from "../utils/jwks-cache";
import type { ResolvedAgentAuthOptions } from "../types";
import { approveCapability } from "./approve-capability";
import { approveConnectAccount } from "./approve-connect-account";
import { cleanupAgents } from "./cleanup";
import { connectAccount } from "./connect-account";
import { agentConfiguration } from "./discover";
import { getAgent } from "./get-agent";
import { getAgentSession } from "./get-session";
import { grantCapability } from "./grant-capability";
import { introspect } from "./introspect";
import { listAgents } from "./list-agents";
import { listCapabilities } from "./list-capabilities";
import { reactivateAgent } from "./reactivate";
import { register } from "./register";
import { requestCapability } from "./request-capability";
import { revokeAgent } from "./revoke";
import { rotateKey } from "./rotate-key";
import { agentStatus } from "./status";
import { updateAgent } from "./update-agent";
import { createHost } from "./host/create";
import { enrollHost } from "./host/enroll";
import { getHost } from "./host/get";
import { listHosts } from "./host/list";

import { revokeHost } from "./host/revoke";
import { rotateHostKey } from "./host/rotate-key";
import { updateHost } from "./host/update";
import { cibaAuthorize } from "./ciba/authorize";
import { cibaPending } from "./ciba/pending";
import { cibaApprove, cibaDeny } from "./ciba/respond";

export function createAgentRoutes(
	opts: ResolvedAgentAuthOptions,
	jtiCache?: JtiCacheStore,
	jwksCache?: JwksCacheStore,
) {
	return {
		getAgentConfiguration: agentConfiguration(opts), // §6.1
		listCapabilities: listCapabilities(opts), // §6.2
		register: register(opts, jtiCache, jwksCache), // §6.3
		requestCapability: requestCapability(opts), // §6.4
		agentStatus: agentStatus(), // §6.5
		getAgentSession: getAgentSession(), // not in spec
		revokeAgent: revokeAgent(opts), // §6.6
		rotateKey: rotateKey(opts), // §6.7
		introspect: introspect(opts, jtiCache, jwksCache), // §6.10
		reactivateAgent: reactivateAgent(opts), // §6.6
		cleanupAgents: cleanupAgents(opts), // not in spec
		approveCapability: approveCapability(opts), // §9.1
		grantCapability: grantCapability(opts), // §4
		connectAccount: connectAccount(), // §3.4
		approveConnectAccount: approveConnectAccount(opts), // §3.4
		listAgents: listAgents(), // §8
		getAgent: getAgent(), // §8
		updateAgent: updateAgent(opts), // §8
		createHost: createHost(opts), // §3.2
		enrollHost: enrollHost(opts), // §3.2
		listHosts: listHosts(), // §3
		getHost: getHost(), // §3
		revokeHost: revokeHost(opts), // §6.9
		updateHost: updateHost(opts), // §3
		rotateHostKey: rotateHostKey(opts, jtiCache, jwksCache), // §6.8
		cibaAuthorize: cibaAuthorize(opts), // §9.2
		cibaApprove: cibaApprove(opts), // §9.2
		cibaDeny: cibaDeny(opts), // §9.2
		cibaPending: cibaPending(), // §9.2
	};
}
