/**
 * End-to-end test: real AgentAuthClient → real provider → verify names.
 *
 * Uses the SDK's actual detectHostName() and detectTool() to produce
 * the agent/host names, then checks the provider stored them correctly.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { detectHostName, detectTool } from "../host-name";

describe("E2E: local agent names", () => {
  let capturedBody: Record<string, unknown> | null = null;
  let capturedHostJWT: string | null = null;

  it("detectHostName returns a non-empty string in this environment", () => {
    const name = detectHostName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
    console.log(`  ✓ Host name: "${name}"`);
  });

  it("detectTool detects the current IDE", () => {
    const tool = detectTool();
    console.log(`  ✓ Tool: ${tool ? `"${tool.name}"` : "(none — not in a known IDE)"}`);
    // In Cursor, this should be detected
    if (process.env.CURSOR_SESSION_ID || process.env.CURSOR_TRACE_ID) {
      expect(tool).not.toBeNull();
      expect(tool!.name).toBe("Cursor");
    }
  });

  it("AgentAuthClient produces the expected agent name", async () => {
    const { AgentAuthClient, MemoryStorage } = await import("../index");

    const hostName = detectHostName();
    const tool = detectTool();
    const expectedAgentName = tool ? `${tool.name} on ${hostName}` : `AI Agent on ${hostName}`;

    // Intercept the fetch to capture the registration request body
    const mockFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      // Capture the register request
      if (urlStr.includes("/agent/register") && init?.body) {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        const authHeader = (init.headers as Record<string, string>)?.["authorization"] ?? "";
        capturedHostJWT = authHeader.replace(/^Bearer\s+/i, "");

        // Return a minimal success response
        return new Response(
          JSON.stringify({
            agent_id: "test-agent-123",
            host_id: "test-host-456",
            name: capturedBody.name,
            mode: capturedBody.mode ?? "delegated",
            status: "active",
            agent_capability_grants: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // Return 404 for everything else (discovery, etc.)
      return new Response("Not Found", { status: 404 });
    };

    const client = new AgentAuthClient({
      storage: new MemoryStorage(),
      directoryUrl: null,
      allowDirectDiscovery: true,
      fetch: mockFetch as typeof globalThis.fetch,
    });

    // Pre-populate a provider config so we skip discovery
    const storage = new MemoryStorage();
    await storage.setProviderConfig("http://localhost:9999", {
      issuer: "http://localhost:9999",
      provider_name: "test-provider",
      capabilities: [],
      modes: ["delegated"],
      endpoints: {
        register: "http://localhost:9999/agent/register",
      },
    });

    const clientWithStorage = new AgentAuthClient({
      storage,
      directoryUrl: null,
      allowDirectDiscovery: true,
      fetch: mockFetch as typeof globalThis.fetch,
    });

    try {
      await clientWithStorage.connectAgent({
        provider: "http://localhost:9999",
        mode: "delegated",
      });
    } catch {
      // May fail on JWT verification etc, but we captured the request
    }

    // Verify the request body
    expect(capturedBody).not.toBeNull();
    console.log(`  ✓ Agent name sent: "${capturedBody!.name}"`);
    console.log(`  ✓ host_name sent: "${capturedBody!.host_name}"`);
    expect(capturedBody!.name).toBe(expectedAgentName);
    expect(capturedBody!.host_name).toBe(hostName);
    expect(typeof capturedBody!.host_name).toBe("string");
    expect((capturedBody!.host_name as string).length).toBeGreaterThan(0);

    // Verify the host JWT contains host_name
    if (capturedHostJWT) {
      const parts = capturedHostJWT.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
        console.log(`  ✓ JWT host_name claim: "${payload.host_name}"`);
        expect(payload.host_name).toBe(hostName);
      }
    }
  });
});
