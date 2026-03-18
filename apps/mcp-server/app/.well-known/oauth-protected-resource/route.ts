export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
	const origin = new URL(req.url).origin;
	const metadata = {
		resource: `${origin}/api`,
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
