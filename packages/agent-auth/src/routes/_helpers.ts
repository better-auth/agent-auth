import type { GenericEndpointContext } from "@better-auth/core";
import * as z from "zod";
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
	CapabilityConstraints,
	Constraints,
	DefaultHostCapabilitiesContext,
	NormalizedCapability,
	ResolvedAgentAuthOptions,
} from "../types";

// ── Capability parsing schemas (§2.13) ──────────────────────

const constraintPrimitiveZ = z.union([z.string(), z.number(), z.boolean()]);
const constraintOperatorValueZ = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(constraintPrimitiveZ),
]);

export const capabilityConstraintsZ = z.record(
	z.string(),
	z.union([constraintPrimitiveZ, z.record(z.string(), constraintOperatorValueZ)]),
);

export const capabilityItemZ = z.union([
	z.string(),
	z.object({
		name: z.string(),
		constraints: capabilityConstraintsZ.optional(),
	}),
]);

/**
 * Normalize mixed capability array from API input into separate
 * ID list and constraints map. See spec §2.13.
 */
export function normalizeCapabilities(
	caps: Array<string | { name: string; constraints?: CapabilityConstraints }>,
): { ids: string[]; constraintsMap: Map<string, CapabilityConstraints> } {
	const ids: string[] = [];
	const constraintsMap = new Map<string, CapabilityConstraints>();
	for (const c of caps) {
		if (typeof c === "string") {
			ids.push(c);
		} else {
			ids.push(c.name);
			if (c.constraints) {
				constraintsMap.set(c.name, c.constraints as CapabilityConstraints);
			}
		}
	}
	return { ids, constraintsMap };
}

/**
 * Resolve the device authorization page base URL from the configured
 * `deviceAuthorizationPage` option. Returns a full URL.
 */
export function resolveDeviceAuthPage(
	opts: ResolvedAgentAuthOptions,
	origin: string,
): string {
	const page = opts.deviceAuthorizationPage;
	if (page.startsWith("http://") || page.startsWith("https://")) {
		return page.replace(/\/+$/, "");
	}
	const path = page.startsWith("/") ? page : `/${page}`;
	return `${origin}${path}`;
}

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
		constraintsMap?: Map<string, Constraints | null>;
	},
	ttlContext?: {
		pluginOpts: ResolvedAgentAuthOptions;
		hostId: string | null;
		userId: string | null;
	},
	constraintsMap?: Map<string, CapabilityConstraints>,
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
		const constraints = grantOpts?.constraintsMap?.get(cap) ?? constraintsMap?.get(cap) ?? null;
		await adapter.create({
			model: TABLE.grant,
			data: {
				agentId,
				capability: cap,
				constraints,
				grantedBy,
				deniedBy: null,
				expiresAt,
				status,
				reason: grantOpts?.reason ?? null,
				createdAt: now,
				updatedAt: now,
			},
		});
	}
}

/**
 * Format grants for API response — `agent_capability_grants` array (§6.5).
 *
 * Active grants include full capability details (`description`, `input`, `output`)
 * when `capabilityDefs` is provided, plus effective `constraints` when scoped.
 * Pending grants include only `capability` and `status`.
 * Denied grants include `capability`, `status`, and optional `reason`.
 *
 * Set `compact: true` for introspect responses (§5.12) which return
 * only `capability` and `status` — no details, no constraints.
 */
