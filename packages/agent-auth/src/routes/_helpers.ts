import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { TABLE, DEFAULTS } from "../constants";
import { AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { generateUserCode } from "../utils/approval";
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
	AgentCapabilityGrant,
	AgentHost,
	CibaAuthRequest,
	DynamicHostDefaultCapabilityIdsContext,
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
	for (const capabilityId of capabilityIds) {
		const expiresAt =
			status === "active" && ttlContext
				? await resolveGrantExpiresAt(
						ttlContext.pluginOpts,
						capabilityId,
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
				capabilityId,
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

/** Format grants for API response — `agent_capability_grants` array (§6.5). */
export function formatGrantsResponse(
	grants: AgentCapabilityGrant[],
): Array<{
	capability_id: string;
	status: string;
	granted_by?: string | null;
	expires_at?: string | null;
}> {
	return grants.map((g) => ({
		capability_id: g.capabilityId,
		status: g.status,
		...(g.grantedBy ? { granted_by: g.grantedBy } : {}),
		...(g.expiresAt
			? { expires_at: new Date(g.expiresAt).toISOString() }
			: {}),
	}));
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
	adapter: AdapterCreate,
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
		capabilityIds: string[];
		preferredMethod?: string;
	},
): Promise<Record<string, unknown>> {
	const method = await opts.resolveApprovalMethod({
		userId: context.userId,
		agentName: context.agentName,
		hostId: context.hostId,
		capabilityIds: context.capabilityIds,
		preferredMethod: context.preferredMethod,
	});

	if (method === "ciba" && context.userId) {
		const user = await internalAdapter.findUserById(context.userId);
		if (user) {
			const now = new Date();
			const expiresAt = new Date(
				now.getTime() + DEFAULTS.cibaExpiresIn * 1000,
			);
			const cibaRequest = await adapter.create<
				Record<string, unknown>,
				CibaAuthRequest
			>({
				model: TABLE.ciba,
				data: {
					clientId: "agent-auth",
					loginHint: user.email,
					userId: context.userId,
					agentId: context.agentId,
					capabilityIds: context.capabilityIds.join(" "),
					bindingMessage: `Agent "${context.agentName}" requesting approval`,
					clientNotificationToken: null,
					clientNotificationEndpoint: null,
					deliveryMode: "poll",
					status: "pending",
					interval: DEFAULTS.cibaInterval,
					lastPolledAt: null,
					expiresAt,
					createdAt: now,
					updatedAt: now,
				},
			});
			return {
				method: "ciba",
				expires_in: DEFAULTS.cibaExpiresIn,
				interval: DEFAULTS.cibaInterval,
			};
		}
	}

	const userCode = generateUserCode();
	return {
		method: "device_authorization",
		verification_uri: `${context.origin}/device/capabilities`,
		verification_uri_complete: `${context.origin}/device/capabilities?agent_id=${context.agentId}&code=${userCode}`,
		user_code: userCode,
		expires_in: 300,
		interval: 5,
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

export async function resolveDynamicHostDefaultCapabilityIds(
	opts: ResolvedAgentAuthOptions,
	context: DynamicHostDefaultCapabilityIdsContext,
): Promise<string[]> {
	const val = opts.dynamicHostDefaultCapabilityIds;
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
		throw new APIError("BAD_REQUEST", {
			message: `Key algorithm "${keyAlg}" is not allowed. Accepted: ${allowedAlgorithms.join(", ")}`,
		});
	}
}

export function validateCapabilityIds(
	capabilityIds: string[],
	opts: ResolvedAgentAuthOptions,
): void {
	if (capabilityIds.length > 0 && opts.blockedCapabilityIds.length > 0) {
		const blocked = findBlockedCapabilities(
			capabilityIds,
			opts.blockedCapabilityIds,
		);
		if (blocked.length > 0) {
			throw new APIError("BAD_REQUEST", {
				message: `Blocked capabilities: ${blocked.join(", ")}`,
			});
		}
	}
}

export async function validateCapabilitiesExist(
	capabilityIds: string[],
	opts: ResolvedAgentAuthOptions,
): Promise<void> {
	if (capabilityIds.length > 0 && opts.validateCapabilities) {
		const valid = await opts.validateCapabilities(capabilityIds);
		if (!valid) {
			throw APIError.from("BAD_REQUEST", ERR.INVALID_CAPABILITIES);
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
 * Activate a pending agent and link its host to the approving user
 * if the host is unclaimed. Shared by device-auth and CIBA approval paths.
 */
export async function activatePendingAgent(
	adapter: AdapterFindOne & AdapterUpdate,
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
 * Bulk-resolve any pending CIBA requests for an agent.
 * Used by the device-auth approval path to keep CIBA state in sync.
 */
export async function resolvePendingCibaRequests(
	adapter: AdapterFindMany & AdapterUpdate,
	params: {
		agentId: string;
		status: "approved" | "denied";
	},
): Promise<void> {
	const now = new Date();
	const pending = await adapter.findMany<CibaAuthRequest>({
		model: TABLE.ciba,
		where: [
			{ field: "agentId", value: params.agentId },
			{ field: "status", value: "pending" },
		],
	});
	for (const ciba of pending) {
		await adapter.update({
			model: TABLE.ciba,
			where: [{ field: "id", value: ciba.id }],
			update: { status: params.status, updatedAt: now },
		});
	}
}
