import type { ExtensionSettings, User } from "./types";
import { DEFAULT_SETTINGS } from "./types";

function isExtension(): boolean {
	return typeof chrome !== "undefined" && !!chrome?.storage?.local;
}

const memoryStore: Record<string, unknown> = {};

async function get<T>(key: string): Promise<T | undefined> {
	if (!isExtension()) return memoryStore[key] as T | undefined;
	const result = await chrome.storage.local.get(key);
	return result[key] as T | undefined;
}

async function set(data: Record<string, unknown>): Promise<void> {
	if (!isExtension()) {
		Object.assign(memoryStore, data);
		return;
	}
	await chrome.storage.local.set(data);
}

async function remove(keys: string[]): Promise<void> {
	if (!isExtension()) {
		for (const k of keys) delete memoryStore[k];
		return;
	}
	await chrome.storage.local.remove(keys);
}

export const storage = {
	getIdpUrl: () => get<string>("idpUrl"),
	setIdpUrl: (url: string) => set({ idpUrl: url }),

	getSessionToken: () => get<string>("sessionToken"),
	setSessionToken: (token: string) => set({ sessionToken: token }),

	getUser: () => get<User>("user"),
	setUser: (user: User) => set({ user }),

	getSettings: async (): Promise<ExtensionSettings> => {
		const settings = await get<ExtensionSettings>("settings");
		return settings ?? DEFAULT_SETTINGS;
	},
	setSettings: (settings: ExtensionSettings) => set({ settings }),

	getLastSeenIds: async (): Promise<string[]> => {
		return (await get<string[]>("lastSeenIds")) ?? [];
	},
	setLastSeenIds: (ids: string[]) => set({ lastSeenIds: ids }),

	clearSession: () => remove(["sessionToken", "user", "lastSeenIds"]),

	clearAll: () =>
		remove(["idpUrl", "sessionToken", "user", "settings", "lastSeenIds"]),
};
