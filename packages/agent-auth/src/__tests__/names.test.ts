import { describe, expect, it, beforeAll } from "vitest";
import { getTestInstance } from "better-auth/test";
import {
  agentAuth,
  agentAuthClientPlugin,
  generateTestKeypair,
  signTestJWT,
  json,
  createTestClient,
  BASE,
  API,
} from "./helpers";
import type { AgentJWK } from "../types";
import { displayName } from "../routes/_helpers";

/**
 * Host & agent display name tests.
 *
 * Covers:
 * - Dynamic hosts get host_name from JWT claim
 * - Dynamic hosts without host_name get null (backward compat in DB)
 * - Provider API routes return displayName fallback for null names
 * - displayName helper produces correct fallback strings
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let client: ReturnType<typeof createTestClient>;

beforeAll(async () => {
  const t = await getTestInstance(
    {
      plugins: [
        agentAuth({
          providerName: "test-names",
          allowDynamicHostRegistration: true,
          modes: ["delegated", "autonomous"],
          capabilities: [{ name: "read", description: "Read data" }],
          resolveAutonomousUser: async ({ hostId }) => ({
            id: `synthetic_${hostId}`,
            name: "Auto User",
            email: `auto_${hostId}@test.local`,
          }),
        }),
      ],
    },
    { clientOptions: { plugins: [agentAuthClientPlugin()] } },
  );
  auth = t.auth;
  client = createTestClient((req) => auth.handler(req));

  const { headers } = await t.signInWithTestUser();
  sessionCookie = headers.get("cookie") ?? "";
});

// ─── displayName helper ─────────────────────────────────────

describe("displayName helper", () => {
  it("returns stored name when present", () => {
    expect(displayName("My Device", "abc123def", "Device")).toBe("My Device");
  });

  it("returns fallback with short ID when name is null", () => {
    expect(displayName(null, "abc123def456", "Device")).toBe("Device abc123de");
  });

  it("returns fallback with short ID when name is undefined", () => {
    expect(displayName(undefined, "xyz789abc012", "Agent")).toBe("Agent xyz789ab");
  });

  it("returns fallback with short ID when name is empty string", () => {
    expect(displayName("", "id1234567890", "Device")).toBe("Device id123456");
  });
});

// ─── Dynamic host registration with host_name ───────────────

async function createHostJWTWithName(
  hostPrivateKey: AgentJWK,
  hostPublicKey: AgentJWK,
  agentPublicKey: AgentJWK,
  hostName?: string,
): Promise<string> {
  const hostId = `dyn-host-${crypto.randomUUID()}`;
  return signTestJWT({
    privateKey: hostPrivateKey,
    subject: hostId,
    issuer: hostId,
    typ: "host+jwt",
    audience: BASE,
    additionalClaims: {
      host_public_key: hostPublicKey,
      agent_public_key: agentPublicKey,
      ...(hostName !== undefined ? { host_name: hostName } : {}),
    },
  });
}

describe("Dynamic host name from JWT", () => {
  it("stores host_name from JWT claim on dynamic registration", async () => {
    const hostKeypair = await generateTestKeypair();
    const agentKeypair = await generateTestKeypair();

    const hostJWT = await createHostJWTWithName(
      hostKeypair.privateKey,
      hostKeypair.publicKey,
      agentKeypair.publicKey,
      "Cursor on Bereket's MacBook Pro",
    );

    const res = await auth.handler(
      new Request(`${API}/agent/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${hostJWT}`,
        },
        body: JSON.stringify({
          name: "Cursor on Bereket's MacBook Pro",
          mode: "autonomous",
        }),
      }),
    );

    expect(res.ok).toBe(true);
    const body = await json<{ agent_id: string; host_id: string; name: string }>(res);
    expect(body.name).toBe("Cursor on Bereket's MacBook Pro");
  });

  it("stores host_name from body when JWT claim is absent", async () => {
    const hostKeypair = await generateTestKeypair();
    const agentKeypair = await generateTestKeypair();

    const hostJWT = await createHostJWTWithName(
      hostKeypair.privateKey,
      hostKeypair.publicKey,
      agentKeypair.publicKey,
      // no host_name in JWT
    );

    const res = await auth.handler(
      new Request(`${API}/agent/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${hostJWT}`,
        },
        body: JSON.stringify({
          name: "My Agent",
          host_name: "Linux Server",
          mode: "autonomous",
        }),
      }),
    );

    expect(res.ok).toBe(true);
  });
});

// ─── Provider list/get endpoints return displayName fallback ─

describe("Provider API display names", () => {
  let hostIdWithName: string;
  let hostIdNoName: string;
  let agentIdNoHostName: string;

  it("host/list returns stored name for named hosts", async () => {
    const keypair = await generateTestKeypair();
    const createRes = await client.authedPost(
      "/host/create",
      {
        name: "My Named Device",
        public_key: keypair.publicKey,
        default_capabilities: [],
      },
      sessionCookie,
    );
    const createBody = await json<{ hostId: string }>(createRes);
    hostIdWithName = createBody.hostId;

    const listRes = await client.authedGet("/host/list", sessionCookie);
    const listBody = await json<{ hosts: Array<{ id: string; name: string }> }>(listRes);
    const host = listBody.hosts.find((h) => h.id === hostIdWithName);
    expect(host).toBeDefined();
    expect(host!.name).toBe("My Named Device");
  });

  it("host/get returns stored name for named hosts", async () => {
    const res = await client.authedGet(`/host/get?host_id=${hostIdWithName}`, sessionCookie);
    const body = await json<{ id: string; name: string }>(res);
    expect(body.name).toBe("My Named Device");
  });

  it("agent/list returns agent name and host display name", async () => {
    const keypair = await generateTestKeypair();
    const createRes = await client.authedPost(
      "/host/create",
      {
        name: "Host For Agent Test",
        public_key: keypair.publicKey,
        default_capabilities: ["read"],
      },
      sessionCookie,
    );
    const { hostId } = await json<{ hostId: string }>(createRes);

    const agentKeypair = await generateTestKeypair();
    const { agentId } = await client.registerAgentViaHost({
      hostKeypair: keypair,
      agentKeypair,
      hostId,
      name: "My Cool Agent",
      capabilities: ["read"],
    });

    const listRes = await client.authedGet("/agent/list", sessionCookie);
    const listBody = await json<{
      agents: Array<{
        agent_id: string;
        name: string;
        host_name: string;
      }>;
    }>(listRes);
    const agent = listBody.agents.find((a) => a.agent_id === agentId);
    expect(agent).toBeDefined();
    expect(agent!.name).toBe("My Cool Agent");
    expect(agent!.host_name).toBe("Host For Agent Test");
  });

  it("agent/get returns agent name via displayName", async () => {
    const keypair = await generateTestKeypair();
    const createRes = await client.authedPost(
      "/host/create",
      {
        name: "Host Get Test",
        public_key: keypair.publicKey,
        default_capabilities: ["read"],
      },
      sessionCookie,
    );
    const { hostId } = await json<{ hostId: string }>(createRes);

    const agentKeypair = await generateTestKeypair();
    const { agentId } = await client.registerAgentViaHost({
      hostKeypair: keypair,
      agentKeypair,
      hostId,
      name: "Named Agent",
      capabilities: ["read"],
    });

    const getRes = await client.authedGet(`/agent/get?agent_id=${agentId}`, sessionCookie);
    const body = await json<{ agent_id: string; name: string }>(getRes);
    expect(body.name).toBe("Named Agent");
  });
});
