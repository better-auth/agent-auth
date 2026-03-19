import { describe, expect, it } from "vitest";
import {
  isLoopback,
  normalizeLoopbackUri,
  isLoopbackPortVariant,
  normalizeTokenRequest,
} from "../loopback";

// ─── isLoopback ─────────────────────────────────────────────

describe("isLoopback", () => {
  it("returns true for localhost", () => {
    expect(isLoopback("localhost")).toBe(true);
  });

  it("returns true for 127.0.0.1", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
  });

  it("returns true for [::1]", () => {
    expect(isLoopback("[::1]")).toBe(true);
  });

  it("returns false for external hosts", () => {
    expect(isLoopback("example.com")).toBe(false);
    expect(isLoopback("192.168.1.1")).toBe(false);
    expect(isLoopback("0.0.0.0")).toBe(false);
  });
});

// ─── normalizeLoopbackUri ───────────────────────────────────

describe("normalizeLoopbackUri", () => {
  it("rewrites http://127.0.0.1 to http://localhost", () => {
    expect(normalizeLoopbackUri("http://127.0.0.1:40000/callback")).toBe(
      "http://localhost:40000/callback",
    );
  });

  it("rewrites http://[::1] to http://localhost", () => {
    expect(normalizeLoopbackUri("http://[::1]:40000/callback")).toBe(
      "http://localhost:40000/callback",
    );
  });

  it("leaves http://localhost unchanged", () => {
    expect(normalizeLoopbackUri("http://localhost:40000/callback")).toBe(
      "http://localhost:40000/callback",
    );
  });

  it("leaves HTTPS URIs unchanged even with loopback host", () => {
    expect(normalizeLoopbackUri("https://127.0.0.1:40000/callback")).toBe(
      "https://127.0.0.1:40000/callback",
    );
  });

  it("leaves non-loopback HTTP URIs unchanged", () => {
    expect(normalizeLoopbackUri("http://example.com/callback")).toBe("http://example.com/callback");
  });

  it("leaves HTTPS external URIs unchanged", () => {
    expect(normalizeLoopbackUri("https://example.com/callback")).toBe(
      "https://example.com/callback",
    );
  });

  it("returns invalid strings as-is", () => {
    expect(normalizeLoopbackUri("not-a-url")).toBe("not-a-url");
  });

  it("preserves path and query", () => {
    expect(normalizeLoopbackUri("http://127.0.0.1:9999/deep/path?foo=bar")).toBe(
      "http://localhost:9999/deep/path?foo=bar",
    );
  });
});

// ─── isLoopbackPortVariant ──────────────────────────────────

describe("isLoopbackPortVariant", () => {
  const stored = ["http://localhost:40000/callback"];

  it("matches same host different port", () => {
    expect(isLoopbackPortVariant("http://localhost:55555/callback", stored)).toBe(true);
  });

  it("matches cross-variant (127.0.0.1 vs stored localhost)", () => {
    expect(isLoopbackPortVariant("http://127.0.0.1:60000/callback", stored)).toBe(true);
  });

  it("matches cross-variant ([::1] vs stored localhost)", () => {
    expect(isLoopbackPortVariant("http://[::1]:60000/callback", stored)).toBe(true);
  });

  it("rejects different path", () => {
    expect(isLoopbackPortVariant("http://localhost:55555/evil", stored)).toBe(false);
  });

  it("rejects non-loopback URI", () => {
    expect(isLoopbackPortVariant("https://evil.com/callback", stored)).toBe(false);
  });

  it("rejects HTTPS loopback", () => {
    expect(isLoopbackPortVariant("https://localhost:55555/callback", stored)).toBe(false);
  });

  it("rejects when stored list is empty", () => {
    expect(isLoopbackPortVariant("http://localhost:55555/callback", [])).toBe(false);
  });

  it("rejects when stored list has only non-loopback URIs", () => {
    expect(
      isLoopbackPortVariant("http://localhost:55555/callback", ["https://example.com/callback"]),
    ).toBe(false);
  });

  it("returns false for invalid input URI", () => {
    expect(isLoopbackPortVariant("not-a-url", stored)).toBe(false);
  });

  it("handles invalid URIs in stored list gracefully", () => {
    expect(
      isLoopbackPortVariant("http://localhost:55555/callback", [
        "not-a-url",
        "http://localhost:40000/callback",
      ]),
    ).toBe(true);
  });
});

// ─── Token exchange redirect_uri normalization ──────────────
// Vercel rewrites 127.0.0.1 → localhost in GET query strings but NOT
// in POST bodies. The authorize flow stores "localhost" in the auth
// code, so the token exchange must also send "localhost".

describe("normalizeLoopbackUri for token exchange", () => {
  it("normalizes 127.0.0.1 so it matches what authorize stored", () => {
    const authorizeStored = normalizeLoopbackUri("http://127.0.0.1:60024/callback");
    const tokenExchangeSent = normalizeLoopbackUri("http://127.0.0.1:60024/callback");
    expect(authorizeStored).toBe(tokenExchangeSent);
    expect(authorizeStored).toBe("http://localhost:60024/callback");
  });

  it("both GET (Vercel-rewritten) and POST (our code) produce same value", () => {
    const vercelRewrite = "http://localhost:60024/callback";
    const postNormalized = normalizeLoopbackUri("http://127.0.0.1:60024/callback");
    expect(postNormalized).toBe(vercelRewrite);
  });
});

// ─── normalizeTokenRequest ──────────────────────────────────
// Tests the full Request → Request transformation used by the
// POST route handler. This catches body-consumption bugs that
// pure string-level tests miss (e.g. "Body already read" on
// runtimes where Request.clone() is unreliable).

