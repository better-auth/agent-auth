import { APIError } from "@better-auth/core/error";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import {
  agentAuth,
  agentAuthClientPlugin,
  createTestClient,
  generateTestKeypair,
  json,
} from "./helpers";
import type { AgentCapabilityGrant, BeforeApproveContext } from "../types";

const TEST_CAPABILITIES = [
  { name: "session_cap", description: "Session strength capability", approvalStrength: "session" },
  {
    name: "password_cap",
    description: "Password strength capability",
    approvalStrength: "session",
  },
  {
    name: "webauthn_cap",
    description: "WebAuthn strength capability",
    approvalStrength: "webauthn",
  },
] as const;

async function setupApproval(options?: {
  beforeApprove?: (ctx: BeforeApproveContext) => void | Promise<void>;
  capabilities?: string[];
}) {
  const t = await getTestInstance(
    {
      plugins: [
        agentAuth({
          providerName: "before-approve-test",
          capabilities: [...TEST_CAPABILITIES],
          defaultHostCapabilities: [],
          freshSessionWindow: 0,
          beforeApprove: options?.beforeApprove,
        }),
      ],
    },
    { clientOptions: { plugins: [agentAuthClientPlugin()] } },
  );

  const auth = t.auth;
  const client = createTestClient((req) => auth.handler(req));
  const { headers } = await t.signInWithTestUser();
  const sessionCookie = headers.get("cookie") ?? "";

  const hostKeypair = await generateTestKeypair();
  const hostRes = await client.authedPost(
    "/host/create",
    {
      name: "Before Approve Host",
      public_key: hostKeypair.publicKey,
      default_capabilities: [],
    },
    sessionCookie,
  );
  const { hostId } = await json<{ hostId: string }>(hostRes);

  const agentKeypair = await generateTestKeypair();
  const { agentId, body } = await client.registerAgentViaHost({
    hostKeypair,
    agentKeypair,
    hostId,
    capabilities: options?.capabilities ?? ["session_cap"],
  });
  const approval = body.approval as Record<string, unknown>;
  const userCode = approval.user_code as string;

  return { auth, client, sessionCookie, agentId, userCode };
}

async function grantsFor(auth: unknown, agentId: string): Promise<AgentCapabilityGrant[]> {
  const context = await (auth as { $context: Promise<{ adapter: { findMany: Function } }> })
    .$context;
  return context.adapter.findMany({
    model: "agentCapabilityGrant",
    where: [{ field: "agentId", value: agentId }],
  }) as Promise<AgentCapabilityGrant[]>;
}

