import { auth } from "@/lib/auth";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3400";

export const dynamic = "force-dynamic";

// RFC 8414 §3.3 — issuer MUST match the authorization server identifier
// used by the PRM's authorization_servers array (BASE_URL).
// Better Auth sets issuer to BASE_URL + basePath (/api/auth), so we override.
export const GET = async () => {
  const metadata = await auth.api.getOAuthServerConfig();
  return new Response(JSON.stringify({ ...metadata, issuer: BASE_URL }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  });
};
