import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { sessionMiddleware } from "better-auth/api";

import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { hashToken, normalizeUserCode } from "../utils/approval";
import { resolveGrantExpiresAt } from "../utils/grant-ttl";
import { findBlockedCapabilities } from "../utils/capabilities";
import {
	generateApprovalChallenge,
	verifyApprovalResponse,
	type StoredPasskey,
	type AuthenticationResponseJSON,
} from "../utils/webauthn";
import type { WebAuthnChallengeCache } from "../utils/webauthn-challenge-cache";
import {
	activatePendingAgent,
	resolvePendingApprovalRequests,
	deliverApprovalNotifications,
} from "./_helpers";
import type {
	Agent,
	AgentHost,
	AgentCapabilityGrant,
	ApprovalRequest,
	Capability,
	ResolvedAgentAuthOptions,
} from "../types";

/**
 * POST /agent/approve-capability
 *
 * Unified user-facing approval endpoint for both device authorization
 * and CIBA flows. Optionally requires a fresh session.
 *
 * Accepts `agent_id` directly, or `approval_id` to resolve via an
 * approval request record (for CIBA flows where the UI shows the
 * approval request ID).
 */
export function approveCapability(
	opts: ResolvedAgentAuthOptions,
	challengeCache: WebAuthnChallengeCache | null = null,
) {
	return createAuthEndpoint(
		"/agent/approve-capability",
		{
			method: "POST",
			body: z.object({
				agent_id: z.string().optional(),
				approval_id: z.string().optional(),
				user_code: z.string().optional(),
				action: z.enum(["approve", "deny"]),
				capabilities: z.array(z.string()).optional(),
				ttl: z.number().positive().optional(),
				reason: z.string().optional(),
				webauthn_response: z
					.record(z.string(), z.unknown())
					.optional(),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Approve or deny a pending agent registration or capability request.",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			const {
				agent_id: directAgentId,
				approval_id: approvalId,
				user_code: userCode,
				action,
				capabilities: userCapIds,
				ttl: explicitTTL,
				reason: denyReason,
				webauthn_response: webauthnResponse,
			} = ctx.body;

			let agentId: string;
			let approvalRequest: ApprovalRequest | null = null;

			if (approvalId) {
				approvalRequest =
					await ctx.context.adapter.findOne<ApprovalRequest>({
						model: TABLE.approval,
						where: [{ field: "id", value: approvalId }],
					});
				if (!approvalRequest || !approvalRequest.agentId) {
					throw agentError("NOT_FOUND", ERR.CAPABILITY_REQUEST_NOT_FOUND);
				}
				agentId = approvalRequest.agentId;
			} else if (directAgentId) {
				agentId = directAgentId;
			} else {
				throw agentError("BAD_REQUEST", ERR.INVALID_REQUEST, "Either agent_id or approval_id is required.");
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: TABLE.agent,
				where: [{ field: "id", value: agentId }],
			});

			if (!agent) {
				throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
			}

			if (agent.userId && agent.userId !== session.user.id) {
				throw agentError("FORBIDDEN", ERR.CAPABILITY_REQUEST_OWNER_MISMATCH);
			}

			// Resolve device_authorization approval requests for user_code verification
			let deviceApprovalRequests: ApprovalRequest[] = [];
			if (approvalRequest) {
				deviceApprovalRequests = approvalRequest.method === "device_authorization"
					? [approvalRequest]
					: [];
			} else {
				deviceApprovalRequests = await ctx.context.adapter.findMany<ApprovalRequest>({
					model: TABLE.approval,
					where: [
						{ field: "agentId", value: agentId },
						{ field: "status", value: "pending" },
						{ field: "method", value: "device_authorization" },
					],
				});
			}

			// Check expiry on any resolved approval request
			const now = new Date();
			for (const req of deviceApprovalRequests) {
				if (req.expiresAt && new Date(req.expiresAt) < now) {
					throw agentError("FORBIDDEN", ERR.APPROVAL_EXPIRED);
				}
			}

			// Verify user_code for device_authorization approvals (approve only — deny is safe)
			const hasDeviceApproval = deviceApprovalRequests.some(
				(r) => r.userCodeHash,
			);
			if (action === "approve" && hasDeviceApproval) {
				if (!userCode) {
					throw agentError("BAD_REQUEST", ERR.INVALID_USER_CODE);
				}
				const normalized = normalizeUserCode(userCode);
				const submittedHash = await hashToken(normalized);
				const matched = deviceApprovalRequests.some(
					(r) => r.userCodeHash === submittedHash,
				);
				if (!matched) {
					throw agentError("FORBIDDEN", ERR.INVALID_USER_CODE);
				}
			}

			const allGrants =
				await ctx.context.adapter.findMany<AgentCapabilityGrant>({
					model: TABLE.grant,
					where: [{ field: "agentId", value: agentId }],
				});

			const pendingGrants = allGrants.filter(
				(g) => g.status === "pending",
			);

			const agentIsPending = agent.status === "pending";

			if (pendingGrants.length === 0 && !agentIsPending) {
				throw agentError("PRECONDITION_FAILED", ERR.CAPABILITY_REQUEST_ALREADY_RESOLVED);
			}

			if (action === "deny") {
				for (const grant of pendingGrants) {
					await ctx.context.adapter.update({
						model: TABLE.grant,
						where: [{ field: "id", value: grant.id }],
						update: { status: "denied", updatedAt: now },
					});
				}

				const agentUpdate: Record<string, unknown> = { updatedAt: now };
				if (agentIsPending) {
					agentUpdate.status = "rejected";
					agentUpdate.userId = session.user.id;
				}
				if (denyReason) {
					const existing = agent.metadata ?? {};
					agentUpdate.metadata = { ...existing, denyReason };
				}
				if (Object.keys(agentUpdate).length > 1) {
					await ctx.context.adapter.update({
						model: TABLE.agent,
						where: [{ field: "id", value: agentId }],
						update: agentUpdate,
					});
				}

				const errorDescription = denyReason
					? `User denied the authorization request: ${denyReason}`
					: "User denied the authorization request.";

				const resolved =
					await resolvePendingApprovalRequests(
						ctx.context.adapter,
						{ agentId, status: "denied" },
					);

				void deliverApprovalNotifications(resolved, {
					agent_id: agentId,
					status: "denied",
					error: "access_denied",
					error_description: errorDescription,
				});

				emit(opts, {
					type: "capability.denied",
					actorId: session.user.id,
					agentId,
					metadata: {
						capabilities: pendingGrants.map(
							(g) => g.capability,
						),
						...(denyReason ? { reason: denyReason } : {}),
					},
				}, ctx);

				return ctx.json({ status: "denied" });
			}

			// Approve
			const approvedCapIds = userCapIds
				? new Set(userCapIds)
				: new Set(pendingGrants.map((g) => g.capability));

			const capabilities = [...approvedCapIds];
			const freshWindow =
				typeof opts.freshSessionWindow === "function"
					? await opts.freshSessionWindow({ ctx, capabilities })
					: opts.freshSessionWindow;

			if (freshWindow > 0) {
				const sessionCreated = session.session?.createdAt
					? new Date(session.session.createdAt).getTime()
					: 0;
				const age = (Date.now() - sessionCreated) / 1000;
				if (age > freshWindow) {
					return ctx.json(
						{
							error: "fresh_session_required",
							error_description:
								"A fresh authentication session is required for this operation. Please re-authenticate and try again.",
							max_age: freshWindow,
							session_age: Math.floor(age),
						},
						{ status: 403 },
					);
				}
			}

		if (opts.proofOfPresence.enabled && challengeCache) {
			// Context-aware approval strength:
			//   host pending  → webauthn  (first-time host approval)
			//   agent active + new grants → webauthn  (new scope request)
			//   agent pending + host active → session  (agent creation under trusted host)
			let requiresWebAuthn = false;

			if (agentIsPending && agent.hostId) {
				const host = await ctx.context.adapter.findOne<AgentHost>({
					model: TABLE.host,
					where: [{ field: "id", value: agent.hostId }],
				});
				requiresWebAuthn = !host || host.status === "pending";
			} else if (!agentIsPending && pendingGrants.length > 0) {
				requiresWebAuthn = true;
			}

			// Per-capability overrides can still escalate to webauthn
			if (!requiresWebAuthn) {
				const capDefs = opts.capabilities ?? [];
				const capDefMap = new Map<string, Capability>(
					capDefs.map((c) => [c.name, c]),
				);
				requiresWebAuthn = capabilities.some((capId) => {
					const def = capDefMap.get(capId);
					return def?.approvalStrength === "webauthn";
				});
			}

			if (requiresWebAuthn) {
				let passkeys: StoredPasskey[] = [];
				try {
					passkeys =
						await ctx.context.adapter.findMany<StoredPasskey>({
							model: "passkey",
							where: [
								{ field: "userId", value: session.user.id },
							],
						});
				} catch {
					// passkey table doesn't exist (passkey plugin not installed)
				}

				if (passkeys.length === 0) {
					return ctx.json(
						{
							error: "webauthn_not_enrolled",
							error_description:
								"No passkeys registered. Register a passkey before approving capabilities that require proof of physical presence.",
						},
						{ status: 403 },
					);
				}

				if (!webauthnResponse) {
					const { options } = await generateApprovalChallenge(
						opts.proofOfPresence,
						passkeys,
					);

					challengeCache.set(
						session.user.id,
						agentId,
						options.challenge,
					);

					return ctx.json(
						{
							error: "webauthn_required",
							error_description:
								"This approval requires proof of physical presence. Complete the WebAuthn challenge.",
							webauthn_options: options,
						},
						{ status: 403 },
					);
				}

				const expectedChallenge = challengeCache.consume(
					session.user.id,
					agentId,
				);

				if (!expectedChallenge) {
					throw agentError("FORBIDDEN", ERR.WEBAUTHN_VERIFICATION_FAILED, "WebAuthn challenge expired or not found. Request a new challenge.");
				}

				const assertionResponse =
					webauthnResponse as unknown as AuthenticationResponseJSON;
				const matchingPasskey = passkeys.find(
					(pk) => pk.credentialID === assertionResponse.id,
				);

				if (!matchingPasskey) {
					throw agentError("FORBIDDEN", ERR.WEBAUTHN_VERIFICATION_FAILED, "WebAuthn credential not recognized.");
				}

				try {
					const verification = await verifyApprovalResponse(
						opts.proofOfPresence,
						assertionResponse,
						expectedChallenge,
						matchingPasskey,
					);

					if (!verification.verified) {
						throw agentError("FORBIDDEN", ERR.WEBAUTHN_VERIFICATION_FAILED, "WebAuthn verification failed.");
					}

					await ctx.context.adapter.update({
						model: "passkey",
						where: [
							{ field: "id", value: matchingPasskey.id },
						],
						update: {
							counter:
								verification.authenticationInfo.newCounter,
						},
					});
				} catch (error) {
					if (error instanceof APIError) throw error;
					throw agentError("FORBIDDEN", ERR.WEBAUTHN_VERIFICATION_FAILED, "WebAuthn assertion verification failed.");
				}
			}
		}

		if (opts.blockedCapabilities.length > 0) {
			const blocked = findBlockedCapabilities(
				[...approvedCapIds],
				opts.blockedCapabilities,
			);
			if (blocked.length > 0) {
				throw agentError("BAD_REQUEST", ERR.CAPABILITY_BLOCKED, `Blocked capabilities: ${blocked.join(", ")}`);
			}
		}

			const alreadyActive = new Set(
				allGrants
					.filter((g) => g.status === "active")
					.map((g) => g.capability),
			);
			const added: string[] = [];

			for (const grant of pendingGrants) {
				if (approvedCapIds.has(grant.capability)) {
					if (alreadyActive.has(grant.capability)) {
						await ctx.context.adapter.delete({
							model: TABLE.grant,
							where: [{ field: "id", value: grant.id }],
						});
					} else {
						const expiresAt = await resolveGrantExpiresAt(
							opts,
							grant.capability,
							{
								agentId,
								hostId: agent.hostId,
								userId: agent.userId,
							},
							explicitTTL,
						);
						await ctx.context.adapter.update({
							model: TABLE.grant,
							where: [{ field: "id", value: grant.id }],
							update: {
								status: "active",
								expiresAt,
								grantedBy: session.user.id,
								updatedAt: now,
							},
						});
						alreadyActive.add(grant.capability);
						added.push(grant.capability);
					}
				} else {
					await ctx.context.adapter.update({
						model: TABLE.grant,
						where: [{ field: "id", value: grant.id }],
						update: { status: "denied", updatedAt: now },
					});
				}
			}

			const resolved = await resolvePendingApprovalRequests(
				ctx.context.adapter,
				{
					agentId,
					status: added.length > 0 || agentIsPending ? "approved" : "denied",
				},
			);

			void deliverApprovalNotifications(resolved, {
				agent_id: agentId,
				status: "approved",
			});

			await activatePendingAgent(
				ctx.context.adapter,
				opts,
				ctx,
				{
					agentId,
					userId: session.user.id,
					agent,
				},
			);

			emit(opts, {
				type: "capability.approved",
				actorId: session.user.id,
				agentId,
				metadata: { capabilities: added },
			}, ctx);

			return ctx.json({
				status: "approved",
				agentId,
				added,
			});
		},
	);
}