export function formatGrantsResponse(
	grants: AgentCapabilityGrant[],
	capabilityDefs?: Capability[],
	opts?: { compact?: boolean },
): Array<Record<string, unknown>> {
	const defsMap = capabilityDefs
		? new Map(capabilityDefs.map((c) => [c.name, c]))
		: null;

	return grants.map((g) => {
		const base: Record<string, unknown> = {
			capability: g.capability,
			status: g.status,
		};

		if (opts?.compact) return base;

		if (g.status === "active") {
			if (g.grantedBy) base.granted_by = g.grantedBy;
			if (g.constraints) base.constraints = g.constraints;
			if (g.expiresAt) base.expires_at = new Date(g.expiresAt).toISOString();

			if (defsMap && defsMap.has(g.capability)) {
				const def = defsMap.get(g.capability)!;
				base.description = def.description;
				if (def.input) base.input = def.input;
				if (def.output) base.output = def.output;
			}
		}

		if (g.status === "denied" && g.reason) {
			base.reason = g.reason;
		}

		return base;
	});
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
		loginHint?: string;
		bindingMessage?: string;
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
					loginHint: context.loginHint ?? user.email,
					bindingMessage: context.bindingMessage ?? `Agent "${context.agentName}" requesting approval`,
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

	const approvalReq = await adapter.create<Record<string, unknown>, ApprovalRequest>({
		model: TABLE.approval,
		data: {
			method: "device_authorization",
			agentId: context.agentId,
			hostId: context.hostId,
			userId: context.userId,
			capabilities: capabilitiesStr,
			status: "pending",
			userCodeHash: codeHash,
			loginHint: context.loginHint ?? null,
			bindingMessage: context.bindingMessage ?? null,
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

	const pageBase = resolveDeviceAuthPage(opts, context.origin);

	return {
		method: "device_authorization",
		device_code: approvalReq.id,
		verification_uri: pageBase,
		verification_uri_complete: `${pageBase}?agent_id=${context.agentId}&code=${userCode}`,
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

export async function resolveDefaultHostCapabilities(
	opts: ResolvedAgentAuthOptions,
	context: DefaultHostCapabilitiesContext,
): Promise<string[]> {
	const val = opts.defaultHostCapabilities;
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

	const hasStaticList = opts.capabilities && opts.capabilities.length > 0;
	const hasCustomValidator = !!opts.validateCapabilities;

	if (!hasStaticList && !hasCustomValidator) {
		console.warn(
			`[agent-auth] Capabilities requested (${capabilityIds.join(", ")}) but no capabilities list or ` +
			"validateCapabilities function is configured. All names are accepted unchecked.",
		);
		return;
	}

	if (hasStaticList) {
		const known = new Set(opts.capabilities!.map((c) => c.name));
		const unknown = capabilityIds.filter((id) => !known.has(id));
		if (unknown.length > 0) {
			throw agentError(
				"BAD_REQUEST",
				ERR.INVALID_CAPABILITIES,
				`Unknown capabilities: ${unknown.join(", ")}`,
			);
		}
	}

	if (hasCustomValidator) {
		const valid = await opts.validateCapabilities!(capabilityIds);
		if (!valid) {
			throw agentError("BAD_REQUEST", ERR.INVALID_CAPABILITIES);
		}
	}
}

/**
 * Verify JWT `aud` claim (§4.3).
 *
 * Accepts the server's origin (for non-execution JWTs) and the full
 * execute endpoint URL (for execution JWTs where `aud` is the
 * resolved location per §2.15).
 *
 * When `expectedLocation` is provided (a single capability's
 * `location` URL), it is added to the accepted set. This keeps
 * validation scoped to the specific capability being accessed.
 */
export function verifyAudience(
	audValues: unknown,
	baseURL: string,
	headers?: Headers | null,
	trustProxy?: boolean,
	expectedLocation?: string,
): boolean {
	const parsedBase = new URL(baseURL);
	const configuredOrigin = parsedBase.origin;
	const accepted = new Set([configuredOrigin]);

	const basePath = parsedBase.pathname.replace(/\/$/, "");
	accepted.add(new URL(`${basePath}/capability/execute`, configuredOrigin).toString());

	const reqHost = headers?.get("host");
	if (reqHost) {
		const proto = trustProxy
			? (headers?.get("x-forwarded-proto") ?? parsedBase.protocol.replace(":", ""))
			: parsedBase.protocol.replace(":", "");
		const reqOrigin = `${proto}://${reqHost}`;
		accepted.add(reqOrigin);
		accepted.add(new URL(`${basePath}/capability/execute`, reqOrigin).toString());
	}
	if (expectedLocation) {
		accepted.add(expectedLocation);
	}
	const values = Array.isArray(audValues)
		? audValues
		: [audValues];
	return values.some((a) => accepted.has(String(a)));
}

/**
 * Look up the `location` URL for a specific capability (§2.15).
 * Returns `undefined` if the capability has no custom location.
 */
export function getCapabilityLocation(
	capabilities: Array<{ name: string; location?: string }> | undefined,
	capabilityName: string,
): string | undefined {
	if (!capabilities) return undefined;
	const cap = capabilities.find((c) => c.name === capabilityName);
	return cap?.location;
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
					update: { status: "revoked", updatedAt: now },
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
 * if the host is unclaimed or owned by a different user.
 *
 * When the host is already linked to a different user, all agents on
 * that host belonging to the previous user are revoked and the host
 * is transferred to the new approving user.
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

		if (host && host.userId !== params.userId) {
			const previousUserId = host.userId ?? null;

			if (previousUserId) {
				await revokeAgentsForUserOnHost(adapter, opts, ctx, {
					hostId: host.id,
					userId: previousUserId,
					excludeAgentId: params.agentId,
				});
			}

			await claimAutonomousAgents(adapter, opts, ctx, {
				hostId: host.id,
				userId: params.userId,
			});

			await opts.onHostClaimed?.({
				ctx,
				hostId: host.id,
				userId: params.userId,
				previousUserId,
			});

			const hostUpdate: Record<string, unknown> = {
				userId: params.userId,
				status: "active",
				activatedAt: now,
				updatedAt: now,
			};

			const newDefaultCaps = await resolveDefaultHostCapabilities(opts, {
				ctx,
				mode: "delegated",
				userId: params.userId,
				hostId: host.id,
				hostName: host.name,
			});
			hostUpdate.defaultCapabilities = newDefaultCaps;

			await adapter.update({
				model: TABLE.host,
				where: [{ field: "id", value: host.id }],
				update: hostUpdate,
			});

			emit(opts, {
				type: "host.claimed",
				actorId: params.userId,
				hostId: host.id,
				metadata: { previousUserId },
			}, ctx);
		}
	}
}

/**
 * Revoke all active/pending agents on a host that belong to a specific user.
 * Used when a host is being transferred to a new user.
 */
async function revokeAgentsForUserOnHost(
	adapter: AdapterFindMany & AdapterUpdate,
	opts: ResolvedAgentAuthOptions,
	ctx: GenericEndpointContext,
	params: {
		hostId: string;
		userId: string;
		excludeAgentId?: string;
	},
): Promise<void> {
	const agents = await adapter.findMany<Agent>({
		model: TABLE.agent,
		where: [
			{ field: "hostId", value: params.hostId },
			{ field: "userId", value: params.userId },
		],
	});

	const now = new Date();

	for (const agent of agents) {
		if (agent.id === params.excludeAgentId) continue;
		if (agent.status === "revoked" || agent.status === "rejected") continue;

		const grants = await adapter.findMany<AgentCapabilityGrant>({
			model: TABLE.grant,
			where: [{ field: "agentId", value: agent.id }],
		});

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
				status: "revoked",
				updatedAt: now,
			},
		});

		emit(opts, {
			type: "agent.revoked",
			actorId: params.userId,
			agentId: agent.id,
			hostId: params.hostId,
			metadata: { reason: "host_transferred" },
		}, ctx);
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
