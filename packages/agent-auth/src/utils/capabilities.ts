/**
 * Capability matching and manipulation utilities.
 *
 * Supports wildcard matching (§4.3):
 *   "github.*" covers "github.create_issue"
 *   "*" covers everything
 *
 * Also handles provider-prefixed capability IDs: client MAY prefix
 * IDs with the provider name ("github.list_issues") — the server
 * never sees prefixed identifiers (§4.3).
 */

/**
 * Check if a single granted capability covers a required capability.
 * Supports trailing wildcards: "github.*" matches "github.create_issue".
 * Handles provider-prefix stripping: if the required ID is
 * "acme.get_balance" and the granted ID is "get_balance", it matches.
 */
function capabilityCovers(granted: string, required: string): boolean {
	if (granted === required || granted === "*") return true;
	if (granted.endsWith(".*")) {
		const prefix = granted.slice(0, -1);
		return required.startsWith(prefix);
	}
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

/** Check if a set of granted capabilities covers a single required one. */
export function hasCapability(
	granted: string[],
	required: string,
): boolean {
	return granted.some((g) => capabilityCovers(g, required));
}

/** Check if a set of granted capabilities covers ALL required ones. */
export function hasAllCapabilities(
	granted: string[],
	required: string[],
): boolean {
	return required.every((r) => hasCapability(granted, r));
}

/** Check if all `capabilityIds` are covered by `allowed`. */
export function isSubsetOf(
	capabilityIds: string[],
	allowed: string[],
): boolean {
	return capabilityIds.every((s) => hasCapability(allowed, s));
}

/**
 * Merge and deduplicate capability ID sets.
 * Wildcards subsume specific IDs ("github.*" removes "github.create_issue").
 */
export function mergeCapabilities(...sets: string[][]): string[] {
	const all = [...new Set(sets.flat())];
	return all.filter((id) => {
		if (id.endsWith(".*") || id === "*") return true;
		return !all.some((other) => other !== id && capabilityCovers(other, id));
	});
}

/** Returns blocked capability IDs found in the list. */
export function findBlockedCapabilities(
	capabilityIds: string[],
	blocked: string[],
): string[] {
	if (blocked.length === 0) return [];
	return capabilityIds.filter((s) =>
		blocked.some((b) => capabilityCovers(b, s)),
	);
}

/**
 * Robustly parse a capability IDs value from the database.
 * Handles arrays, JSON strings, and double-encoded strings.
 */
export function parseCapabilityIds(value: unknown): string[] {
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
