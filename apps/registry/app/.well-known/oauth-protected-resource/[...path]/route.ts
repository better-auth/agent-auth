export const dynamic = "force-dynamic";

// RFC 9728 §3 — path-aware PRM discovery.
// Clients for https://example.com/api/mcp discover PRM at:
//   /.well-known/oauth-protected-resource/api/mcp
export const GET = async (req: Request) => {
	const origin = new URL(req.url).origin;
	const metadata = {
		resource: `${origin}/api/mcp`,
		authorization_servers: [origin],
	};
	return new Response(JSON.stringify(metadata), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control":
				"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
		},
	});
};
