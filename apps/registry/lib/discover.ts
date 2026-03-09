export interface ProviderConfig {
	version: string;
	provider_name: string;
	description?: string;
	issuer: string;
	algorithms: string[];
	modes: string[];
	approval_methods: string[];
	endpoints: Record<string, string>;
	jwks_uri?: string;
}

const KNOWN_PATHS = ["/api/auth", "/auth", "/api"];
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(
	url: string,
	timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { signal: controller.signal, redirect: "follow" });
	} finally {
		clearTimeout(timer);
	}
}

export async function discoverProvider(
	baseUrl: string,
): Promise<ProviderConfig | null> {
	const normalized = baseUrl.replace(/\/+$/, "");

	try {
		const res = await fetchWithTimeout(
			`${normalized}/.well-known/agent-configuration`,
		);
		if (res.ok) {
			return (await res.json()) as ProviderConfig;
		}
	} catch {}

	for (const prefix of KNOWN_PATHS) {
		try {
			const res = await fetchWithTimeout(
				`${normalized}${prefix}/agent-configuration`,
			);
			if (res.ok) {
				return (await res.json()) as ProviderConfig;
			}
		} catch {}
	}

	return null;
}
