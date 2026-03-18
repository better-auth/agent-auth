import type { Capability } from "./types";

function tokenize(str: string): string[] {
	return str
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
}

function stem(word: string): string {
	if (word.length <= 3) return word;
	if (word.endsWith("ies") && word.length > 4)
		return word.slice(0, -3) + "y";
	if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
	if (word.endsWith("tion") && word.length > 5) return word.slice(0, -4);
	if (word.endsWith("ness") && word.length > 5) return word.slice(0, -4);
	if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
	if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3)
		return word.slice(0, -1);
	return word;
}

function stemmedMatch(a: string, b: string): boolean {
	if (a === b) return true;
	const sa = stem(a);
	const sb = stem(b);
	return sa === sb || sa.startsWith(sb) || sb.startsWith(sa);
}

const SYNONYMS: Record<string, string[]> = {
	email: ["message", "mail"],
	message: ["email", "mail"],
	mail: ["email", "message"],
	send: ["deliver", "dispatch", "compose"],
	delete: ["remove", "trash", "destroy"],
	remove: ["delete", "trash"],
	trash: ["delete", "remove"],
	create: ["add", "new", "make"],
	add: ["create", "new"],
	get: ["read", "fetch", "retrieve", "view"],
	read: ["get", "fetch", "view"],
	fetch: ["get", "read", "retrieve"],
	update: ["modify", "edit", "change", "patch"],
	modify: ["update", "edit", "change"],
	edit: ["update", "modify", "change"],
};

function expandWithSynonyms(term: string): string[] {
	const stemmed = stem(term);
	const syns = SYNONYMS[term] ?? SYNONYMS[stemmed] ?? [];
	return [term, stemmed, ...syns, ...syns.map(stem)];
}

function termMatchesToken(term: string, token: string): boolean {
	const expanded = expandWithSynonyms(term);
	return expanded.some((t) => stemmedMatch(t, token));
}

function termMatchesText(term: string, text: string): boolean {
	const expanded = expandWithSynonyms(term);
	return expanded.some((t) => text.includes(t));
}

const GLOB_CHARS = /[*?]/;
const REGEX_PREFIX = /^\/(.+)\/([gimsuy]*)$/;

function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const re = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
	return new RegExp(`^${re}$`, "i");
}

function parseRegex(query: string): RegExp | null {
	const m = query.match(REGEX_PREFIX);
	if (!m) return null;
	try {
		return new RegExp(m[1], m[2]);
	} catch {
		return null;
	}
}

function matchPattern(re: RegExp, capabilities: Capability[]): Capability[] {
	const nameMatches: Capability[] = [];
	const descMatches: Capability[] = [];

	for (const cap of capabilities) {
		if (re.test(cap.name)) {
			nameMatches.push(cap);
		} else if (cap.description && re.test(cap.description)) {
			descMatches.push(cap);
		}
	}

	return [...nameMatches, ...descMatches];
}

/**
 * Search capabilities by query. Supports glob (`*`, `?`),
 * regex (`/pattern/flags`), and multi-term text search.
 */
export function matchQuery(
	query: string,
	capabilities: Capability[],
): Capability[] {
	if (capabilities.length === 0) return [];

	const raw = query.trim();
	if (!raw) return capabilities;

	const regex = parseRegex(raw);
	if (regex) return matchPattern(regex, capabilities);

	if (GLOB_CHARS.test(raw))
		return matchPattern(globToRegex(raw), capabilities);

	const terms = raw.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return capabilities;

	const scored: Array<{ cap: Capability; score: number }> = [];

	for (const cap of capabilities) {
		const nameTokens = tokenize(cap.name);
		const nameLower = cap.name.toLowerCase();
		const descTokens = tokenize(cap.description ?? "");
		const descLower = (cap.description ?? "").toLowerCase();

		let nameHits = 0;
		let descHits = 0;

		for (const term of terms) {
			const inName =
				termMatchesText(term, nameLower) ||
				nameTokens.some((t) => termMatchesToken(term, t));
			const inDesc =
				termMatchesText(term, descLower) ||
				descTokens.some((t) => termMatchesToken(term, t));

			if (inName) {
				nameHits++;
			} else if (inDesc) {
				descHits++;
			}
		}

		const score = nameHits * 2 + descHits;
		if (score > 0) {
			scored.push({ cap, score });
		}
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.map((s) => s.cap);
}
