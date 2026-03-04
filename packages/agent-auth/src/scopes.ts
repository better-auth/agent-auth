/**
 * Scope matching and manipulation utilities.
 *
 * Supports wildcard matching per §10.2:
 *   "github.*" covers "github.create_issue"
 *   "*" covers everything
 */

/**
 * Check if a single granted scope covers a required scope.
 * Supports trailing wildcards: "github.*" matches "github.create_issue".
 * Also handles provider-prefixed scopes (§2.3.4): if the required scope
 * is "acme.get_balance" and the granted scope is "get_balance", it matches
 * by stripping the provider prefix from the required scope.
 */
function scopeCovers(granted: string, required: string): boolean {
	if (granted === required || granted === "*") return true;
	if (granted.endsWith(".*")) {
		const prefix = granted.slice(0, -1);
		return required.startsWith(prefix);
	}
	// Provider-prefix stripping: "acme.get_balance" matches "get_balance"
	const dotIdx = required.indexOf(".");
	if (dotIdx !== -1) {
		const unprefixed = required.slice(dotIdx + 1);
		if (granted === unprefixed) return true;
		if (granted.endsWith(".*")) {
			const prefix = granted.slice(0, -1);
			return unprefixed.startsWith(prefix);
		}
	}
	return false;
}

/**
 * Check if a set of granted scopes covers a single required scope.
 */
export function hasScope(granted: string[], required: string): boolean {
	return granted.some((g) => scopeCovers(g, required));
}

/**
 * Check if a set of granted scopes covers ALL required scopes.
 */
export function hasAllScopes(granted: string[], required: string[]): boolean {
	return required.every((r) => hasScope(granted, r));
}

/**
 * Check if a set of granted scopes is a subset of allowed scopes.
 * Every granted scope must be covered by at least one allowed scope.
 */
export function isSubsetOf(scopes: string[], allowed: string[]): boolean {
	return scopes.every((s) => hasScope(allowed, s));
}

/**
 * Merge and deduplicate scopes.
 * Wildcards subsume specific scopes (e.g. "github.*" removes "github.create_issue").
 */
export function mergeScopes(...scopeSets: string[][]): string[] {
	const all = [...new Set(scopeSets.flat())];
	return all.filter((scope) => {
		if (scope.endsWith(".*") || scope === "*") return true;
		return !all.some((other) => other !== scope && scopeCovers(other, scope));
	});
}

/**
 * Check if any scopes in the list are blocked.
 * Returns the blocked scopes found, or empty array if none.
 */
export function findBlockedScopes(
	scopes: string[],
	blocked: string[],
): string[] {
	if (blocked.length === 0) return [];
	return scopes.filter((s) => blocked.some((b) => scopeCovers(b, s)));
}

/**
 * Robustly parse a scopes value from the database.
 * Handles raw arrays (from adapter output transforms), JSON strings,
 * and double-encoded strings (legacy data).
 */
export function parseScopes(value: unknown): string[] {
	if (Array.isArray(value)) return value;
	if (typeof value !== "string" || !value) return [];
	try {
		let parsed: unknown = JSON.parse(value);
		if (typeof parsed === "string") parsed = JSON.parse(parsed);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
