import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import {
  agentAuth,
  agentAuthClientPlugin,
  createAgentJWT,
  createTestClient,
  generateTestKeypair,
  json,
} from "./helpers";
import type { AgentAuthOptions } from "../types";

const TEST_CAPABILITIES = [
  { name: "check_balance", description: "Check account balance" },
  { name: "transfer", description: "Transfer money" },
];

async function setup(pluginOpts: Partial<AgentAuthOptions>) {
  const t = await getTestInstance(
    {
      plugins: [
        agentAuth({
          providerName: "server-defined-approval-methods-test",
          capabilities: TEST_CAPABILITIES,
          modes: ["delegated"],
          ...pluginOpts,
        }),
      ],
    },
    { clientOptions: { plugins: [agentAuthClientPlugin()] } },
  );
  const client = createTestClient((req) => t.auth.handler(req));
  const { headers } = await t.signInWithTestUser();
  const sessionCookie = headers.get("cookie") ?? "";
  return { client, sessionCookie };
}

// ================================================================
// A registered handler builds the approval response, in place of the
// built-in device_authorization/ciba branches. Server-Defined Approval
// Profile, §10.10.3: "This profile allows servers to expose approval
// methods beyond the core device_authorization and ciba set...The
// approval object carries whatever additional fields the client needs
// to facilitate the custom flow."
// ================================================================

describe("approvalMethodHandlers", () => {
  it("a resolved custom method is built by its registered handler", async () => {
    const { client, sessionCookie } = await setup({
      approvalMethods: ["device_authorization", "ciba", "org_review_queue"],
      resolveApprovalMethod: async () => "org_review_queue",
      approvalMethodHandlers: {
        org_review_queue: async ({ agentId, capabilities }) => ({
          method: "org_review_queue",
          agent_id: agentId,
          pending_capabilities: capabilities,
          expires_in: 180,
        }),
      },
    });

    const hostKeypair = await generateTestKeypair();
    const createRes = await client.authedPost(
      "/host/create",
      {
        name: "Test Host",
        public_key: hostKeypair.publicKey,
        default_capabilities: ["check_balance"],
      },
      sessionCookie,
    );
    const { hostId } = await json<{ hostId: string }>(createRes);

    const agentKeypair = await generateTestKeypair();
    // "transfer" is outside the host's default budget, so this stays
    // pending and goes through the approval path.
    const { agentId, body } = await client.registerAgentViaHost({
      hostKeypair,
      agentKeypair,
      hostId,
      capabilities: ["check_balance", "transfer"],
    });

    const approval = body.approval as Record<string, unknown>;
    expect(approval.method).toBe("org_review_queue");
    expect(approval.agent_id).toBe(agentId);
    // Registration passes the full requested set (resolved + pending), not
    // just the pending delta -- unrelated to this change, matches register.ts's
    // existing buildApprovalInfo call for both built-in methods already.
    expect(approval.pending_capabilities).toEqual(["check_balance", "transfer"]);
    expect(approval.expires_in).toBe(180);
    // Built-in fields are absent -- the handler's own shape wins entirely.
    expect(approval).not.toHaveProperty("device_code");
    expect(approval).not.toHaveProperty("user_code");
  });

  it("built-in device_authorization is unaffected when no handler is registered for it", async () => {
    const { client, sessionCookie } = await setup({
      approvalMethods: ["device_authorization", "ciba", "org_review_queue"],
      resolveApprovalMethod: async () => "device_authorization",
      approvalMethodHandlers: {
        org_review_queue: async () => ({ method: "org_review_queue" }),
      },
    });

    const hostKeypair = await generateTestKeypair();
    const createRes = await client.authedPost(
      "/host/create",
      {
        name: "Test Host",
        public_key: hostKeypair.publicKey,
        default_capabilities: ["check_balance"],
      },
      sessionCookie,
    );
    const { hostId } = await json<{ hostId: string }>(createRes);

    const agentKeypair = await generateTestKeypair();
    const { body } = await client.registerAgentViaHost({
      hostKeypair,
      agentKeypair,
      hostId,
      capabilities: ["check_balance", "transfer"],
    });

    const approval = body.approval as Record<string, unknown>;
    expect(approval.method).toBe("device_authorization");
    expect(approval).toHaveProperty("device_code");
    expect(approval).toHaveProperty("user_code");
  });

  it("a resolved method with no matching handler falls back to device_authorization", async () => {
    const { client, sessionCookie } = await setup({
      approvalMethods: ["device_authorization", "ciba", "org_review_queue"],
      resolveApprovalMethod: async () => "org_review_queue",
      approvalMethodHandlers: {
        // Registered under a different name than what resolves -- simulates
        // a misconfiguration, proving the existing fallback still holds.
        some_other_method: async () => ({ method: "some_other_method" }),
      },
    });

    const hostKeypair = await generateTestKeypair();
    const createRes = await client.authedPost(
      "/host/create",
      {
        name: "Test Host",
        public_key: hostKeypair.publicKey,
        default_capabilities: ["check_balance"],
      },
      sessionCookie,
    );
    const { hostId } = await json<{ hostId: string }>(createRes);

    const agentKeypair = await generateTestKeypair();
    const { body } = await client.registerAgentViaHost({
      hostKeypair,
      agentKeypair,
      hostId,
      capabilities: ["check_balance", "transfer"],
    });

    const approval = body.approval as Record<string, unknown>;
    expect(approval.method).toBe("device_authorization");
  });

  it("request-capability for an already-active agent also builds via the registered handler", async () => {
    const { client, sessionCookie } = await setup({
      approvalMethods: ["device_authorization", "org_review_queue"],
      resolveApprovalMethod: async () => "org_review_queue",
      approvalMethodHandlers: {
        org_review_queue: async ({ capabilities }) => ({
          method: "org_review_queue",
          pending_capabilities: capabilities,
        }),
      },
    });

    const hostKeypair = await generateTestKeypair();
    const createRes = await client.authedPost(
      "/host/create",
      {
        name: "Test Host",
        public_key: hostKeypair.publicKey,
        default_capabilities: ["check_balance"],
      },
      sessionCookie,
    );
    const { hostId } = await json<{ hostId: string }>(createRes);

    const agentKeypair = await generateTestKeypair();
    // Only default-budget capabilities -- agent comes up active
    // immediately, no approval step at registration.
    const { agentId } = await client.registerAgentViaHost({
      hostKeypair,
      agentKeypair,
      hostId,
      capabilities: ["check_balance"],
    });

    const agentJWT = await createAgentJWT(agentKeypair.privateKey, agentId);
    const res = await client.api("/agent/request-capability", {
      method: "POST",
      headers: { authorization: `Bearer ${agentJWT}` },
      body: JSON.stringify({ capabilities: ["transfer"] }),
    });
    const body = await json<{ approval?: Record<string, unknown> }>(res);

    expect(body.approval?.method).toBe("org_review_queue");
    expect(body.approval?.pending_capabilities).toEqual(["transfer"]);
  });
});
