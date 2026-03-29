import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import { TABLE, CLOCK_SKEW_TOLERANCE_SEC } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { sanitizeDisplayText, DISPLAY_LIMITS } from "../utils/sanitize";
import { verifyJWT } from "../utils/crypto";
import type { JtiCacheStore } from "../utils/jti-cache";
import type { JwksCacheStore } from "../utils/jwks-cache";
import { MemoryJwksCache } from "../utils/jwks-cache";
import type {
  Agent,
  AgentCapabilityGrant,
  AgentHost,
  AgentJWK,
  ResolvedAgentAuthOptions,
} from "../types";
import {
  buildApprovalInfo,
  findHostByKey,
  formatGrantsResponse,
  isDynamicHostAllowed,
  resolveDefaultHostCapabilities,
  validateKeyAlgorithm,
  verifyAudience,
} from "./_helpers";

/**
 * POST /agent/claim
 *
 * Initiate a claim on an autonomous agent. Authenticates the calling
 * host via its host JWT inline (not via the global middleware) so that
 * brand-new SDK instances whose host has never been registered can
 * dynamically create a host record — matching the /agent/register flow.
 *
 * Creates an approval request for the target autonomous agent.
 * When the user approves, `approve-capability` transfers ownership
 * of the agent and its host to the approving user.
 */
