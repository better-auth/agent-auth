import type { Capability } from "./types";
import { AgentAuthSDKError } from "./types";

/**
 * Execute an HTTP capability per §4.2 execution rules.
 *
 * 1. Substitutes path parameters from arguments into URL placeholders.
 * 2. Maps query/header parameters from the input descriptor.
 * 3. Sends remaining arguments as JSON body for body-bearing methods.
 * 4. Attaches the agent JWT as Authorization: Bearer.
 */
export async function executeHttpCapability(opts: {
	capability: Capability;
	token: string;
	arguments?: Record<string, unknown>;
	fetchFn?: typeof globalThis.fetch;
}): Promise<{
	status: number;
	headers: Record<string, string>;
	body: unknown;
}> {
	const fetchFn = opts.fetchFn ?? globalThis.fetch;
	const http = opts.capability.http;
	if (!http) {
		throw new AgentAuthSDKError(
			"no_http_profile",
			`Capability "${opts.capability.name}" has no http execution profile.`,
		);
	}

	const method = http.method.toUpperCase();
	let url = http.url;
	const headers: Record<string, string> = {
		authorization: `Bearer ${opts.token}`,
		...http.headers,
	};

	const args = { ...(opts.arguments ?? {}) };
	const consumed = new Set<string>();

	if (http.input?.parameters) {
		for (const param of http.input.parameters) {
			const value = args[param.name];
			if (value === undefined) {
				if (param.required) {
					throw new AgentAuthSDKError(
						"missing_parameter",
						`Required parameter "${param.name}" not provided for capability "${opts.capability.name}".`,
					);
				}
				continue;
			}

			consumed.add(param.name);
			const strValue = String(value);

			switch (param.in) {
				case "path":
					url = url.replace(`{${param.name}}`, encodeURIComponent(strValue));
					break;
				case "query": {
					const parsedUrl = new URL(url);
					parsedUrl.searchParams.set(param.name, strValue);
					url = parsedUrl.toString();
					break;
				}
				case "header":
					headers[param.name] = strValue;
					break;
			}
		}
	} else {
		// Fallback: substitute URL placeholders from arguments (§4.2 rule 3)
		for (const [key, val] of Object.entries(args)) {
			if (url.includes(`{${key}}`)) {
				url = url.replace(`{${key}}`, encodeURIComponent(String(val)));
				consumed.add(key);
			}
		}
	}

	const remaining: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(args)) {
		if (!consumed.has(key)) {
			remaining[key] = val;
		}
	}

	let requestBody: string | undefined;
	const isBodyMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

	if (http.input?.requestBody) {
		if (Object.keys(remaining).length > 0) {
			headers["content-type"] = "application/json";
			requestBody = JSON.stringify(remaining);
		}
	} else if (isBodyMethod && Object.keys(remaining).length > 0) {
		// Fallback: remaining args → JSON body for body-bearing methods (§4.2 rule 3)
		headers["content-type"] = "application/json";
		requestBody = JSON.stringify(remaining);
	} else if (!isBodyMethod && Object.keys(remaining).length > 0) {
		// Fallback: remaining args → query params for read-style requests (§4.2 rule 3)
		const parsedUrl = new URL(url);
		for (const [key, val] of Object.entries(remaining)) {
			parsedUrl.searchParams.set(key, String(val));
		}
		url = parsedUrl.toString();
	}

	const res = await fetchFn(url, {
		method,
		headers,
		body: requestBody,
	});

	const responseHeaders: Record<string, string> = {};
	res.headers.forEach((value, key) => {
		responseHeaders[key] = value;
	});

	let responseBody: unknown;
	const contentType = res.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		responseBody = await res.json();
	} else {
		responseBody = await res.text();
	}

	if (http.interaction_mode === "async" && res.status === 202) {
		return {
			status: res.status,
			headers: responseHeaders,
			body: responseBody,
		};
	}

	return {
		status: res.status,
		headers: responseHeaders,
		body: responseBody,
	};
}
