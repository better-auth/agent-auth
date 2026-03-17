import type { Auth } from "better-auth";

/**
 * Verify an agent JWT in a custom route handler (outside Better Auth endpoints).
 *
 * Forwards the JWT to the plugin's `/agent/session` endpoint which runs
 * the full verification flow (§5.5) and returns the agent session.
 */
export async function verifyAgentRequest(request: Request, auth: Auth) {
	const authHeader = request.headers.get("authorization");
	if (!authHeader) {
		return null;
	}

	const headers = new Headers(request.headers);

	const sessionRequest = new Request(
		`${auth.options.baseURL}/api/auth/agent/session`,
		{
			method: "GET",
			headers,
		}
	);

	const response = await auth.handler(sessionRequest);
	if (!response.ok) {
		return null;
	}

	try {
		return await response.json();
	} catch {
		return null;
	}
}
