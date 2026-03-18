import { auth } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// RFC 8414 §3.1 — path-aware AS metadata discovery.
// Clients may append the resource path to the well-known URL.
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
