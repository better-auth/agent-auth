import type { ProviderConfig, ProviderInfo } from "./types";
import { AgentAuthSDKError } from "./types";

const WELL_KNOWN_PATH = "/.well-known/agent-configuration";

/**
 * Fetch the discovery document from a service URL — §6.1.
 * Tries both `{url}/.well-known/agent-configuration` and
 * `{url}/api/auth/agent/agent-configuration` (Better Auth default mount).
 */
export async function discoverProvider(
	url: string,
	fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<ProviderConfig> {
	const base = url.replace(/\/+$/, "");

	const urls = [
		`${base}${WELL_KNOWN_PATH}`,
		`${base}/api/auth/agent/agent-configuration`,
	];

	let lastError: Error | null = null;

	for (const discoveryUrl of urls) {
		try {
			const res = await fetchFn(discoveryUrl, {
				method: "GET",
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(10_000),
			});
			if (res.ok) {
				const config = (await res.json()) as ProviderConfig;
				if (!config.version || !config.issuer || !config.endpoints) {
					continue;
				}
				return config;
			}
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
		}
	}

	throw new AgentAuthSDKError(
		"discovery_failed",
		`Could not discover Agent Auth configuration at ${base}. ${lastError?.message ?? ""}`.trim(),
	);
}

/**
 * Search a registry for providers matching an intent — §7.10.
 */
export async function searchProviders(
	registryUrl: string,
	intent: string,
	opts?: {
		limit?: number;
		fetchFn?: typeof globalThis.fetch;
	},
): Promise<ProviderInfo[]> {
	const fetchFn = opts?.fetchFn ?? globalThis.fetch;
	const limit = opts?.limit ?? 10;

	const url = new URL("/api/search", registryUrl);
	url.searchParams.set("intent", intent);
	url.searchParams.set("limit", String(limit));

	const res = await fetchFn(url.toString(), {
		method: "GET",
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(10_000),
	});

	if (!res.ok) {
		throw new AgentAuthSDKError(
			"registry_search_failed",
			`Registry search failed: ${res.status} ${res.statusText}`,
			res.status,
		);
	}

	const body = (await res.json()) as {
		providers?: Array<{
			provider_name?: string;
			description?: string;
			issuer?: string;
		}>;
	};

	return (body.providers ?? []).map((p) => ({
		name: p.provider_name ?? "unknown",
		description: p.description ?? "",
		issuer: p.issuer,
	}));
}
