import type { Capability } from "../types";

const STOP_WORDS = new Set([
	"a",
	"an",
	"the",
	"my",
	"your",
	"our",
	"their",
	"this",
	"that",
	"it",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"have",
	"has",
	"had",
	"do",
	"does",
	"did",
	"will",
	"would",
	"could",
	"should",
	"can",
	"may",
	"might",
	"shall",
	"to",
	"of",
	"in",
	"for",
	"on",
	"with",
	"at",
	"by",
	"from",
	"as",
	"into",
	"about",
	"up",
	"out",
	"all",
	"i",
	"me",
	"we",
	"us",
	"he",
	"she",
	"they",
	"them",
	"and",
	"or",
	"but",
	"not",
	"so",
	"if",
	"then",
	"just",
	"also",
	"some",
	"want",
	"need",
	"please",
]);

/**
 * Synonym groups — all words in a group are treated as equivalent
 * during intent matching. Covers common action verbs an agent
 * would use when describing what it wants to do.
 */
const SYNONYM_GROUPS: string[][] = [
	["create", "make", "add", "new", "provision", "generate", "build"],
	["delete", "remove", "destroy", "drop", "erase"],
	["list", "show", "fetch", "enumerate", "browse"],
	["get", "read", "view", "inspect", "check", "look", "retrieve"],
	["search", "find", "query", "lookup", "discover"],
	["update", "edit", "modify", "change", "patch", "alter"],
	["deploy", "ship", "release", "publish", "launch", "rollout"],
	["monitor", "watch", "observe", "track"],
	["send", "push", "notify", "alert", "message"],
	["start", "begin", "run", "execute", "trigger", "invoke"],
	["stop", "end", "halt", "cancel", "abort", "terminate", "kill"],
	["upload", "attach", "import"],
	["download", "export", "extract"],
	["enable", "activate", "turn on"],
	["disable", "deactivate", "turn off"],
	["config", "configure", "setup", "setting"],
];

const synonymMap = new Map<string, Set<string>>();

for (const group of SYNONYM_GROUPS) {
	const groupSet = new Set(group);
	for (const word of group) {
		const existing = synonymMap.get(word);
		if (existing) {
			for (const w of groupSet) existing.add(w);
		} else {
			synonymMap.set(word, new Set(groupSet));
		}
	}
}

/**
 * Lightweight suffix stripping. Not a full Porter stemmer — just
 * enough to collapse "deployment"→"deploy", "creating"→"creat", etc.
 * Applied identically to both query and document tokens so mismatches
 * don't matter as long as they're consistent.
 */
function stem(word: string): string {
	if (word.length <= 3) return word;

	const rules: [RegExp, string][] = [
		[/ies$/, "y"],
		[/ies$/, "y"],
		[/sses$/, "ss"],
		[/([^s])s$/, "$1"],
		[/ement$/, ""],
		[/ment$/, ""],
		[/ation$/, ""],
		[/tion$/, ""],
		[/sion$/, ""],
		[/ing$/, ""],
		[/able$/, ""],
		[/ible$/, ""],
		[/ness$/, ""],
		[/ful$/, ""],
		[/less$/, ""],
		[/ous$/, ""],
		[/ive$/, ""],
		[/ly$/, ""],
		[/ed$/, ""],
		[/er$/, ""],
	];

	for (const [pattern, replacement] of rules) {
		if (pattern.test(word)) {
			const result = word.replace(pattern, replacement);
			if (result.length >= 3) return result;
		}
	}

	return word;
}

/**
 * Tokenize a string into normalized, stemmed tokens with stop words removed.
 * Splits on whitespace, underscores, hyphens, dots, and camelCase boundaries.
 */
function tokenize(text: string): string[] {
	const expanded = text.replace(/([a-z])([A-Z])/g, "$1 $2");
	const raw = expanded.toLowerCase().split(/[\s_\-./,;:]+/);
	return raw
		.map((t) => t.replace(/[^a-z0-9]/g, ""))
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t))
		.map(stem);
}

/**
 * Expand a set of tokens with their synonyms (also stemmed).
 */
function expandWithSynonyms(tokens: string[]): Set<string> {
	const expanded = new Set(tokens);
	for (const token of tokens) {
		for (const [key, group] of synonymMap) {
			if (stem(key) === token) {
				for (const syn of group) expanded.add(stem(syn));
			}
		}
	}
	return expanded;
}

/**
 * Build a searchable text blob from a capability.
 * The name is repeated to give it extra weight.
 */
function capabilityText(c: Capability): string {
	const parts = [c.name, c.name, c.description];
	return parts.join(" ");
}

interface ScoredCapability {
	capability: Capability;
	score: number;
}

/**
 * BM25-based query matching against capability name and description.
 *
 * Tokenizes the query and each capability's text (name + description),
 * applies stemming and synonym expansion on the query side, then
 * ranks using BM25 scoring. Returns capabilities with score > 0,
 * sorted by relevance.
 */
export function matchQuery(
	query: string,
	capabilities: Capability[],
): Capability[] {
	if (capabilities.length === 0) return [];

	const queryTokens = tokenize(query);
	if (queryTokens.length === 0) return capabilities;
	const expandedQuery = expandWithSynonyms(queryTokens);

	const docs = capabilities.map((c) => ({
		capability: c,
		tokens: tokenize(capabilityText(c)),
	}));

	const N = docs.length;
	const avgdl =
		docs.reduce((sum, d) => sum + d.tokens.length, 0) / N || 1;

	const df = new Map<string, number>();
	for (const doc of docs) {
		const unique = new Set(doc.tokens);
		for (const t of unique) {
			df.set(t, (df.get(t) ?? 0) + 1);
		}
	}

	const k1 = 1.5;
	const b = 0.75;

	const scored: ScoredCapability[] = docs.map((doc) => {
		const dl = doc.tokens.length;
		const tf = new Map<string, number>();
		for (const t of doc.tokens) {
			tf.set(t, (tf.get(t) ?? 0) + 1);
		}

		let score = 0;
		for (const qt of expandedQuery) {
			const termFreq = tf.get(qt) ?? 0;
			if (termFreq === 0) continue;
			const docFreq = df.get(qt) ?? 0;
			const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
			score +=
				idf * ((termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (dl / avgdl))));
		}

		return { capability: doc.capability, score };
	});

	return scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((s) => s.capability);
}