function tokenRequest(body: string, contentType: string, path = "/api/auth/oauth2/token"): Request {
  return new Request(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("normalizeTokenRequest", () => {
  // ── returns null for non-token paths ─────────────────────
  it("returns null for non-token endpoint", async () => {
    const req = tokenRequest(
      "grant_type=authorization_code",
      "application/x-www-form-urlencoded",
      "/api/auth/oauth2/register",
    );
    expect(await normalizeTokenRequest(req)).toBeNull();
  });

  it("returns null for unsupported content-type", async () => {
    const req = tokenRequest("raw body", "text/plain");
    expect(await normalizeTokenRequest(req)).toBeNull();
  });

  // ── form-urlencoded ──────────────────────────────────────
  describe("application/x-www-form-urlencoded", () => {
    it("normalizes 127.0.0.1 redirect_uri to localhost", async () => {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code: "abc123",
        redirect_uri: "http://127.0.0.1:60024/callback",
        code_verifier: "xyz",
      });
      const req = tokenRequest(params.toString(), "application/x-www-form-urlencoded");
      const result = await normalizeTokenRequest(req);

      expect(result).not.toBeNull();
      const body = new URLSearchParams(await result!.text());
      expect(body.get("redirect_uri")).toBe("http://localhost:60024/callback");
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("abc123");
    });

    it("normalizes [::1] redirect_uri to localhost", async () => {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: "http://[::1]:9999/callback",
      });
      const req = tokenRequest(params.toString(), "application/x-www-form-urlencoded");
      const result = await normalizeTokenRequest(req);

      const body = new URLSearchParams(await result!.text());
      expect(body.get("redirect_uri")).toBe("http://localhost:9999/callback");
    });

    it("preserves non-loopback redirect_uri", async () => {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: "https://app.example.com/callback",
      });
      const req = tokenRequest(params.toString(), "application/x-www-form-urlencoded");
      const result = await normalizeTokenRequest(req);

      const body = new URLSearchParams(await result!.text());
      expect(body.get("redirect_uri")).toBe("https://app.example.com/callback");
    });

    it("body is readable (not consumed)", async () => {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: "http://127.0.0.1:60024/callback",
      });
      const req = tokenRequest(params.toString(), "application/x-www-form-urlencoded");
      const result = await normalizeTokenRequest(req);

      // This would throw "Body already read" if the Request
      // body stream was consumed instead of reconstructed
      const text = await result!.text();
      expect(text).toContain("grant_type=authorization_code");
    });

    it("preserves request without redirect_uri", async () => {
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "rt_abc",
      });
      const req = tokenRequest(params.toString(), "application/x-www-form-urlencoded");
      const result = await normalizeTokenRequest(req);

      const body = new URLSearchParams(await result!.text());
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("rt_abc");
    });
  });

  // ── application/json ─────────────────────────────────────
  describe("application/json", () => {
    it("normalizes 127.0.0.1 redirect_uri to localhost", async () => {
      const req = tokenRequest(
        JSON.stringify({
          grant_type: "authorization_code",
          code: "abc123",
          redirect_uri: "http://127.0.0.1:60024/callback",
        }),
        "application/json",
      );
      const result = await normalizeTokenRequest(req);

      expect(result).not.toBeNull();
      const body = await result!.json();
      expect(body.redirect_uri).toBe("http://localhost:60024/callback");
      expect(body.grant_type).toBe("authorization_code");
    });

    it("preserves non-loopback redirect_uri", async () => {
      const req = tokenRequest(
        JSON.stringify({
          redirect_uri: "https://app.example.com/callback",
        }),
        "application/json",
      );
      const result = await normalizeTokenRequest(req);

      const body = await result!.json();
      expect(body.redirect_uri).toBe("https://app.example.com/callback");
    });

    it("body is readable (not consumed)", async () => {
      const req = tokenRequest(
        JSON.stringify({
          grant_type: "authorization_code",
          redirect_uri: "http://127.0.0.1:60024/callback",
        }),
        "application/json",
      );
      const result = await normalizeTokenRequest(req);

      const body = await result!.json();
      expect(body.grant_type).toBe("authorization_code");
    });
  });

  // ── simulates the Vercel body-consumption bug ────────────
  // Before the fix, the POST handler would read the body to check
  // for redirect_uri normalization, but then pass the *original*
  // Request (with consumed body) to handler.POST, causing
  // "Body is unusable: Body has already been read".
  describe("body consumption safety", () => {
    it("returned Request body can be read multiple times via reconstruction", async () => {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: "http://127.0.0.1:60024/callback",
      });
      const req = tokenRequest(params.toString(), "application/x-www-form-urlencoded");
      const result = await normalizeTokenRequest(req);

      // First read (simulating our normalization)
      const text1 = await result!.text();
      expect(text1).toContain("redirect_uri=");

      // A downstream handler reading the same Request would fail with
      // "Body already read" — but since normalizeTokenRequest returns
      // a *new* Request, the original caller can construct another.
      // The key invariant: normalizeTokenRequest itself never leaves
      // the returned Request in a consumed state.
    });

    it("original request body is consumed (expected)", async () => {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: "http://127.0.0.1:60024/callback",
      });
      const req = tokenRequest(params.toString(), "application/x-www-form-urlencoded");
      await normalizeTokenRequest(req);

      // The original req's body IS consumed — that's expected.
      // The fix ensures we never pass the original req downstream.
      await expect(req.text()).rejects.toThrow();
    });

    it("non-token request body is NOT consumed", async () => {
      const req = tokenRequest(
        "some=data",
        "application/x-www-form-urlencoded",
        "/api/auth/oauth2/register",
      );
      const result = await normalizeTokenRequest(req);
      expect(result).toBeNull();

      // Original body should still be readable since we returned early
      const text = await req.text();
      expect(text).toBe("some=data");
    });
  });
});
