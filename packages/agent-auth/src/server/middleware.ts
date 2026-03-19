import { decodeJwt, decodeProtectedHeader } from "jose";
import { TABLE, CLOCK_SKEW_TOLERANCE_SEC } from "../constants";
import { AGENT_AUTH_ERROR_CODES } from "../errors";
import { verifyJWT, hashRequestBody } from "../utils/crypto";
import { parseCapabilityIds } from "../utils/capabilities";
import { verifyAudience, getCapabilityLocation } from "./helpers";
import { agentError, agentAuthChallenge } from "./error";
import type { JtiCacheStore } from "../utils/jti-cache";
import type { JwksCacheStore } from "../utils/jwks-cache";
import type {
  Agent,
  AgentCapabilityGrant,
  AgentHost,
  AgentJWK,
  AgentSession,
  AgentSessionUser,
  FullAdapter,
  HostSession,
} from "../types";
import type { ResolvedServerOptions, RouteContext } from "./types";

const ERR = AGENT_AUTH_ERROR_CODES;

function logBackgroundError(label: string) {
  return (err: unknown) => {
    console.error(`[agent-auth] background ${label} failed:`, err);
  };
}

function isKeyAlgorithmAllowed(key: AgentJWK, allowedAlgorithms: string[]): boolean {
  const keyAlg = key.crv ?? key.kty;
  return !!keyAlg && allowedAlgorithms.includes(keyAlg);
}

async function resolveSessionUser(args: {
  opts: ResolvedServerOptions;
  ctx: Pick<RouteContext, "request" | "headers" | "body" | "query" | "adapter" | "baseURL">;
  agent: Agent;
  host: AgentHost | null;
}): Promise<AgentSessionUser | null> {
  const { opts, ctx, agent, host } = args;

  const userId = agent.userId ?? host?.userId ?? null;
  if (userId) {
    const user = await opts.findUserById(userId);
    return (user as AgentSessionUser | null) ?? null;
  }

  if (opts.resolveAutonomousUser) {
    return opts.resolveAutonomousUser({
      ctx: {
        request: ctx.request,
        headers: ctx.headers,
        body: ctx.body,
        query: ctx.query,
        adapter: ctx.adapter,
        baseURL: ctx.baseURL,
      },
      hostId: host?.id ?? agent.hostId,
      hostName: host?.name ?? null,
      agentId: agent.id,
      agentMode: agent.mode,
    });
  }

  return null;
}

const OPTIONAL_AUTH_PATHS = new Set(["/capability/list", "/capability/describe"]);

export function shouldRunMiddleware(path: string, headers: Headers): boolean {
  if (path === "/agent/register") return false;
  const auth = headers.get("authorization");
  if (!auth) return false;
  const bearer = auth.replace(/^Bearer\s+/i, "");
  if (!bearer || bearer === auth) return false;
  return bearer.split(".").length === 3;
}

