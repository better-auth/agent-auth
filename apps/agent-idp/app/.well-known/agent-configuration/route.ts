import { env } from "@/lib/env";

/**
 * GET /.well-known/agent-configuration
 *
 * Discovery document per §2.1. Proxies to the plugin's discover endpoint
 * and adds IDP-specific extensions (gateway endpoints).
 */
export async function GET() {
	const baseUrl = env.BETTER_AUTH_URL.replace(/\/+$/, "");

	const res = await fetch(`${baseUrl}/api/auth/agent/discover`, {
		headers: { Accept: "application/json" },
	});

	if (!res.ok) {
		return Response.json(
			{ error: "Failed to fetch agent configuration" },
			{ status: res.status },
		);
	}

	const data = await res.json();

	data.endpoints = {
		...data.endpoints,
		gateway_tools: "/agent/gateway/tools",
		gateway_call: "/agent/gateway/call",
	};

	return Response.json(data, {
		headers: { "Cache-Control": "public, max-age=3600" },
	});
}
