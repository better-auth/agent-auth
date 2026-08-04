import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import {
  agentAuth,
  agentAuthClientPlugin,
  generateTestKeypair,
  createHostJWT,
  signTestJWT,
  json,
  createTestClient,
  computeThumbprint,
  BASE,
} from "./helpers";
import type { AgentHost } from "../types";

/**
 * Regression: hosts registering with a kid-less JWK must remain findable.
 *
 * `kid` is OPTIONAL in a JWK (RFC 7517 §4.5), and RFC 7638 §3.1 blesses
 * the JWK thumbprint as a `kid` value — which is exactly what a kid-less
 * host uses as its `iss`. The dynamic-registration branches previously
 * stored `kid = publicKey.kid ?? null`, so a spec-compliant host whose
 * JWK omitted the member was persisted with `kid = null`. Its next JWT
 * (`iss` = thumbprint) matched neither the `id` nor the `kid` lookup and
 * every request failed with AGENT_NOT_FOUND — permanently.
 *
 * The official SDK masks this because it stamps `kid = thumbprint` at
 * keygen; only clients that legitimately omit `kid` ever hit it.
 * Fix: derive and persist the thumbprint whenever `kid` is absent.
 */
describe("dynamic host registration — kid-less JWK", () => {
  async function setup() {
    const t = await getTestInstance(
      {
        plugins: [
          agentAuth({
            providerName: "test-service",
            allowDynamicHostRegistration: true,
            modes: ["delegated", "autonomous"],
            capabilities: [{ name: "ping", description: "ping" }],
            resolveAutonomousUser: async ({ hostId }) => ({
              id: `synthetic_${hostId}`,
              name: "Autonomous User",
              email: `auto_${hostId}@test.local`,
            }),
          }),
        ],
      },
      {
        clientOptions: { plugins: [agentAuthClientPlugin()] },
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = t.auth as any;
    const client = createTestClient((req: Request) => auth.handler(req));
    return { auth, client };
  }

  it("stores the JWK thumbprint as kid and authenticates the host on subsequent requests", async () => {
    const { auth, client } = await setup();

    const hostKeypair = await generateTestKeypair();
    const agentKeypair = await generateTestKeypair();
    const thumbprint = await computeThumbprint(hostKeypair.publicKey);

    // The host key carries no `kid` — allowed by RFC 7517 §4.5 — and the
    // host identifies itself by its thumbprint, per RFC 7638 §3.1.
    expect(hostKeypair.publicKey.kid).toBeUndefined();
    const hostJWT = await createHostJWT(
      hostKeypair.privateKey,
      hostKeypair.publicKey,
      agentKeypair.publicKey,
      thumbprint,
    );

    const registerRes = await client.api("/agent/register", {
      method: "POST",
      headers: { authorization: `Bearer ${hostJWT}` },
      body: JSON.stringify({ name: "Kid-less Host Agent", mode: "autonomous" }),
    });
    const registerBody = await json<{ agent_id: string; host_id: string }>(registerRes);
    expect(registerRes.ok, JSON.stringify(registerBody)).toBe(true);

    // The stored row carries the derived thumbprint, not null.
    const context = await auth.$context;
    const host = await context.adapter.findOne<AgentHost>({
      model: "agentHost",
      where: [{ field: "id", value: registerBody.host_id }],
    });
    expect(host).not.toBeNull();
    expect(host!.kid).toBe(thumbprint);

    // A follow-up host JWT (iss = thumbprint) must resolve the host.
    // Before the fix this failed with AGENT_NOT_FOUND: the row's id is a
    // generated UUID and its kid was null, so neither lookup matched.
    const followUpJWT = await signTestJWT({
      privateKey: hostKeypair.privateKey,
      subject: thumbprint,
      issuer: thumbprint,
      typ: "host+jwt",
      audience: BASE,
    });
    const statusRes = await client.api(`/agent/status?agent_id=${registerBody.agent_id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${followUpJWT}` },
    });
    const statusBody = await json<Record<string, unknown>>(statusRes);
    expect(statusRes.ok, JSON.stringify(statusBody)).toBe(true);
    expect(statusBody.error).toBeUndefined();
  });

  it("keeps an explicit kid unchanged when the JWK carries one", async () => {
    const { auth, client } = await setup();

    const hostKeypair = await generateTestKeypair();
    const agentKeypair = await generateTestKeypair();
    const explicitKid = `explicit-kid-${crypto.randomUUID()}`;
    const publicKeyWithKid = { ...hostKeypair.publicKey, kid: explicitKid };

    const hostJWT = await createHostJWT(
      hostKeypair.privateKey,
      publicKeyWithKid,
      agentKeypair.publicKey,
      explicitKid,
    );

    const registerRes = await client.api("/agent/register", {
      method: "POST",
      headers: { authorization: `Bearer ${hostJWT}` },
      body: JSON.stringify({ name: "Explicit Kid Agent", mode: "autonomous" }),
    });
    const registerBody = await json<{ agent_id: string; host_id: string }>(registerRes);
    expect(registerRes.ok, JSON.stringify(registerBody)).toBe(true);

    const context = await auth.$context;
    const host = await context.adapter.findOne<AgentHost>({
      model: "agentHost",
      where: [{ field: "id", value: registerBody.host_id }],
    });
    expect(host).not.toBeNull();
    expect(host!.kid).toBe(explicitKid);
  });
});

