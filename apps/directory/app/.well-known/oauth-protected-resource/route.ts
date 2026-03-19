export const dynamic = "force-dynamic";

// RFC 9728 — resource MUST match the URL the client is connecting to.
// MCP spec (2025-06-18) — clients verify resource matches the MCP server URL.
export const GET = async (req: Request) => {
  const origin = new URL(req.url).origin;
  const metadata = {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  };
  return new Response(JSON.stringify(metadata), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  });
};
