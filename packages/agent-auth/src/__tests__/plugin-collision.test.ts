/**
 * Regression test for better-auth/better-auth#9885.
 *
 * agent-auth registers a global `before` hook. It used to claim any request
 * carrying a 3-segment Bearer JWT, then hard-reject the request with
 * INVALID_JWT when the token's protected-header `typ` wasn't "host+jwt" or
 * "agent+jwt". That collided with other plugins composed on the same
 * betterAuth() instance (e.g. @better-auth/infra's dash() plugin), whose own
 * JWTs were rejected before their owning routes could validate them.
 *
 * The hook now claims requests by token ownership (typ), so foreign Bearer
 * JWTs pass through untouched to the plugin that owns them.
 */
import { createAuthEndpoint } from "@better-auth/core/api";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { agentAuth, agentAuthClientPlugin, BASE, createTestClient } from "./helpers";

const TEST_CAPABILITIES = [{ name: "check_balance", description: "Check account balance" }];

/**
 * Minimal stand-in for @better-auth/infra's dash() plugin: it owns /dash/*
 * routes and validates its own infra-issued Bearer JWT inside the endpoint.
 */
function dashPlugin() {
  return {
    id: "infra-dash",
    endpoints: {
      dashValidate: createAuthEndpoint(
        "/dash/validate",
        { method: "GET" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (ctx: any) => {
          const auth = ctx.headers?.get("authorization");
          const bearer = auth?.replace(/^Bearer\s+/i, "");
          // The owning plugin performs its own validation here; for the test we
          // just confirm the request reached us with its token intact.
          return ctx.json({ ok: true, sawToken: !!bearer && bearer !== auth });
        },
      ),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** Sign a JWT with an arbitrary `typ` that does NOT belong to agent-auth. */
async function signForeignJWT(typ: string): Promise<string> {
  const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const jwk = await exportJWK(privateKey);
  const key = await importJWK(jwk, "EdDSA");
  return new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", typ })
    .setSubject("infra-dashboard")
    .setAudience(BASE)
    .setIssuedAt()
    .setExpirationTime("60s")
    .setJti(globalThis.crypto.randomUUID())
    .sign(key);
}

describe("agent-auth + other-plugin composition (#9885)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    const t = await getTestInstance(
      {
        plugins: [
          agentAuth({
            providerName: "collision-test",
            capabilities: TEST_CAPABILITIES,
            modes: ["delegated"],
          }),
          dashPlugin(),
        ],
      },
      { clientOptions: { plugins: [agentAuthClientPlugin()] } },
    );
    client = createTestClient((req) => t.auth.handler(req));
  });

  it("passes a foreign Bearer JWT through to the route that owns it", async () => {
    const dashToken = await signForeignJWT("infra+jwt");

    const res = await client.api("/dash/validate", {
      method: "GET",
      headers: { authorization: `Bearer ${dashToken}` },
    });

    // Before the fix this was 401 INVALID_JWT from agent-auth's before-hook.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sawToken: boolean };
    expect(body.ok).toBe(true);
    // The foreign token reaches the owning plugin unchanged.
    expect(body.sawToken).toBe(true);
  });

  it("does not reject a foreign token even on a path agent-auth would otherwise match", async () => {
    // A token with an unrecognized typ must never produce agent-auth's
    // INVALID_JWT — agent-auth simply doesn't own it.
    const foreignToken = await signForeignJWT("JWT");

    const res = await client.api("/dash/validate", {
      method: "GET",
      headers: { authorization: `Bearer ${foreignToken}` },
    });

    expect(res.status).toBe(200);
  });
});
