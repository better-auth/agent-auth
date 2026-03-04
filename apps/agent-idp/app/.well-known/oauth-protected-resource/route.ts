import { env } from "@/lib/env";

export async function GET() {
	const baseUrl = env.BETTER_AUTH_URL.replace(/\/+$/, "");

	const metadata = {
		resource: baseUrl,
		authorization_servers: [`${baseUrl}/api/auth`],
		scopes_supported: ["openid", "profile", "email", "offline_access"],
	};

	return new Response(JSON.stringify(metadata), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control":
				"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
		},
	});
}
