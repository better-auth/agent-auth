import type { Capability } from "../types";

/**
 * Simple substring search against capability name and description.
 * Works like grep — if the query appears anywhere in the name or
 * description (case-insensitive), it's a match. Name matches are
 * ranked above description-only matches.
 */
export function matchQuery(
	query: string,
	capabilities: Capability[],
): Capability[] {
	if (capabilities.length === 0) return [];

	const q = query.toLowerCase().trim();
	if (!q) return capabilities;

	const nameMatches: Capability[] = [];
	const descMatches: Capability[] = [];

	for (const cap of capabilities) {
		if (cap.name.toLowerCase().includes(q)) {
			nameMatches.push(cap);
		} else if (cap.description?.toLowerCase().includes(q)) {
			descMatches.push(cap);
		}
	}

	return [...nameMatches, ...descMatches];
}
