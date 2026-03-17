import type { AgentMode, ProviderConfig, ProviderInfo } from "./types";
import { AgentAuthSDKError } from "./types";

const WELL_KNOWN_PATH = "/.well-known/agent-configuration";

/**
 * Fetch the discovery document from a service URL — §6.1.
 * Tries both `{url}/.well-known/agent-configuration` and
 * `{url}/api/auth/agent/agent-configuration` (Better Auth default mount).
 */
export async function discoverProvider(
	url: string,
	fetchFn: typeof globalThis.fetch = globalThis.fetch
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
				if (!(config.version && config.issuer && config.endpoints)) {
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
		`Could not discover Agent Auth configuration at ${base}. ${lastError?.message ?? ""}`.trim()
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
	}
): Promise<ProviderInfo[]> {
	const configs = await searchRegistryFull(registryUrl, intent, opts);
	return configs.map((c) => ({
		name: c.provider_name,
		description: c.description,
		issuer: c.issuer,
	}));
}

/**
 * Search a registry and return full ProviderConfig objects.
 * The registry response includes complete config data (endpoints, modes, etc.)
 * which allows callers to cache and use providers immediately.
 */
export async function searchRegistryFull(
	registryUrl: string,
	intent: string,
	opts?: {
		limit?: number;
		fetchFn?: typeof globalThis.fetch;
	}
): Promise<ProviderConfig[]> {
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
			res.status
		);
	}

	const body = (await res.json()) as {
		providers?: Array<{
			version?: string;
			provider_name?: string;
			description?: string;
			issuer?: string;
			algorithms?: string[];
			modes?: string[];
			approval_methods?: string[];
			endpoints?: Record<string, string>;
			jwks_uri?: string;
			url?: string;
		}>;
	};

	return (body.providers ?? [])
		.filter((p) => p.version && p.issuer && p.endpoints)
		.map((p) => ({
			version: p.version!,
			provider_name: p.provider_name ?? "unknown",
			description: p.description ?? "",
			issuer: p.issuer!,
			algorithms: p.algorithms ?? [],
			modes: (p.modes ?? []) as AgentMode[],
			approval_methods: p.approval_methods ?? [],
			endpoints: p.endpoints!,
			jwks_uri: p.jwks_uri,
		}));
}

function extractHostname(input: string): string | null {
	try {
		const normalized = input.startsWith("http") ? input : `https://${input}`;
		return new URL(normalized).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

/**
 * Look up a provider from the registry by URL or domain.
 * Extracts the hostname, searches the registry using it as the intent,
 * then matches results by issuer hostname.
 */
export async function lookupByUrl(
	registryUrl: string,
	serviceUrl: string,
	opts?: { fetchFn?: typeof globalThis.fetch }
): Promise<ProviderConfig | null> {
	const hostname = extractHostname(serviceUrl);
	if (!hostname) {
		return null;
	}

	let configs: ProviderConfig[];
	try {
		configs = await searchRegistryFull(registryUrl, hostname, {
			limit: 5,
			fetchFn: opts?.fetchFn,
		});
	} catch {
		return null;
	}

	for (const config of configs) {
		const issuerHost = extractHostname(config.issuer);
		if (!issuerHost) {
			continue;
		}
		if (
			issuerHost === hostname ||
			issuerHost.endsWith(`.${hostname}`) ||
			hostname.endsWith(`.${issuerHost}`)
		) {
			return config;
		}
	}

	return null;
}
