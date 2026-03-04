export type CatalogTool = { name: string; description: string };
export type CatalogProvider = {
	name: string;
	displayName: string;
	tools: CatalogTool[];
};

type CatalogEntry = { providers: CatalogProvider[]; updatedAt: number };

const catalog = new Map<string, CatalogEntry>();
const CATALOG_TTL_MS = 30 * 60 * 1000;

export function getCatalog(orgId: string): CatalogProvider[] | null {
	const entry = catalog.get(orgId);
	if (!entry) return null;
	if (Date.now() - entry.updatedAt > CATALOG_TTL_MS) return null;
	return entry.providers;
}

export function updateCatalog(
	orgId: string,
	providers: CatalogProvider[],
): void {
	catalog.set(orgId, { providers, updatedAt: Date.now() });
}

export function invalidateCatalog(orgId: string): void {
	catalog.delete(orgId);
}
