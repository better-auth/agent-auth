import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// RFC 8414 §3.3 — issuer MUST match the authorization server identifier
// used by the PRM's authorization_servers array (the request origin).
// Better Auth appends its basePath (/api/auth), so we override to match.
export const GET = async (req: Request) => {
  const origin = new URL(req.url).origin;
  const metadata = await auth.api.getOAuthServerConfig();
  return new Response(JSON.stringify({ ...metadata, issuer: origin }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  });
};
