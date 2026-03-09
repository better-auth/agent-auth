import type { GenericEndpointContext } from "@better-auth/core";
import { TABLE, DEFAULTS } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { generateUserCode, hashToken } from "../utils/approval";
import { resolveGrantExpiresAt } from "../utils/grant-ttl";
import {
	findBlockedCapabilities,
} from "../utils/capabilities";
import type {
	AdapterCreate,
	AdapterDelete,
	AdapterFindMany,
	AdapterFindOne,
	AdapterUpdate,
	Agent,
	AgentCapabilityGrant,
	AgentHost,
	ApprovalRequest,
	Capability,
	DynamicHostDefaultCapabilitiesContext,
	ResolvedAgentAuthOptions,
} from "../types";

export async function findHostByKey(
	adapter: AdapterFindOne,
	publicKey: Record<string, unknown>,
): Promise<AgentHost | null> {
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
		where: [{ field: "publicKey", value: JSON.stringify(publicKey) }],
	});
}

const MEMBER_TABLE = "member";

export async function checkSharedOrg(
	adapter: AdapterFindMany,
	userA: string,
	userB: string,
): Promise<boolean> {
	try {
		const membershipsA = await adapter.findMany<{
			organizationId: string;
		}>({
			model: MEMBER_TABLE,
			where: [{ field: "userId", value: userA }],
		});
		if (membershipsA.length === 0) return false;

		for (const m of membershipsA) {
			const membershipsB = await adapter.findMany<{
				organizationId: string;
			}>({
				model: MEMBER_TABLE,
				where: [
					{ field: "userId", value: userB },
					{ field: "organizationId", value: m.organizationId },
				],
			});
			if (membershipsB.length > 0) return true;
		}
		return false;
	} catch {
		return false;
	}
}

