import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isLoopback, isLoopbackPortVariant, normalizeTokenRequest } from "@/lib/loopback";

const handler = toNextJsHandler(auth);

// Normalize redirect_uri in token exchange POST so it matches the
// localhost-normalized value stored during authorize (Vercel rewrites
// 127.0.0.1 → localhost in GET query strings but not in POST bodies).
// Uses normalizeTokenRequest which always reconstructs the Request
// to avoid "Body already read" on runtimes with unreliable clone().
export async function POST(req: Request) {
  try {
    const normalized = await normalizeTokenRequest(req);
    if (normalized) return handler.POST!(normalized);
  } catch {
    // Never block the token flow
  }
  return handler.POST!(req);
}

// RFC 8252 §7.3 — loopback redirect URIs ignore port during matching.
// Native clients use ephemeral ports, so the port may differ between
// DCR and authorize. We add the requested port variant to the client's
// stored redirect URIs before Better Auth validates.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/oauth2/authorize")) {
      const redirectUri = url.searchParams.get("redirect_uri");
      const clientId = url.searchParams.get("client_id");
      if (redirectUri && clientId) {
        const ru = new URL(redirectUri);
        if (ru.protocol === "http:" && isLoopback(ru.hostname)) {
          const [client] = await db
            .select()
            .from(schema.oauthClient)
            .where(eq(schema.oauthClient.clientId, clientId))
            .limit(1);
          if (
            client &&
            !client.redirectUris.includes(redirectUri) &&
            isLoopbackPortVariant(redirectUri, client.redirectUris)
          ) {
            await db
              .update(schema.oauthClient)
              .set({
                redirectUris: [...client.redirectUris, redirectUri],
              })
              .where(eq(schema.oauthClient.clientId, clientId));
          }
        }
      }
    }
  } catch {
    // Never block the authorize flow
  }
  return handler.GET!(req);
}
