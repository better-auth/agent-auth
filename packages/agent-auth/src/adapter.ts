import { TABLE } from "./constants";
import { parseCapabilityIds } from "./utils/capabilities";
import { resolveGrantExpiresAt } from "./utils/grant-ttl";
import type {
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	ApprovalRequest,
	FullAdapter,
	ResolvedAgentAuthOptions,
} from "./types";

export function getAgentAuthAdapter(
	adapter: FullAdapter,
	opts: ResolvedAgentAuthOptions,
) {
	const findAgentById = (id: string) =>
		adapter.findOne<Agent>({
			model: TABLE.agent,
			where: [{ field: "id", value: id }],
		});

	const findAgentByKidAndUser = (kid: string, userId: string) =>
		adapter.findOne<Agent>({
			model: TABLE.agent,
			where: [
				{ field: "kid", value: kid },
				{ field: "userId", value: userId },
			],
		});

	const findAgentsByHost = (hostId: string) =>
		adapter.findMany<Agent>({
			model: TABLE.agent,
			where: [{ field: "hostId", value: hostId }],
		});

	const findAgentsByUser = (
		userId: string,
		filters?: {
			status?: string;
			hostId?: string;
			limit?: number;
			sortBy?: { field: string; direction: "asc" | "desc" };
		},
	) =>
		adapter.findMany<Agent>({
			model: TABLE.agent,
			where: [
				{ field: "userId", value: userId },
				...(filters?.status
					? [{ field: "status", value: filters.status }]
					: []),
				...(filters?.hostId
					? [{ field: "hostId", value: filters.hostId }]
					: []),
			],
			...(filters?.limit ? { limit: filters.limit } : {}),
			...(filters?.sortBy ? { sortBy: filters.sortBy } : {}),
		});

	const createAgent = (data: Record<string, unknown>) =>
		adapter.create<Record<string, unknown>, Agent>({
			model: TABLE.agent,
			data,
		});

	const updateAgent = (id: string, data: Record<string, unknown>) =>
		adapter.update({
			model: TABLE.agent,
			where: [{ field: "id", value: id }],
			update: data,
		});

	const countActiveAgents = (userId: string) =>
		adapter.count({
			model: TABLE.agent,
			where: [
				{ field: "userId", value: userId },
				{ field: "status", value: "active" },
			],
		});

	const findHostById = (id: string) =>
		adapter.findOne<AgentHost>({
			model: TABLE.host,
			where: [{ field: "id", value: id }],
		});

	const findHostByKey = async (
		publicKey: Record<string, unknown>,
	): Promise<AgentHost | null> => {
		const kid =
			typeof publicKey.kid === "string" ? publicKey.kid : null;
		if (kid) {
			const byKid = await adapter.findOne<AgentHost>({
				model: TABLE.host,
				where: [{ field: "kid", value: kid }],
			});
			if (byKid) return byKid;
		}
		return adapter.findOne<AgentHost>({
			model: TABLE.host,
			where: [
				{ field: "publicKey", value: JSON.stringify(publicKey) },
			],
		});
	};

	const findHostsByEnrollmentTokenHash = (hash: string) =>
		adapter.findMany<AgentHost>({
			model: TABLE.host,
			where: [{ field: "enrollmentTokenHash", value: hash }],
		});

	const findHostsForUser = (
		userId: string,
		filters?: { status?: string },
	) =>
		adapter.findMany<AgentHost>({
			model: TABLE.host,
			where: [
				{ field: "userId", value: userId },
				...(filters?.status
					? [{ field: "status", value: filters.status }]
					: []),
			],
		});

	const createHost = (data: Record<string, unknown>) =>
		adapter.create<Record<string, unknown>, AgentHost>({
			model: TABLE.host,
			data,
		});

	const updateHost = (id: string, data: Record<string, unknown>) =>
		adapter.update({
			model: TABLE.host,
			where: [{ field: "id", value: id }],
			update: data,
		});

	const findGrantsByAgent = (agentId: string) =>
		adapter.findMany<AgentCapabilityGrant>({
			model: TABLE.grant,
			where: [{ field: "agentId", value: agentId }],
		});

	const createGrant = (data: Record<string, unknown>) =>
		adapter.create<Record<string, unknown>, AgentCapabilityGrant>({
			model: TABLE.grant,
			data,
		});

	const updateGrant = (id: string, data: Record<string, unknown>) =>
		adapter.update({
			model: TABLE.grant,
			where: [{ field: "id", value: id }],
			update: data,
		});

	const deleteGrant = (id: string) =>
		adapter.delete({
			model: TABLE.grant,
			where: [{ field: "id", value: id }],
		});

	const deleteGrantsByAgent = async (agentId: string) => {
		const existing = await findGrantsByAgent(agentId);
		for (const g of existing) {
			await deleteGrant(g.id);
		}
	};

	const createGrantRows = async (
		agentId: string,
		capabilityIds: string[],
		grantedBy: string | null,
		grantOpts?: {
			clearExisting?: boolean;
			status?: "active" | "pending";
			reason?: string | null;
		},
		ttlContext?: {
			hostId: string | null;
			userId: string | null;
		},
	): Promise<void> => {
		if (grantOpts?.clearExisting) {
			await deleteGrantsByAgent(agentId);
		}

		const status = grantOpts?.status ?? "active";
		const now = new Date();
		for (const cap of capabilityIds) {
			const expiresAt =
				status === "active" && ttlContext
					? await resolveGrantExpiresAt(opts, cap, {
							agentId,
							hostId: ttlContext.hostId,
							userId: ttlContext.userId,
						})
					: null;
			await adapter.create({
				model: TABLE.grant,
				data: {
					agentId,
					capability: cap,
					grantedBy,
					expiresAt,
					status,
					reason: grantOpts?.reason ?? null,
					createdAt: now,
					updatedAt: now,
				},
			});
		}
	};

	const findApprovalRequestById = (id: string) =>
		adapter.findOne<ApprovalRequest>({
			model: TABLE.approval,
			where: [{ field: "id", value: id }],
		});

	const findPendingApprovalsByUser = (userId: string) =>
		adapter.findMany<ApprovalRequest>({
			model: TABLE.approval,
			where: [
				{ field: "userId", value: userId },
				{ field: "status", value: "pending" },
			],
		});

	const findPendingApprovalsByAgent = (agentId: string) =>
		adapter.findMany<ApprovalRequest>({
			model: TABLE.approval,
			where: [
				{ field: "agentId", value: agentId },
				{ field: "status", value: "pending" },
			],
		});

	const createApprovalRequest = (data: Record<string, unknown>) =>
		adapter.create<Record<string, unknown>, ApprovalRequest>({
			model: TABLE.approval,
			data,
		});

	const updateApprovalRequest = (id: string, data: Record<string, unknown>) =>
		adapter.update({
			model: TABLE.approval,
			where: [{ field: "id", value: id }],
			update: data,
		});

	const checkSharedOrg = async (
		userA: string,
		userB: string,
	): Promise<boolean> => {
		try {
			const membershipsA = await adapter.findMany<{
				organizationId: string;
			}>({
				model: "member",
				where: [{ field: "userId", value: userA }],
			});
			if (membershipsA.length === 0) return false;

			for (const m of membershipsA) {
				const membershipsB = await adapter.findMany<{
					organizationId: string;
				}>({
					model: "member",
					where: [
						{ field: "userId", value: userB },
						{
							field: "organizationId",
							value: m.organizationId,
						},
					],
				});
				if (membershipsB.length > 0) return true;
			}
			return false;
		} catch {
			return false;
		}
	};

	/**
	 * Transparent reactivation (§2.5).
	 *
	 * When an expired agent presents a valid JWT, silently reactivate it
	 * instead of requiring a manual `/agent/reactivate` call. If the agent
	 * has a host, capability decay is applied: all existing grants are
	 * replaced with the host's current defaults.
	 */
	const transparentReactivation = async (
		agent: Agent,
	): Promise<Agent | null> => {
		if (!agent.publicKey) return null;

		const now = new Date();

		if (agent.hostId) {
			const host = await findHostById(agent.hostId);
			if (!host || host.status === "revoked") return null;

			const baseCaps = parseCapabilityIds(host.defaultCapabilities);
			await createGrantRows(
				agent.id,
				baseCaps,
				agent.userId,
				{ clearExisting: true },
				{ hostId: agent.hostId, userId: agent.userId },
			);
		}

		const expiresAt =
			opts.agentSessionTTL > 0
				? new Date(now.getTime() + opts.agentSessionTTL * 1000)
				: null;

		await updateAgent(agent.id, {
			status: "active",
			activatedAt: now,
			expiresAt,
			lastUsedAt: now,
			updatedAt: now,
		});

		return {
			...agent,
			status: "active" as const,
			activatedAt: now,
			expiresAt,
			lastUsedAt: now,
			updatedAt: now,
		};
	};

	return {
		findAgentById,
		findAgentByKidAndUser,
		findAgentsByHost,
		findAgentsByUser,
		createAgent,
		updateAgent,
		countActiveAgents,

		findHostById,
		findHostByKey,
		findHostsByEnrollmentTokenHash,
		findHostsForUser,
		createHost,
		updateHost,

		findGrantsByAgent,
		createGrant,
		updateGrant,
		deleteGrant,
		deleteGrantsByAgent,
		createGrantRows,

		findApprovalRequestById,
		findPendingApprovalsByUser,
		findPendingApprovalsByAgent,
		createApprovalRequest,
		updateApprovalRequest,

		checkSharedOrg,
		transparentReactivation,
	};
}

export type AgentAuthAdapter = ReturnType<typeof getAgentAuthAdapter>;