/**
 * Same root cause on the session-authenticated management routes:
 * /host/create and /host/enroll persisted `kid = publicKey.kid ?? null`,
 * leaving kid-less hosts unable to authenticate with iss = thumbprint.
 */
describe("host provisioning — kid-less JWK", () => {
  it("derives the thumbprint on /host/create", async () => {
    const t = await getTestInstance(
      {
        plugins: [agentAuth({ providerName: "test-service" })],
      },
      {
        clientOptions: { plugins: [agentAuthClientPlugin()] },
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = t.auth as any;
    const client = createTestClient((req: Request) => auth.handler(req));

    const { headers } = await t.signInWithTestUser();
    const sessionCookie = headers.get("cookie") ?? "";

    const hostKeypair = await generateTestKeypair();
    const thumbprint = await computeThumbprint(hostKeypair.publicKey);

    const createRes = await client.authedPost(
      "/host/create",
      { name: "Kid-less Host", public_key: hostKeypair.publicKey },
      sessionCookie,
    );
    expect(createRes.ok).toBe(true);
    const { hostId } = await json<{ hostId: string }>(createRes);

    const context = await auth.$context;
    const host = await context.adapter.findOne<AgentHost>({
      model: "agentHost",
      where: [{ field: "id", value: hostId }],
    });
    expect(host).not.toBeNull();
    expect(host!.kid).toBe(thumbprint);
  });

  it("derives the thumbprint on /host/enroll", async () => {
    const t = await getTestInstance(
      {
        plugins: [agentAuth({ providerName: "test-service" })],
      },
      {
        clientOptions: { plugins: [agentAuthClientPlugin()] },
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = t.auth as any;
    const client = createTestClient((req: Request) => auth.handler(req));

    const { headers } = await t.signInWithTestUser();
    const sessionCookie = headers.get("cookie") ?? "";

    const provisionRes = await client.authedPost(
      "/host/create",
      { name: "Pre-enrolled kid-less host" },
      sessionCookie,
    );
    const { hostId, enrollmentToken } = await json<{
      hostId: string;
      enrollmentToken: string;
    }>(provisionRes);

    const hostKeypair = await generateTestKeypair();
    const thumbprint = await computeThumbprint(hostKeypair.publicKey);

    const enrollRes = await client.api("/host/enroll", {
      method: "POST",
      body: JSON.stringify({
        token: enrollmentToken,
        public_key: hostKeypair.publicKey,
      }),
    });
    const enrollBody = await json<Record<string, unknown>>(enrollRes);
    expect(enrollRes.ok, JSON.stringify(enrollBody)).toBe(true);

    const context = await auth.$context;
    const host = await context.adapter.findOne<AgentHost>({
      model: "agentHost",
      where: [{ field: "id", value: hostId }],
    });
    expect(host).not.toBeNull();
    expect(host!.kid).toBe(thumbprint);
  });
});