export async function createGrantRows(
	adapter: AdapterCreate & AdapterDelete & AdapterFindMany,
	agentId: string,
	capabilityIds: string[],
	grantedBy: string | null,
	grantOpts?: {
		clearExisting?: boolean;
		status?: "active" | "pending";
		reason?: string | null;
	},
	ttlContext?: {
		pluginOpts: ResolvedAgentAuthOptions;
		hostId: string | null;
		userId: string | null;
	},
): Promise<void> {
	if (grantOpts?.clearExisting) {
		const existing = await adapter.findMany<{ id: string }>({
			model: TABLE.grant,
			where: [{ field: "agentId", value: agentId }],
		});
		for (const g of existing) {
			await adapter.delete({
				model: TABLE.grant,
				where: [{ field: "id", value: g.id }],
			});
		}
	}

	const status = grantOpts?.status ?? "active";
	const now = new Date();
	for (const cap of capabilityIds) {
		const expiresAt =
			status === "active" && ttlContext
				? await resolveGrantExpiresAt(
						ttlContext.pluginOpts,
						cap,
						{
							agentId,
							hostId: ttlContext.hostId,
							userId: ttlContext.userId,
						},
					)
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
}

/** Format grants for API response — `agent_capability_grants` array (§6.5).
 *
 * When `capabilityDefs` is provided, active grants are enriched with the
 * full capability definition (including `input` schema) so the agent
 * gets schemas at the moment it's granted access — zero extra calls.
 */
export function formatGrantsResponse(
	grants: AgentCapabilityGrant[],
	capabilityDefs?: Capability[],
): Array<{
	capability: string;
	status: string;
	granted_by?: string | null;
	expires_at?: string | null;
	definition?: Omit<Capability, "grant_status">;
}> {
	const defsMap = capabilityDefs
		? new Map(capabilityDefs.map((c) => [c.name, c]))
		: null;

	return grants.map((g) => ({
		capability: g.capability,
		status: g.status,
		...(g.grantedBy ? { granted_by: g.grantedBy } : {}),
		...(g.expiresAt
			? { expires_at: new Date(g.expiresAt).toISOString() }
			: {}),
		...(defsMap && g.status === "active" && defsMap.has(g.capability)
			? { definition: stripGrantStatus(defsMap.get(g.capability)!) }
			: {}),
	}));
}

function stripGrantStatus(cap: Capability): Omit<Capability, "grant_status"> {
	const { grant_status, ...rest } = cap;
	return rest;
}

/** Filter grants to only active, non-expired ones. */
export function activeGrants(
	grants: AgentCapabilityGrant[],
): AgentCapabilityGrant[] {
	const now = new Date();
	return grants.filter(
		(g) =>
			g.status === "active" &&
			(!g.expiresAt || new Date(g.expiresAt) > now),
	);
}

export async function buildApprovalInfo(
	opts: ResolvedAgentAuthOptions,
	adapter: AdapterCreate & AdapterUpdate,
	internalAdapter: {
		findUserById: (
			id: string,
		) => Promise<{ id: string; email: string } | null>;
	},
	context: {
		origin: string;
		agentId: string;
		userId: string | null;
		agentName: string;
		hostId: string | null;
		capabilities: string[];
		preferredMethod?: string;
	},
): Promise<Record<string, unknown>> {
	const resolved = await opts.resolveApprovalMethod({
		userId: context.userId,
		agentName: context.agentName,
		hostId: context.hostId,
		capabilities: context.capabilities,
		preferredMethod: context.preferredMethod,
		supportedMethods: opts.approvalMethods,
	});

	const method = opts.approvalMethods.includes(resolved)
		? resolved
		: "device_authorization";

	const now = new Date();
	const expiresIn = DEFAULTS.cibaExpiresIn;
	const interval = DEFAULTS.cibaInterval;
	const expiresAt = new Date(now.getTime() + expiresIn * 1000);
	const capabilitiesStr = context.capabilities.join(" ") || null;

	if (method === "ciba" && context.userId) {
		const user = await internalAdapter.findUserById(context.userId);
		if (user) {
			await adapter.create<Record<string, unknown>, ApprovalRequest>({
				model: TABLE.approval,
				data: {
					method: "ciba",
					agentId: context.agentId,
					hostId: context.hostId,
					userId: context.userId,
					capabilities: capabilitiesStr,
					status: "pending",
					userCodeHash: null,
					loginHint: user.email,
					bindingMessage: `Agent "${context.agentName}" requesting approval`,
					clientNotificationToken: null,
					clientNotificationEndpoint: null,
					deliveryMode: "poll",
					interval,
					lastPolledAt: null,
					expiresAt,
					createdAt: now,
					updatedAt: now,
				},
			});
			return {
				method: "ciba",
				expires_in: expiresIn,
				interval,
			};
		}
	}

	const userCode = generateUserCode();
	const codeHash = await hashToken(userCode);

	await adapter.create<Record<string, unknown>, ApprovalRequest>({
		model: TABLE.approval,
		data: {
			method: "device_authorization",
			agentId: context.agentId,
			hostId: context.hostId,
			userId: context.userId,
			capabilities: capabilitiesStr,
			status: "pending",
			userCodeHash: codeHash,
			loginHint: null,
			bindingMessage: null,
			clientNotificationToken: null,
			clientNotificationEndpoint: null,
			deliveryMode: null,
			interval,
			lastPolledAt: null,
			expiresAt,
			createdAt: now,
			updatedAt: now,
		},
	});

	return {
		method: "device_authorization",
		device_code: context.agentId,
		verification_uri: `${context.origin}/device/capabilities`,
		verification_uri_complete: `${context.origin}/device/capabilities?agent_id=${context.agentId}&code=${userCode}`,
		user_code: userCode,
		expires_in: expiresIn,
		interval,
	};
}

export async function isDynamicHostAllowed(
	opts: ResolvedAgentAuthOptions,
	ctx: GenericEndpointContext,
): Promise<boolean> {
	const flag = opts.allowDynamicHostRegistration;
	if (typeof flag === "function") return flag(ctx);
	return flag;
}

export async function resolveDynamicHostDefaultCapabilities(
	opts: ResolvedAgentAuthOptions,
	context: DynamicHostDefaultCapabilitiesContext,
): Promise<string[]> {
	const val = opts.dynamicHostDefaultCapabilities;
	if (typeof val === "function") return val(context);
	return val;
}

export function validateKeyAlgorithm(
	publicKey: Record<string, unknown>,
	allowedAlgorithms: string[],
): void {
	const kty = publicKey.kty as string | undefined;
	const crv = publicKey.crv as string | undefined;
	const keyAlg = crv ?? kty;
	if (!keyAlg || !allowedAlgorithms.includes(keyAlg)) {
	throw agentError(
		"BAD_REQUEST",
		ERR.UNSUPPORTED_ALGORITHM,
		`Key algorithm "${keyAlg}" is not allowed. Accepted: ${allowedAlgorithms.join(", ")}`,
	);
	}
}

export function validateCapabilityIds(
	capabilityIds: string[],
	opts: ResolvedAgentAuthOptions,
): void {
	if (capabilityIds.length > 0 && opts.blockedCapabilities.length > 0) {
		const blocked = findBlockedCapabilities(
			capabilityIds,
			opts.blockedCapabilities,
		);
		if (blocked.length > 0) {
		throw agentError(
			"BAD_REQUEST",
			ERR.CAPABILITY_BLOCKED,
			`Blocked capabilities: ${blocked.join(", ")}`,
		);
		}
	}
}

export async function validateCapabilitiesExist(
	capabilityIds: string[],
	opts: ResolvedAgentAuthOptions,
): Promise<void> {
	if (capabilityIds.length === 0) return;

	if (opts.capabilities && opts.capabilities.length > 0) {
		const known = new Set(opts.capabilities.map((c) => c.name));
		const unknown = capabilityIds.filter((id) => !known.has(id));
		if (unknown.length > 0) {
			throw agentError(
				"BAD_REQUEST",
				ERR.INVALID_CAPABILITIES,
				`Unknown capabilities: ${unknown.join(", ")}`,
			);
		}
	}

	if (opts.validateCapabilities) {
		const valid = await opts.validateCapabilities(capabilityIds);
		if (!valid) {
			throw agentError("BAD_REQUEST", ERR.INVALID_CAPABILITIES);
		}
	}
}

export function verifyAudience(
	audValues: unknown,
	baseURL: string,
	headers?: Headers | null,
): boolean {
	const configuredOrigin = new URL(baseURL).origin;
	const acceptedOrigins = new Set([configuredOrigin]);
	const reqHost = headers?.get("host");
	const reqProto = headers?.get("x-forwarded-proto") ?? "http";
	if (reqHost) {
		acceptedOrigins.add(`${reqProto}://${reqHost}`);
	}
	const values = Array.isArray(audValues)
		? audValues
		: [audValues];
	return values.some((a) => acceptedOrigins.has(String(a)));
}

/**
 * Claim all active autonomous agents under a host (§3.4).
 * Called when a previously unlinked host acquires a user_id.
 * Each autonomous agent's capabilities are revoked and status set to "claimed".
 */
export async function claimAutonomousAgents(
	adapter: AdapterFindMany & AdapterUpdate,
	opts: ResolvedAgentAuthOptions,
	ctx: GenericEndpointContext,
	params: {
		hostId: string;
		userId: string;
	},
): Promise<void> {
	const agents = await adapter.findMany<Agent>({
		model: TABLE.agent,
		where: [{ field: "hostId", value: params.hostId }],
	});

	const now = new Date();
	const autonomous = agents.filter(
		(a) => a.mode === "autonomous" && a.status === "active",
	);

	for (const agent of autonomous) {
		const grants = await adapter.findMany<AgentCapabilityGrant>({
			model: TABLE.grant,
			where: [{ field: "agentId", value: agent.id }],
		});

		const activeCapabilities = grants
			.filter((g) => g.status === "active")
			.map((g) => g.capability);

		for (const g of grants) {
			if (g.status === "active" || g.status === "pending") {
				await adapter.update({
					model: TABLE.grant,
					where: [{ field: "id", value: g.id }],
					update: { status: "denied", updatedAt: now },
				});
			}
		}

		await adapter.update({
			model: TABLE.agent,
			where: [{ field: "id", value: agent.id }],
			update: {
				status: "claimed",
				userId: params.userId,
				updatedAt: now,
			},
		});

		await opts.onAutonomousAgentClaimed?.({
			ctx,
			agentId: agent.id,
			hostId: params.hostId,
			userId: params.userId,
			agentName: agent.name,
			capabilities: activeCapabilities,
		});

		emit(opts, {
			type: "agent.claimed",
			actorId: params.userId,
			agentId: agent.id,
			hostId: params.hostId,
			metadata: { capabilities: activeCapabilities },
		}, ctx);
	}
}

/**
 * Activate a pending agent and link its host to the approving user
 * if the host is unclaimed. Shared by device-auth and CIBA approval paths.
 */
export async function activatePendingAgent(
	adapter: AdapterFindOne & AdapterFindMany & AdapterUpdate,
	opts: ResolvedAgentAuthOptions,
	ctx: GenericEndpointContext,
	params: {
		agentId: string;
		userId: string;
		agent: { status: string; hostId: string };
	},
): Promise<void> {
	if (params.agent.status !== "pending") return;

	const now = new Date();
	const expiresAt =
		opts.agentSessionTTL > 0
			? new Date(now.getTime() + opts.agentSessionTTL * 1000)
			: null;

	await adapter.update({
		model: TABLE.agent,
		where: [{ field: "id", value: params.agentId }],
		update: {
			status: "active",
			userId: params.userId,
			activatedAt: now,
			expiresAt,
			updatedAt: now,
		},
	});

	if (params.agent.hostId) {
		const host = await adapter.findOne<AgentHost>({
			model: TABLE.host,
			where: [{ field: "id", value: params.agent.hostId }],
		});
		if (host && !host.userId) {
			await claimAutonomousAgents(adapter, opts, ctx, {
				hostId: host.id,
				userId: params.userId,
			});
			await opts.onHostClaimed?.({
				ctx,
				hostId: host.id,
				userId: params.userId,
				previousUserId: null,
			});
			await adapter.update({
				model: TABLE.host,
				where: [{ field: "id", value: host.id }],
				update: {
					userId: params.userId,
					status: "active",
					activatedAt: now,
					updatedAt: now,
				},
			});
			emit(opts, {
				type: "host.claimed",
				actorId: params.userId,
				hostId: host.id,
				metadata: { previousUserId: null },
			}, ctx);
		}
	}
}

/**
 * Bulk-resolve any pending approval requests for an agent.
 * Called after an agent is approved/denied so all outstanding
 * approval requests (device auth + CIBA) are kept in sync.
 */
export async function resolvePendingApprovalRequests(
	adapter: AdapterFindMany & AdapterUpdate,
	params: {
		agentId: string;
		status: "approved" | "denied";
		excludeId?: string;
	},
): Promise<ApprovalRequest[]> {
	const now = new Date();
	const pending = await adapter.findMany<ApprovalRequest>({
		model: TABLE.approval,
		where: [
			{ field: "agentId", value: params.agentId },
			{ field: "status", value: "pending" },
		],
	});
	const resolved: ApprovalRequest[] = [];
	for (const req of pending) {
		if (params.excludeId && req.id === params.excludeId) continue;
		await adapter.update({
			model: TABLE.approval,
			where: [{ field: "id", value: req.id }],
			update: { status: params.status, updatedAt: now },
		});
		resolved.push({ ...req, status: params.status });
	}
	return resolved;
}

/**
 * Fire-and-forget CIBA push/ping notification for resolved approval requests.
 */
export async function deliverApprovalNotifications(
	requests: ApprovalRequest[],
	payload: Record<string, unknown>,
): Promise<void> {
	for (const req of requests) {
		if (
			req.method !== "ciba" ||
			!req.clientNotificationEndpoint ||
			!req.clientNotificationToken
		)
			continue;
		if (req.deliveryMode !== "ping" && req.deliveryMode !== "push")
			continue;
		try {
			await globalThis.fetch(req.clientNotificationEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${req.clientNotificationToken}`,
				},
				body: JSON.stringify(payload),
			});
		} catch {
			// fire-and-forget
		}
	}
}
