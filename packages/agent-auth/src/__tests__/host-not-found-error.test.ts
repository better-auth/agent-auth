import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import {
  agentAuth,
  agentAuthClientPlugin,
  generateTestKeypair,
  signTestJWT,
  json,
  createTestClient,
  computeThumbprint,
  BASE,
} from "./helpers";

/**
 * A host JWT whose `iss` resolves to no host row reported
 * `agent_not_found`, which points the operator at the agent record when
 * the host row is what is missing. `HOST_NOT_FOUND` already exists and is
 * used by the routes for the same condition.
 *
 * A genuine agent miss on an agent JWT keeps reporting `agent_not_found`.
 */
describe("middleware — unknown host reports host_not_found", () => {
  async function setup() {
    const t = await getTestInstance(
      {
        plugins: [
          agentAuth({
            providerName: "test-service",
            capabilities: [{ name: "ping", description: "ping" }],
          }),
        ],
      },
      {
        clientOptions: { plugins: [agentAuthClientPlugin()] },
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = t.auth as any;
    return { client: createTestClient((req: Request) => auth.handler(req)) };
  }

  it("reports host_not_found when a host JWT names an unknown host", async () => {
    const { client } = await setup();

    const hostKeypair = await generateTestKeypair();
    const thumbprint = await computeThumbprint(hostKeypair.publicKey);

    const hostJWT = await signTestJWT({
      privateKey: hostKeypair.privateKey,
      subject: thumbprint,
      issuer: thumbprint,
      typ: "host+jwt",
      audience: BASE,
    });

    const res = await client.api("/agent/list", {
      headers: { authorization: `Bearer ${hostJWT}` },
    });
    const body = await json<Record<string, unknown>>(res);

    expect(res.ok).toBe(false);
    expect(body.error).toBe("host_not_found");
  });

  it("still reports agent_not_found when an agent JWT names an unknown agent", async () => {
    const { client } = await setup();

    const agentKeypair = await generateTestKeypair();

    const agentJWT = await signTestJWT({
      privateKey: agentKeypair.privateKey,
      subject: "nonexistent-agent-id",
      issuer: "nonexistent-agent-id",
      typ: "agent+jwt",
      audience: BASE,
    });

    const res = await client.api("/agent/list", {
      headers: { authorization: `Bearer ${agentJWT}` },
    });
    const body = await json<Record<string, unknown>>(res);

    expect(res.ok).toBe(false);
    expect(body.error).toBe("agent_not_found");
  });
});