describe("beforeApprove hook", () => {
  it("approves when hook resolves (void)", async () => {
    const beforeApprove = vi.fn((_ctx: BeforeApproveContext) => {});
    const { client, sessionCookie, agentId, userCode } = await setupApproval({ beforeApprove });

    const res = await client.authedPost(
      "/agent/approve-capability",
      { agent_id: agentId, action: "approve", user_code: userCode },
      sessionCookie,
    );

    expect(res.ok).toBe(true);
    const body = await json<{ status: string; added: string[] }>(res);
    expect(body.status).toBe("approved");
    expect(body.added).toEqual(["session_cap"]);
    expect(beforeApprove).toHaveBeenCalledOnce();
  });

  it("aborts when hook throws APIError", async () => {
    const beforeApprove = vi.fn(() => {
      throw new APIError("FORBIDDEN", {
        error: "step_up_required",
        message: "WebAuthn required",
        webauthn_options: { challenge: "test-challenge" },
      });
    });
    const { auth, client, sessionCookie, agentId, userCode } = await setupApproval({
      beforeApprove,
    });

    const res = await client.authedPost(
      "/agent/approve-capability",
      { agent_id: agentId, action: "approve", user_code: userCode },
      sessionCookie,
    );

    expect(res.ok).toBe(false);
    const body = await json<Record<string, unknown>>(res);
    expect(body.error).toBe("step_up_required");
    expect(body.webauthn_options).toEqual({ challenge: "test-challenge" });

    const grants = await grantsFor(auth, agentId);
    expect(grants.find((g) => g.capability === "session_cap")?.status).toBe("pending");
  });

  it("hook receives all capabilities for a multi-capability approval", async () => {
    let received: BeforeApproveContext["capabilities"] = [];
    const beforeApprove = vi.fn((ctx: BeforeApproveContext) => {
      received = ctx.capabilities;
    });
    const { client, sessionCookie, agentId, userCode } = await setupApproval({
      beforeApprove,
      capabilities: ["session_cap", "webauthn_cap"],
    });

    const res = await client.authedPost(
      "/agent/approve-capability",
      { agent_id: agentId, action: "approve", user_code: userCode },
      sessionCookie,
    );

    expect(res.ok).toBe(true);
    expect(beforeApprove).toHaveBeenCalledOnce();
    expect(received.map((c) => c.capability)).toEqual(["session_cap", "webauthn_cap"]);
    expect(received.every((c) => c.constraints && typeof c.constraints === "object")).toBe(true);
  });

  it("enforces strongest strength across capabilities", async () => {
    const strength = new Map([
      ["session_cap", 0],
      ["webauthn_cap", 1],
    ]);
    let required = "session";
    const beforeApprove = vi.fn((ctx: BeforeApproveContext) => {
      const max = Math.max(...ctx.capabilities.map((c) => strength.get(c.capability) ?? 1));
      required = max > 0 ? "webauthn" : "session";
      if (required === "webauthn" && !ctx.body.webauthn_response) {
        throw new APIError("FORBIDDEN", {
          error: "webauthn_required",
          message: "WebAuthn required",
        });
      }
    });
    const { client, sessionCookie, agentId, userCode } = await setupApproval({
      beforeApprove,
      capabilities: ["session_cap", "webauthn_cap"],
    });

    const res = await client.authedPost(
      "/agent/approve-capability",
      {
        agent_id: agentId,
        action: "approve",
        user_code: userCode,
        webauthn_response: { id: "proof" },
      },
      sessionCookie,
    );

    expect(res.ok).toBe(true);
    expect(required).toBe("webauthn");
  });

  it("all-or-nothing on multi-grant abort", async () => {
    const beforeApprove = vi.fn(() => {
      throw new APIError("FORBIDDEN", {
        error: "approval_denied",
        message: "Approval denied",
      });
    });
    const { auth, client, sessionCookie, agentId, userCode } = await setupApproval({
      beforeApprove,
      capabilities: ["session_cap", "webauthn_cap"],
    });

    const res = await client.authedPost(
      "/agent/approve-capability",
      { agent_id: agentId, action: "approve", user_code: userCode },
      sessionCookie,
    );

    expect(res.ok).toBe(false);
    const grants = await grantsFor(auth, agentId);
    expect(grants.filter((g) => g.status === "active")).toHaveLength(0);
    expect(
      grants
        .filter((g) => g.status === "pending")
        .map((g) => g.capability)
        .sort(),
    ).toEqual(["session_cap", "webauthn_cap"]);
  });

  it("missing proof is a denial, not a pass-through", async () => {
    const beforeApprove = vi.fn((ctx: BeforeApproveContext) => {
      if (!ctx.body.password) {
        throw new APIError("UNAUTHORIZED", {
          error: "password_required",
          message: "Fresh password required",
        });
      }
    });
    const { auth, client, sessionCookie, agentId, userCode } = await setupApproval({
      beforeApprove,
      capabilities: ["password_cap"],
    });

    const res = await client.authedPost(
      "/agent/approve-capability",
      { agent_id: agentId, action: "approve", user_code: userCode },
      sessionCookie,
    );

    expect(res.ok).toBe(false);
    const body = await json<Record<string, unknown>>(res);
    expect(body.error).toBe("password_required");
    const grants = await grantsFor(auth, agentId);
    expect(grants.find((g) => g.capability === "password_cap")?.status).toBe("pending");
  });

  it("fails closed when strength lookup errors", async () => {
    const beforeApprove = vi.fn((ctx: BeforeApproveContext) => {
      let required = "session";
      try {
        for (const cap of ctx.capabilities) {
          if (cap.capability === "password_cap") {
            throw new Error("capability registry unavailable");
          }
        }
      } catch {
        required = "webauthn";
      }
      if (required === "webauthn" && !ctx.body.webauthn_response) {
        throw new APIError("FORBIDDEN", {
          error: "webauthn_required",
          message: "WebAuthn required",
        });
      }
    });
    const { auth, client, sessionCookie, agentId, userCode } = await setupApproval({
      beforeApprove,
      capabilities: ["password_cap"],
    });

    const res = await client.authedPost(
      "/agent/approve-capability",
      { agent_id: agentId, action: "approve", user_code: userCode },
      sessionCookie,
    );

    expect(res.ok).toBe(false);
    const body = await json<Record<string, unknown>>(res);
    expect(body.error).toBe("webauthn_required");
    const grants = await grantsFor(auth, agentId);
    expect(grants.find((g) => g.capability === "password_cap")?.status).toBe("pending");
  });
});
