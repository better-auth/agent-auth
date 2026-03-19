// RFC 8252 §7.3 — utilities for loopback redirect URI handling.
// Vercel rewrites 127.0.0.1 → localhost in query strings (SSRF protection),
// so we normalize all loopback IP variants to localhost at storage time
// and allow ephemeral port changes at authorize time.

export function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Rewrites 127.0.0.1 and [::1] to localhost in loopback HTTP URIs.
 * Non-loopback and HTTPS URIs are returned unchanged.
 */
export function normalizeLoopbackUri(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "[::1]")) {
      u.hostname = "localhost";
      return u.toString();
    }
  } catch {}
  return uri;
}

/**
 * Checks whether `requestedUri` should be allowed as a loopback
 * port variant of one of the `storedUris`. Returns true when both
 * URIs are loopback HTTP with the same path, differing only in port.
 */
export function isLoopbackPortVariant(requestedUri: string, storedUris: string[]): boolean {
  try {
    const ru = new URL(requestedUri);
    if (ru.protocol !== "http:" || !isLoopback(ru.hostname)) return false;
    const pathKey = ru.pathname;
    return storedUris.some((r) => {
      try {
        const x = new URL(r);
        return x.protocol === "http:" && isLoopback(x.hostname) && x.pathname === pathKey;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Normalizes loopback redirect_uri in a token exchange Request body.
 * Always returns a new Request with a fresh body so the original stream
 * is never consumed — avoiding "Body already read" on runtimes where
 * Request.clone() is unreliable (e.g. Vercel).
 *
 * Returns null if the request doesn't need processing (not a token
 * endpoint or unsupported content-type), meaning the caller should
 * pass the original request through.
 */
export async function normalizeTokenRequest(req: Request): Promise<Request | null> {
  const url = new URL(req.url);
  if (!url.pathname.endsWith("/oauth2/token")) return null;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    const redirectUri = params.get("redirect_uri");
    if (redirectUri) {
      params.set("redirect_uri", normalizeLoopbackUri(redirectUri));
    }
    return new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: params.toString(),
    });
  }

  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (body.redirect_uri) {
      body.redirect_uri = normalizeLoopbackUri(body.redirect_uri);
    }
    return new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(body),
    });
  }

  return null;
}