export function claimAgent(
  opts: ResolvedAgentAuthOptions,
  jtiCache?: JtiCacheStore,
  jwksCache?: JwksCacheStore,
) {
  const cache = jwksCache ?? new MemoryJwksCache();

  return createAuthEndpoint(
    "/agent/claim",
    {
      method: "POST",
      body: z.object({
        agent_id: z.string().meta({
          description: "ID of the autonomous agent to claim.",
        }),
        preferred_method: z.string().optional(),
        login_hint: z.string().optional(),
        binding_message: z.string().optional(),
      }),
      metadata: {
        openapi: {
          description:
            "Initiate a claim on an autonomous agent. Triggers an approval flow. When approved, the autonomous agent is claimed and its resources transfer to the approving user.",
        },
      },
    },
    async (ctx) => {
      // ── Authenticate host JWT inline (same pattern as /agent/register) ──

      const authHeader = ctx.headers?.get("authorization");
      const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");
      const hostJWT =
        bearerToken && bearerToken !== authHeader && bearerToken.split(".").length === 3
          ? bearerToken
          : null;

      if (!hostJWT) {
        throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
      }

      let decoded: ReturnType<typeof decodeJwt>;
      let header: ReturnType<typeof decodeProtectedHeader>;
      try {
        decoded = decodeJwt(hostJWT);
        header = decodeProtectedHeader(hostJWT);
      } catch {
        throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
      }

      if (header.typ !== "host+jwt") {
        throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
      }

      if (
        !decoded.aud ||
        !verifyAudience(decoded.aud, ctx.context.baseURL, ctx.headers, opts.trustProxy)
      ) {
        throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
      }

      const hostIdFromJwt = typeof decoded.iss === "string" ? decoded.iss : null;
      const hostInlinePubKey =
        decoded.host_public_key && typeof decoded.host_public_key === "object"
          ? (decoded.host_public_key as AgentJWK)
          : null;
      const hostJwksUrl =
        decoded.host_jwks_url && typeof decoded.host_jwks_url === "string"
          ? decoded.host_jwks_url
          : null;

      let hostRecord: AgentHost | null = null;

      if (hostIdFromJwt) {
        hostRecord = await ctx.context.adapter.findOne<AgentHost>({
          model: TABLE.host,
          where: [{ field: "id", value: hostIdFromJwt }],
        });
      }

      if (hostRecord) {
        // ── Known host ──
        if (hostRecord.status === "revoked") {
          throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
        }
        if (!hostRecord.publicKey && !hostRecord.jwksUrl) {
          throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
        }

        let hostPubKey: AgentJWK;
        if (hostRecord.jwksUrl) {
          if (!header.kid) throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
          const key = await cache.getKeyByKid(hostRecord.jwksUrl, header.kid);
          if (!key) throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
          hostPubKey = key;
        } else {
          try {
            hostPubKey = JSON.parse(hostRecord.publicKey!) as AgentJWK;
          } catch {
            throw agentError("FORBIDDEN", ERR.INVALID_PUBLIC_KEY);
          }
        }

        const payload = await verifyJWT({
          jwt: hostJWT,
          publicKey: hostPubKey,
          maxAge: opts.jwtMaxAge,
        });
        if (!payload || payload.iss !== hostRecord.id) {
          throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
        }

        if (!opts.dangerouslySkipJtiCheck) {
          if (!payload.jti) throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
          const jtiKey = `host:${hostRecord.id}:${payload.jti}`;
          if (jtiCache && (await jtiCache.has(jtiKey))) {
            throw agentError("UNAUTHORIZED", ERR.JWT_REPLAY);
          }
          if (jtiCache) {
            await jtiCache.add(jtiKey, opts.jwtMaxAge + CLOCK_SKEW_TOLERANCE_SEC);
          }
        }
      } else {
        // ── Unknown host — dynamic registration ──
        if (!(await isDynamicHostAllowed(opts, ctx))) {
          throw agentError("FORBIDDEN", ERR.DYNAMIC_HOST_REGISTRATION_DISABLED);
        }

        let resolvedHostPubKey: AgentJWK | null = null;

        if (hostJwksUrl) {
          if (header.kid) {
            const key = await cache.getKeyByKid(hostJwksUrl, header.kid);
            if (key) resolvedHostPubKey = key;
          }
        }
        if (!resolvedHostPubKey && hostInlinePubKey) {
          resolvedHostPubKey = hostInlinePubKey;
        }
        if (!resolvedHostPubKey) {
          throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
        }

        validateKeyAlgorithm(resolvedHostPubKey, opts.allowedKeyAlgorithms);

        const payload = await verifyJWT({
          jwt: hostJWT,
          publicKey: resolvedHostPubKey,
          maxAge: opts.jwtMaxAge,
        });
        if (!payload) {
          throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
        }
        if (
          !payload.aud ||
          !verifyAudience(payload.aud, ctx.context.baseURL, ctx.headers, opts.trustProxy)
        ) {
          throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
        }

        if (!opts.dangerouslySkipJtiCheck) {
          if (!payload.jti) throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
          const jtiKey = `host:${payload.iss ?? "dynamic"}:${payload.jti}`;
          if (jtiCache && (await jtiCache.has(jtiKey))) {
            throw agentError("UNAUTHORIZED", ERR.JWT_REPLAY);
          }
          if (jtiCache) {
            await jtiCache.add(jtiKey, opts.jwtMaxAge + CLOCK_SKEW_TOLERANCE_SEC);
          }
        }

        const existingHost = await findHostByKey(ctx.context.adapter, resolvedHostPubKey);
        if (existingHost) {
          hostRecord = existingHost;
        } else {
          const hostNow = new Date();
          const hostKid = resolvedHostPubKey.kid ?? null;
          const jwtHostName = typeof decoded.host_name === "string" ? decoded.host_name : null;
          const dynCaps = await resolveDefaultHostCapabilities(opts, {
            ctx,
            mode: "delegated",
            userId: null,
            hostId: null,
            hostName: jwtHostName,
          });

          hostRecord = await ctx.context.adapter.create<Record<string, unknown>, AgentHost>({
            model: TABLE.host,
            data: {
              name: jwtHostName,
              userId: null,
              publicKey: JSON.stringify(resolvedHostPubKey),
              kid: hostKid,
              jwksUrl: hostJwksUrl,
              enrollmentTokenHash: null,
              enrollmentTokenExpiresAt: null,
              defaultCapabilities: dynCaps,
              status: "pending",
              activatedAt: null,
              expiresAt: null,
              lastUsedAt: null,
              createdAt: hostNow,
              updatedAt: hostNow,
            },
          });
        }
      }

      // ── Claim logic ──

      const {
        agent_id: targetAgentId,
        preferred_method: preferredMethod,
        login_hint: loginHint,
        binding_message: rawBindingMessage,
      } = ctx.body;

      const bindingMessage = rawBindingMessage
        ? sanitizeDisplayText(rawBindingMessage, DISPLAY_LIMITS.bindingMessage)
        : undefined;

      const targetAgent = await ctx.context.adapter.findOne<Agent>({
        model: TABLE.agent,
        where: [{ field: "id", value: targetAgentId }],
      });

      if (!targetAgent) {
        throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
      }

      if (targetAgent.mode !== "autonomous") {
        throw agentError(
          "BAD_REQUEST",
          ERR.UNSUPPORTED_MODE,
          "Only autonomous agents can be claimed.",
        );
      }

      if (targetAgent.status === "claimed") {
        throw agentError("CONFLICT", ERR.AGENT_CLAIMED, "This agent has already been claimed.");
      }

      if (targetAgent.status !== "active") {
        throw agentError(
          "BAD_REQUEST",
          ERR.AGENT_NOT_FOUND,
          "Agent is not available for claiming.",
        );
      }

      const targetHost = await ctx.context.adapter.findOne<AgentHost>({
        model: TABLE.host,
        where: [{ field: "id", value: targetAgent.hostId }],
      });

      if (!targetHost) {
        throw agentError("NOT_FOUND", ERR.HOST_NOT_FOUND);
      }

      if (targetHost.userId) {
        throw agentError(
          "CONFLICT",
          ERR.AGENT_CLAIMED,
          "This agent's host is already owned by a user.",
        );
      }

      // ── Collect the autonomous agent's active capabilities ──

      const targetGrants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
        model: TABLE.grant,
        where: [{ field: "agentId", value: targetAgent.id }],
      });

      const activeCapabilities = targetGrants
        .filter((g) => g.status === "active")
        .map((g) => g.capability);

      // ── Build approval directly for the target agent ──

      const origin = new URL(ctx.context.baseURL).origin;
      const approval = await buildApprovalInfo(
        opts,
        ctx.context.adapter,
        ctx.context.internalAdapter,
        {
          origin,
          agentId: targetAgent.id,
          userId: null,
          agentName: targetAgent.name,
          hostId: targetAgent.hostId,
          capabilities: activeCapabilities,
          preferredMethod,
          loginHint,
          bindingMessage: bindingMessage ?? `Claim autonomous agent "${targetAgent.name}"`,
        },
      );

      emit(
        opts,
        {
          type: "approval.created",
          agentId: targetAgent.id,
          hostId: targetAgent.hostId,
          metadata: {
            type: "claim",
          },
        },
        ctx,
      );

      return ctx.json({
        agent_id: targetAgent.id,
        host_id: targetAgent.hostId,
        name: targetAgent.name,
        mode: targetAgent.mode,
        status: targetAgent.status,
        agent_capability_grants: formatGrantsResponse(targetGrants, opts.capabilities),
        approval,
      });
    },
  );
}
