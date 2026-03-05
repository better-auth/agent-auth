/**
 * Semantic intent search for registry providers.
 *
 * Uses a local sentence-transformer model to embed provider
 * descriptions and match against natural-language intents.
 * Falls back to keyword matching if the model fails to load.
 */

type Pipeline = (
	texts: string[],
	options?: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

const pipelineState = {
	instance: null as Pipeline | null,
	loading: null as Promise<Pipeline | null> | null,
	failed: false,
};

function loadPipeline(): Promise<Pipeline | null> {
	if (pipelineState.failed) return Promise.resolve(null);
	if (pipelineState.instance) return Promise.resolve(pipelineState.instance);
	if (pipelineState.loading) return pipelineState.loading;

	pipelineState.loading = (async () => {
		try {
			const { pipeline } = await import("@huggingface/transformers");
			const extractor = await pipeline("feature-extraction", MODEL_ID, {
				dtype: "fp32",
			});
			pipelineState.instance = extractor as unknown as Pipeline;
			return pipelineState.instance;
		} catch (err) {
			console.warn(
				"Failed to load embedding model, using keyword fallback:",
				err,
			);
			pipelineState.failed = true;
			return null;
		} finally {
			pipelineState.loading = null;
		}
	})();

	return pipelineState.loading;
}

void loadPipeline();

const embeddingCache = new Map<string, number[]>();
const CACHE_TTL_MS = 30 * 60 * 1000;
let cacheCreatedAt = Date.now();

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

async function embed(texts: string[]): Promise<number[][]> {
	const extractor = await loadPipeline();
	if (!extractor) return [];

	const result = await extractor(texts, {
		pooling: "mean",
		normalize: true,
	});
	return result.tolist();
}

export interface ProviderForSearch {
	name: string;
	displayName: string;
	description: string;
	categories: string[];
	[key: string]: unknown;
}

/**
 * Rank providers by semantic similarity to a natural-language intent.
 * Returns providers sorted by relevance score (descending).
 * Providers below the threshold are excluded.
 */
export async function rankByIntent<T extends ProviderForSearch>(
	providers: T[],
	intent: string,
	threshold = 0.2,
): Promise<T[]> {
	if (providers.length === 0) return [];

	if (Date.now() - cacheCreatedAt > CACHE_TTL_MS) {
		embeddingCache.clear();
		cacheCreatedAt = Date.now();
	}

	const extractor = await loadPipeline();
	if (!extractor) {
		return keywordFallback(providers, intent);
	}

	const uncachedTexts: string[] = [];
	const uncachedKeys: string[] = [];

	for (const p of providers) {
		const key = `${p.name}::${p.description}`;
		if (!embeddingCache.has(key)) {
			const cats =
				p.categories.length > 0 ? ` (${p.categories.join(", ")})` : "";
			uncachedTexts.push(`${p.displayName}: ${p.description}${cats}`);
			uncachedKeys.push(key);
		}
	}

	if (uncachedTexts.length > 0) {
		try {
			const embeddings = await embed(uncachedTexts);
			for (let i = 0; i < uncachedKeys.length; i++) {
				if (embeddings[i]) {
					embeddingCache.set(uncachedKeys[i], embeddings[i]);
				}
			}
		} catch {
			return keywordFallback(providers, intent);
		}
	}

	let intentEmbedding: number[];
	try {
		const [emb] = await embed([intent]);
		if (!emb) return keywordFallback(providers, intent);
		intentEmbedding = emb;
	} catch {
		return keywordFallback(providers, intent);
	}

	const scored = providers.map((p) => {
		const key = `${p.name}::${p.description}`;
		const capEmb = embeddingCache.get(key);
		const score = capEmb ? cosineSimilarity(intentEmbedding, capEmb) : 0;
		return { provider: p, score };
	});

	scored.sort((a, b) => b.score - a.score);

	return scored.filter((s) => s.score >= threshold).map((s) => s.provider);
}

function keywordFallback<T extends ProviderForSearch>(
	providers: T[],
	intent: string,
): T[] {
	const intentTokens = tokenize(intent);
	if (intentTokens.length === 0) return providers;

	const scored = providers.map((p) => {
		const text = `${p.name.replace(/[._-]/g, " ")} ${p.displayName} ${p.description} ${p.categories.join(" ")}`;
		const capTokens = tokenize(text);
		let matches = 0;
		for (const token of intentTokens) {
			if (capTokens.some((ct) => ct.includes(token) || token.includes(ct))) {
				matches++;
			}
		}
		return { provider: p, score: matches / intentTokens.length };
	});

	scored.sort((a, b) => b.score - a.score);
	return scored.filter((s) => s.score > 0).map((s) => s.provider);
}

const STOP_WORDS = new Set([
	"a",
	"an",
	"the",
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
	"may",
	"might",
	"can",
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
	"through",
	"during",
	"before",
	"after",
	"and",
	"but",
	"or",
	"nor",
	"not",
	"so",
	"if",
	"then",
	"than",
	"too",
	"very",
	"just",
	"about",
	"up",
	"out",
	"no",
	"all",
	"any",
	"i",
	"me",
	"my",
	"we",
	"our",
	"you",
	"your",
	"it",
	"its",
	"this",
	"that",
	"these",
	"those",
	"want",
	"need",
	"like",
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}
