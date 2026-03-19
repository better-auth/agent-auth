import { createAuthEndpoint } from "@better-auth/core/api";
import { decodeJwt, decodeProtectedHeader } from "jose";
import * as z from "zod";
import { TABLE, CLOCK_SKEW_TOLERANCE_SEC } from "../constants";
import type { Agent, AgentCapabilityGrant, AgentJWK, ResolvedAgentAuthOptions } from "../types";
import { verifyJWT } from "../utils/crypto";
import type { JtiCacheStore } from "../utils/jti-cache";
import type { JwksCacheStore } from "../utils/jwks-cache";
import { activeGrants, verifyAudience, getCapabilityLocation } from "./_helpers";

/**
 * POST /agent/introspect
 *
 * Token introspection endpoint (§6.10). Validates an agent JWT and
 * returns the agent's current status and capability grants. Enables
 * resource servers to verify agent JWTs without direct database access.
 *
 * Inspired by RFC 7662 (OAuth 2.0 Token Introspection).
 */
export function introspect(
  opts: ResolvedAgentAuthOptions,
  jtiCache?: JtiCacheStore,
  jwksCache?: JwksCacheStore,
) {
  return createAuthEndpoint(
    "/agent/introspect",
    {
      method: "POST",
      body: z.object({
        token: z.string(),
      }),
      metadata: {
        openapi: {
          description:
            "Validates an agent JWT and returns the agent's status and capability grants (§6.10).",
        },
      },
    },
    async (ctx) => {
      const { token } = ctx.body;
      const inactive = { active: false };

      let agentId: string;
      try {
        const decoded = decodeJwt(token);
        const tokenHeader = decodeProtectedHeader(token);
        // §4.5: introspected token must be an agent JWT
        if (tokenHeader.typ !== "agent+jwt") return ctx.json(inactive);
        if (!decoded.sub) return ctx.json(inactive);
        agentId = decoded.sub;
      } catch {
        return ctx.json(inactive);
      }

      const agent = await ctx.context.adapter.findOne<Agent>({
        model: TABLE.agent,
        where: [{ field: "id", value: agentId }],
      });

      if (!agent) return ctx.json(inactive);
      if (agent.status !== "active") return ctx.json(inactive);

      let publicKey: AgentJWK | null = null;

      if (agent.jwksUrl && jwksCache) {
        try {
          const header = decodeProtectedHeader(token);
          if (header.kid) {
            publicKey = await jwksCache.getKeyByKid(agent.jwksUrl, header.kid);
          }
        } catch {}
      }

      if (!publicKey && agent.publicKey) {
        try {
          const parsed: unknown = JSON.parse(agent.publicKey);
          if (parsed && typeof parsed === "object" && "kty" in parsed) {
            publicKey = parsed as AgentJWK;
          }
        } catch {}
      }

      if (!publicKey) return ctx.json(inactive);

      const payload = await verifyJWT({
        jwt: token,
        publicKey,
        maxAge: opts.jwtMaxAge,
      });

      if (!payload) return ctx.json(inactive);

      const jwtCaps = Array.isArray(payload.capabilities) ? (payload.capabilities as string[]) : [];
      const expectedLocation =
        jwtCaps.length === 1 ? getCapabilityLocation(opts.capabilities, jwtCaps[0]) : undefined;
      if (
        payload.aud &&
        !verifyAudience(
          payload.aud,
          ctx.context.baseURL,
          ctx.headers,
          opts.trustProxy,
          expectedLocation,
        )
      ) {
        return ctx.json(inactive);
      }

      if (jtiCache && typeof payload.jti === "string") {
        // Use same key format as middleware so introspection
        // correctly detects tokens already consumed by API calls
        const jtiKey = `${agent.id}:${payload.jti}`;
        if (await jtiCache.has(jtiKey)) {
          return ctx.json(inactive);
        }
        // Mark as seen so the same token can't be re-introspected
        await jtiCache.add(jtiKey, opts.jwtMaxAge + CLOCK_SKEW_TOLERANCE_SEC);
      }

      if (agent.expiresAt && new Date(agent.expiresAt) <= new Date()) {
        return ctx.json(inactive);
      }

      const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
        model: TABLE.grant,
        where: [{ field: "agentId", value: agent.id }],
      });

      let relevantGrants = activeGrants(grants);

      const capabilitiesClaim = payload.capabilities;
      if (Array.isArray(capabilitiesClaim)) {
        const jwtCaps = new Set<string>();
        for (const v of capabilitiesClaim) {
          if (typeof v === "string") jwtCaps.add(v);
        }
        if (jwtCaps.size > 0) {
          relevantGrants = relevantGrants.filter((g) => jwtCaps.has(g.capability));
        }
      }

      return ctx.json({
        active: true,
        agent_id: agent.id,
        host_id: agent.hostId,
        user_id: agent.userId ?? null,
        agent_capability_grants: relevantGrants.map((g) => ({
          capability: g.capability,
          status: g.status,
        })),
        mode: agent.mode,
        expires_at: agent.expiresAt ? new Date(agent.expiresAt).toISOString() : null,
      });
    },
  );
}
