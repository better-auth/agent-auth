import { describe, expect, it, beforeAll } from "vitest";
import { getTestInstance } from "better-auth/test";
import { passkey as _passkey } from "@better-auth/passkey";
import {
  agentAuth,
  agentAuthClientPlugin,
  generateTestKeypair,
  json,
  createTestClient,
} from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const passkey = (): any => _passkey();

const CAPABILITIES_WITH_STRENGTH = [
  {
    name: "read_data",
    description: "Read user data",
    approvalStrength: "session" as const,
  },
  {
    name: "delete_project",
    description: "Delete a project permanently",
    approvalStrength: "webauthn" as const,
  },
  {
    name: "list_items",
    description: "List items (no strength set)",
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let sessionCookie: string;
let testUserId: string;
let client: ReturnType<typeof createTestClient>;

beforeAll(async () => {
  const t = await getTestInstance(
    {
      plugins: [
        passkey(),
        agentAuth({
          providerName: "webauthn-test",
          capabilities: CAPABILITIES_WITH_STRENGTH,
          defaultHostCapabilities: ["read_data"],
          proofOfPresence: {
            enabled: true,
            rpId: "localhost",
            origin: "http://localhost:3000",
          },
        }),
      ],
    },
    {
      clientOptions: { plugins: [agentAuthClientPlugin()] },
    },
  );
  auth = t.auth;
  client = createTestClient((req) => auth.handler(req));

  const { headers, user } = await t.signInWithTestUser();
  sessionCookie = headers.get("cookie") ?? "";
  testUserId = user.id;
});

describe("WebAuthn Proof of Presence", () => {
  describe("Capability list", () => {
    it("includes approval_strength in capability list", async () => {
      const res = await client.api("/capability/list", { method: "GET" });
      expect(res.ok).toBe(true);
      const body = await json<{
        capabilities: Array<Record<string, unknown>>;
      }>(res);

      const deleteProject = body.capabilities.find((c) => c.name === "delete_project");
      expect(deleteProject?.approval_strength).toBe("webauthn");

      const readData = body.capabilities.find((c) => c.name === "read_data");
      expect(readData?.approval_strength).toBe("session");

      const listItems = body.capabilities.find((c) => c.name === "list_items");
      expect(listItems?.approval_strength).toBeUndefined();
    });
  });

  describe("Capability describe", () => {
    it("includes approval_strength in describe response", async () => {
      const res = await client.api("/capability/describe?name=delete_project", { method: "GET" });
      expect(res.ok).toBe(true);
      const body = await json<Record<string, unknown>>(res);
      expect(body.approval_strength).toBe("webauthn");
    });
  });

  describe("Approval endpoint", () => {
    it("returns webauthn_not_enrolled when user has no passkeys", async () => {
      const hostKeypair = await generateTestKeypair();
      const createRes = await client.authedPost(
        "/host/create",
        {
          name: "WebAuthn Host",
          public_key: hostKeypair.publicKey,
          default_capabilities: ["read_data"],
        },
        sessionCookie,
      );
      const { hostId } = await json<{ hostId: string }>(createRes);

      const agentKeypair = await generateTestKeypair();
      const { agentId, body: regBody } = await client.registerAgentViaHost({
        hostKeypair,
        agentKeypair,
        hostId,
        name: "WebAuthn Test Agent",
        capabilities: ["read_data", "delete_project"],
      });
      const userCode = (regBody.approval as Record<string, unknown>).user_code as string;

      const approveRes = await client.authedPost(
        "/agent/approve-capability",
        {
          agent_id: agentId,
          action: "approve",
          user_code: userCode,
        },
        sessionCookie,
      );
      const body = await json<{ error: string }>(approveRes);
      expect(body.error).toBe("webauthn_not_enrolled");
      if (!approveRes.ok) {
        expect(approveRes.status).toBe(403);
      }
    });

    it("approves session-only capabilities without WebAuthn", async () => {
      const hostKeypair = await generateTestKeypair();
      const createRes = await client.authedPost(
        "/host/create",
        {
          name: "Session-Only Host",
          public_key: hostKeypair.publicKey,
          default_capabilities: [],
        },
        sessionCookie,
      );
      const { hostId } = await json<{ hostId: string }>(createRes);

      const agentKeypair = await generateTestKeypair();
      const { agentId, body: regBody } = await client.registerAgentViaHost({
        hostKeypair,
        agentKeypair,
        hostId,
        name: "Session-Only Agent",
        capabilities: ["read_data"],
      });
      const userCode = (regBody.approval as Record<string, unknown>).user_code as string;

      const approveRes = await client.authedPost(
        "/agent/approve-capability",
        {
          agent_id: agentId,
          action: "approve",
          user_code: userCode,
        },
        sessionCookie,
      );

      expect(approveRes.ok).toBe(true);
      const body = await json<{
        status: string;
        added: string[];
      }>(approveRes);
      expect(body.status).toBe("approved");
      expect(body.added).toContain("read_data");
    });

    it("deny works regardless of approval strength", async () => {
      const hostKeypair = await generateTestKeypair();
      const createRes = await client.authedPost(
        "/host/create",
        {
          name: "Deny Host",
          public_key: hostKeypair.publicKey,
          default_capabilities: ["read_data"],
        },
        sessionCookie,
      );
      const { hostId } = await json<{ hostId: string }>(createRes);

      const agentKeypair = await generateTestKeypair();
      const { agentId } = await client.registerAgentViaHost({
        hostKeypair,
        agentKeypair,
        hostId,
        name: "Deny Agent",
        capabilities: ["delete_project"],
      });

      const denyRes = await client.authedPost(
        "/agent/approve-capability",
        {
          agent_id: agentId,
          action: "deny",
        },
        sessionCookie,
      );

      expect(denyRes.ok).toBe(true);
      const body = await json<{ status: string }>(denyRes);
      expect(body.status).toBe("denied");
    });
  });
});
