export function isScopeCoveredBy(
	scope: string,
	existingScopes: string[],
): boolean {
	for (const s of existingScopes) {
		if (s === "*") return true;
		if (s === scope) return true;
		if (s.endsWith(".*")) {
			const prefix = s.slice(0, -2);
			if (scope === s) return true;
			if (scope.startsWith(prefix + ".")) return true;
		}
	}
	return false;
}

export function isScopeAllowed(
	scopes: string[],
	provider: string,
	tool: string,
): boolean {
	if (scopes.length === 0) return true;
	const fullScope = `${provider}.${tool}`;
	return (
		isScopeCoveredBy(fullScope, scopes) ||
		isScopeCoveredBy(`${provider}.*`, scopes)
	);
}

export function hasAnyScopeForProvider(
	scopes: string[],
	provider: string,
): boolean {
	if (scopes.length === 0) return true;
	for (const s of scopes) {
		if (s === "*") return true;
		if (s === `${provider}.*`) return true;
		if (s.startsWith(`${provider}.`)) return true;
	}
	return false;
}

export function filterUncoveredScopes(
	requestedScopes: string[],
	existingScopes: string[],
): string[] {
	return requestedScopes.filter((s) => !isScopeCoveredBy(s, existingScopes));
}

export function mergeScopes(
	existingScopes: string[],
	newScopes: string[],
): string[] {
	const all = new Set([...existingScopes, ...newScopes]);
	const result: string[] = [];
	const wildcards = new Set<string>();
	for (const s of all) {
		if (s === "*" || s.endsWith(".*")) wildcards.add(s);
	}
	for (const s of all) {
		if (s === "*" || s.endsWith(".*")) {
			result.push(s);
			continue;
		}
		if (!isScopeCoveredBy(s, [...wildcards])) result.push(s);
	}
	return result;
}
