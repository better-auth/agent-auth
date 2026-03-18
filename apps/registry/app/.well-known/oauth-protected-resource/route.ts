import { serverClient } from "@/lib/server-client";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:4200";

export const dynamic = "force-dynamic";

export const GET = async () => {
	const metadata = await serverClient.getProtectedResourceMetadata({
		resource: `${BASE_URL}/api`,
		authorization_servers: [BASE_URL],
	});
	return new Response(JSON.stringify(metadata), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control":
				"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
		},
	});
};
