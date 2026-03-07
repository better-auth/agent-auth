import type { Auth } from "better-auth";

/**
 * Verify an agent JWT in a custom route handler (outside Better Auth endpoints).
 *
 * Forwards the JWT to the plugin's middleware via internal headers
 * (`x-agent-method`, `x-agent-path`) so DPoP request binding
 * validates against the custom route's method and path.
 */
export async function verifyAgentRequest(
	request: Request,
	auth: Auth,
	options?: {
		/** Override the HTTP method for request binding. */
		method?: string;
		/** Override the path for request binding. */
		path?: string;
	},
) {
	const authHeader = request.headers.get("authorization");
	if (!authHeader) return null;

	const url = new URL(request.url);
	const headers = new Headers(request.headers);

	if (options?.method) {
		headers.set("x-agent-method", options.method);
	} else {
		headers.set("x-agent-method", request.method);
	}

	if (options?.path) {
		headers.set("x-agent-path", options.path);
	} else {
		headers.set("x-agent-path", url.pathname);
	}

	const sessionRequest = new Request(
		`${auth.options.baseURL}/api/auth/agent/session`,
		{
			method: "GET",
			headers,
		},
	);

	const response = await auth.handler(sessionRequest);
	if (!response.ok) return null;

	try {
		return await response.json();
	} catch {
		return null;
	}
}
