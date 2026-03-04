import type { AppSettings, User } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const api = window.electronAPI;

export const storage = {
	getIdpUrl: () => api.storeGet("idpUrl") as Promise<string | undefined>,
	setIdpUrl: (url: string) => api.storeSet("idpUrl", url),

	getSessionToken: () =>
		api.storeGet("sessionToken") as Promise<string | undefined>,
	setSessionToken: (token: string) => api.storeSet("sessionToken", token),

	getUser: () => api.storeGet("user") as Promise<User | undefined>,
	setUser: (user: User) => api.storeSet("user", user),

	getSettings: async (): Promise<AppSettings> => {
		const settings = (await api.storeGet("settings")) as
			| AppSettings
			| undefined;
		return settings ?? DEFAULT_SETTINGS;
	},
	setSettings: (settings: AppSettings) => api.storeSet("settings", settings),

	getLastSeenIds: async (): Promise<string[]> => {
		return ((await api.storeGet("lastSeenIds")) as string[]) ?? [];
	},
	setLastSeenIds: (ids: string[]) => api.storeSet("lastSeenIds", ids),

	clearSession: () => api.storeRemove(["sessionToken", "user", "lastSeenIds"]),

	clearAll: () =>
		api.storeRemove([
			"idpUrl",
			"sessionToken",
			"user",
			"settings",
			"lastSeenIds",
		]),
};