export async function runJwtMiddleware(
  rctx: RouteContext,
  opts: ResolvedServerOptions,
  jtiCache: JtiCacheStore,
  jwksCache: JwksCacheStore | undefined,
): Promise<void> {
  const challenge = agentAuthChallenge(opts.baseURL);
  const isOptionalAuth = OPTIONAL_AUTH_PATHS.has(rctx.path);

  try {
    const adapter = rctx.adapter;
    const bearer = rctx.headers.get("authorization")?.replace(/^Bearer\s+/i, "")!;

    let decoded: ReturnType<typeof decodeJwt>;
    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
      decoded = decodeJwt(bearer);
      header = decodeProtectedHeader(bearer);
    } catch {
      throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
    }

    const typ = header.typ;
    if (typ !== "host+jwt" && typ !== "agent+jwt") {
      throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
    }

    if (!decoded.aud) {
      throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
    }

    const jwtCapabilities = Array.isArray(decoded.capabilities)
      ? (decoded.capabilities as string[])
      : [];
    const expectedLocation =
      jwtCapabilities.length === 1
        ? getCapabilityLocation(opts.capabilities, jwtCapabilities[0])
        : undefined;

    if (
      !verifyAudience(decoded.aud, opts.baseURL, rctx.headers, opts.trustProxy, expectedLocation)
    ) {
      throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
    }

    // ── Host JWT path (typ: "host+jwt") ──
    if (typ === "host+jwt") {
      const hostIdFromIss = typeof decoded.iss === "string" ? decoded.iss : null;
      if (!hostIdFromIss) {
        throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
      }

      const host =
        (await adapter.findOne<AgentHost>({
          model: TABLE.host,
          where: [{ field: "id", value: hostIdFromIss }],
        })) ??
        (await adapter.findOne<AgentHost>({
          model: TABLE.host,
          where: [{ field: "kid", value: hostIdFromIss }],
        }));

      const hostAllowed =
        host &&
        (host.publicKey || host.jwksUrl) &&
        (host.status === "active" || (host.status === "pending" && rctx.path === "/agent/status"));

      if (!hostAllowed) {
        throw agentError("UNAUTHORIZED", ERR.AGENT_NOT_FOUND);
      }

      let hostPubKey: AgentJWK | null = null;
      if (host.jwksUrl && jwksCache) {
        try {
          if (header.kid) {
            hostPubKey = await jwksCache.getKeyByKid(host.jwksUrl, header.kid);
          }
        } catch (err) {
          console.error("[agent-auth] JWKS fetch failed for host %s:", host.id, err);
        }
      }
      if (!hostPubKey && host.publicKey) {
        try {
          hostPubKey = JSON.parse(host.publicKey) as AgentJWK;
        } catch {
          throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
        }
      }
      if (!hostPubKey) {
        throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
      }
      if (!isKeyAlgorithmAllowed(hostPubKey, opts.allowedKeyAlgorithms)) {
        throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
      }

      const hostPayload = await verifyJWT({
        jwt: bearer,
        publicKey: hostPubKey,
        maxAge: opts.jwtMaxAge,
      });
      if (!hostPayload) {
        throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
      }

      const hostCaps = parseCapabilityIds(host.defaultCapabilities);
      rctx.hostSession = {
        host: {
          id: host.id,
          userId: host.userId,
          defaultCapabilities: hostCaps,
          status: host.status,
        },
      };
      return;
    }

    // ── Agent JWT path (typ: "agent+jwt") ──
    const agentId = typeof decoded.sub === "string" ? decoded.sub : null;
    if (!agentId) {
      throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
    }

    let agent = await adapter.findOne<Agent>({
      model: TABLE.agent,
      where: [{ field: "id", value: agentId }],
    });
    if (!agent) {
      throw agentError("UNAUTHORIZED", ERR.AGENT_NOT_FOUND);
    }

    if (agent.hostId) {
      const issFromJwt = typeof decoded.iss === "string" ? decoded.iss : null;
      if (issFromJwt && issFromJwt !== agent.hostId) {
        const hostByIss = await adapter.findOne<AgentHost>({
          model: TABLE.host,
          where: [{ field: "id", value: issFromJwt }],
        });
        if (!hostByIss || hostByIss.id !== agent.hostId) {
          throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
        }
      }
    }

    if (agent.status === "revoked") throw agentError("FORBIDDEN", ERR.AGENT_REVOKED);
    if (agent.status === "claimed") throw agentError("FORBIDDEN", ERR.AGENT_CLAIMED);
    if (agent.status === "pending") throw agentError("FORBIDDEN", ERR.AGENT_PENDING);
    if (agent.status === "rejected") throw agentError("FORBIDDEN", ERR.AGENT_REJECTED);

    if (opts.absoluteLifetime > 0 && agent.createdAt) {
      const absExpiry = new Date(agent.createdAt).getTime() + opts.absoluteLifetime * 1000;
      if (Date.now() >= absExpiry) {
        adapter
          .update({
            model: TABLE.agent,
            where: [{ field: "id", value: agent.id }],
            update: {
              status: "revoked",
              publicKey: "",
              kid: null,
              updatedAt: new Date(),
            },
          })
          .catch(logBackgroundError("revoke-expired-agent"));
        throw agentError("FORBIDDEN", ERR.ABSOLUTE_LIFETIME_EXCEEDED);
      }
    }

    let needsReactivation = agent.status === "expired";
    if (!needsReactivation && agent.expiresAt && new Date(agent.expiresAt) <= new Date()) {
      needsReactivation = true;
    }
    if (!needsReactivation && opts.agentMaxLifetime > 0) {
      const anchor = agent.activatedAt ?? agent.createdAt;
      if (anchor) {
        const maxExpiry = new Date(anchor).getTime() + opts.agentMaxLifetime * 1000;
        if (Date.now() >= maxExpiry) {
          needsReactivation = true;
        }
      }
    }

    let publicKey: AgentJWK | null = null;
    if (agent.jwksUrl && jwksCache) {
      try {
        if (header.kid) {
          publicKey = await jwksCache.getKeyByKid(agent.jwksUrl, header.kid);
        }
      } catch (err) {
        console.error("[agent-auth] JWKS fetch failed for agent %s:", agent.id, err);
      }
    }
    if (!publicKey && agent.publicKey) {
      try {
        publicKey = JSON.parse(agent.publicKey) as AgentJWK;
      } catch {
        throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
      }
    }
    if (!publicKey) {
      throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
    }
    if (!isKeyAlgorithmAllowed(publicKey, opts.allowedKeyAlgorithms)) {
      throw agentError("UNAUTHORIZED", ERR.INVALID_PUBLIC_KEY);
    }

    const payload = await verifyJWT({
      jwt: bearer,
      publicKey,
      maxAge: opts.jwtMaxAge,
    });
    if (!payload) {
      if (needsReactivation && agent.status === "active") {
        adapter
          .update({
            model: TABLE.agent,
            where: [{ field: "id", value: agent.id }],
            update: { status: "expired", updatedAt: new Date() },
          })
          .catch(logBackgroundError("mark-agent-expired"));
      }
      throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
    }

    if (!payload.jti) {
      throw agentError("UNAUTHORIZED", ERR.INVALID_JWT);
    }
    const jtiKey = `${agentId}:${payload.jti}`;
    if (await jtiCache.has(jtiKey)) {
      throw agentError("UNAUTHORIZED", ERR.JWT_REPLAY);
    }
    await jtiCache.add(jtiKey, opts.jwtMaxAge + CLOCK_SKEW_TOLERANCE_SEC);

    if (payload.htm || payload.htu || payload.ath) {
      if (payload.htm) {
        const method = rctx.request.method;
        if (String(payload.htm).toUpperCase() !== method.toUpperCase()) {
          throw agentError("UNAUTHORIZED", ERR.REQUEST_BINDING_MISMATCH);
        }
      }
      if (payload.htu) {
        const reqUrl = new URL(rctx.request.url);
        const expectedUrl = `${reqUrl.protocol}//${reqUrl.host}${reqUrl.pathname}`;
        if (String(payload.htu) !== expectedUrl) {
          throw agentError("UNAUTHORIZED", ERR.REQUEST_BINDING_MISMATCH);
        }
      }
      if (payload.ath && rctx.body) {
        const bodyStr = typeof rctx.body === "string" ? rctx.body : JSON.stringify(rctx.body);
        const bodyHash = await hashRequestBody(bodyStr);
        if (String(payload.ath) !== bodyHash) {
          throw agentError("UNAUTHORIZED", ERR.REQUEST_BINDING_MISMATCH);
        }
      }
    }

    if (needsReactivation) {
      const { getAgentAuthAdapter } = await import("../adapter");
      const db = getAgentAuthAdapter(adapter, opts as any);
      const reactivated = await db.transparentReactivation(agent);
      if (!reactivated) {
        throw agentError("UNAUTHORIZED", ERR.AGENT_EXPIRED);
      }
      agent = reactivated;
      emitEvent(opts, {
        type: "agent.reactivated",
        actorType: "system",
        agentId: agent.id,
        hostId: agent.hostId ?? undefined,
        metadata: { transparent: true },
      });
    }

    const host = agent.hostId
      ? await adapter.findOne<AgentHost>({
          model: TABLE.host,
          where: [{ field: "id", value: agent.hostId }],
        })
      : null;

    const [user, grants] = await Promise.all([
      resolveSessionUser({ opts, ctx: rctx, agent, host }),
      adapter.findMany<AgentCapabilityGrant>({
        model: TABLE.grant,
        where: [{ field: "agentId", value: agent.id }],
      }),
    ]);

    if (!user) {
      throw agentError(
        "UNAUTHORIZED",
        ERR.AUTONOMOUS_OWNER_REQUIRED,
        "Could not resolve a session user for this agent.",
      );
    }

    const now = new Date();
    const activeGrants = grants.filter(
      (g) => g.status === "active" && (!g.expiresAt || new Date(g.expiresAt) > now),
    );

    let effectiveGrants = activeGrants;
    const jwtCaps = payload.capabilities;
    if (jwtCaps && Array.isArray(jwtCaps)) {
      const jwtCapSet = new Set(jwtCaps as string[]);
      effectiveGrants = activeGrants.filter((g) => jwtCapSet.has(g.capability));
    }

    const agentSession: AgentSession = {
      type: agent.mode,
      agent: {
        id: agent.id,
        name: agent.name,
        mode: agent.mode,
        capabilityGrants: effectiveGrants.map((g) => ({
          capability: g.capability,
          constraints: g.constraints ?? null,
          grantedBy: g.grantedBy,
          status: g.status,
        })),
        hostId: agent.hostId,
        createdAt: agent.createdAt,
        activatedAt: agent.activatedAt ?? null,
        metadata: typeof agent.metadata === "string" ? JSON.parse(agent.metadata) : agent.metadata,
      },
      host: host ? { id: host.id, userId: host.userId, status: host.status } : null,
      user,
    };

    rctx.agentSession = agentSession;

    if (!needsReactivation) {
      const hbNow = new Date();
      const heartbeat: Record<string, unknown> = { lastUsedAt: hbNow };
      if (opts.agentSessionTTL > 0) {
        let newExpiry = hbNow.getTime() + opts.agentSessionTTL * 1000;
        const anchor = agent.activatedAt ?? agent.createdAt;
        if (opts.agentMaxLifetime > 0 && anchor) {
          const hardCap = new Date(anchor).getTime() + opts.agentMaxLifetime * 1000;
          newExpiry = Math.min(newExpiry, hardCap);
        }
        if (opts.absoluteLifetime > 0 && agent.createdAt) {
          const absCap = new Date(agent.createdAt).getTime() + opts.absoluteLifetime * 1000;
          newExpiry = Math.min(newExpiry, absCap);
        }
        heartbeat.expiresAt = new Date(newExpiry);
      }
      adapter
        .update({
          model: TABLE.agent,
          where: [{ field: "id", value: agent.id }],
          update: heartbeat,
        })
        .catch(logBackgroundError("agent-heartbeat"));
    }
  } catch (e) {
    if (isOptionalAuth) return;
    if (e && typeof e === "object" && "statusCode" in e && (e as any).statusCode === 401) {
      Object.assign((e as any).headers, challenge);
    }
    throw e;
  }
}

function emitEvent(opts: ResolvedServerOptions, event: any): void {
  if (!opts.onEvent) return;
  try {
    const result = opts.onEvent(event);
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).catch((err) => {
        console.error("[agent-auth] onEvent callback failed:", err);
      });
    }
  } catch (err) {
    console.error("[agent-auth] onEvent callback threw:", err);
  }
}
