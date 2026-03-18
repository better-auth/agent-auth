import type { ExtensionSettings, StoredAuthAccount, User } from "./types";
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
	buildAccountId(idpUrl: string, userId: string) {
		return `${idpUrl.replace(/\/+$/, "")}::${userId}`;
	},

	async getAccounts(): Promise<StoredAuthAccount[]> {
		const accounts = (await get<StoredAuthAccount[]>("accounts")) ?? [];
		if (accounts.length > 0) return accounts;
		const [idpUrl, sessionToken, user, lastSeenIds] = await Promise.all([
			get<string>("idpUrl"),
			get<string>("sessionToken"),
			get<User>("user"),
			get<string[]>("lastSeenIds"),
		]);
		if (!idpUrl || !sessionToken || !user) return [];
		const migratedAccount: StoredAuthAccount = {
			id: this.buildAccountId(idpUrl, user.id),
			idpUrl,
			sessionToken,
			user,
			lastSeenIds: lastSeenIds ?? [],
		};
		await set({
			accounts: [migratedAccount],
			primaryAccountId: migratedAccount.id,
		});
		return [migratedAccount];
	},

	setAccounts: (accounts: StoredAuthAccount[]) => set({ accounts }),

	async getPrimaryAccount(): Promise<StoredAuthAccount | undefined> {
		const accounts = await this.getAccounts();
		const primaryAccountId = await get<string>("primaryAccountId");
		return (
			accounts.find((account) => account.id === primaryAccountId) ?? accounts[0]
		);
	},

	setPrimaryAccountId: (accountId: string) =>
		set({ primaryAccountId: accountId }),

	async upsertAccount(
		account: Omit<StoredAuthAccount, "id"> & { id?: string },
	) {
		const normalizedId =
			account.id ?? this.buildAccountId(account.idpUrl, account.user.id);
		const accounts = await this.getAccounts();
		const nextAccount: StoredAuthAccount = {
			...account,
			id: normalizedId,
			lastSeenIds: account.lastSeenIds ?? [],
		};
		const nextAccounts = [
			nextAccount,
			...accounts.filter((existing) => existing.id !== normalizedId),
		];
		await set({
			accounts: nextAccounts,
			primaryAccountId: normalizedId,
			idpUrl: nextAccount.idpUrl,
			sessionToken: nextAccount.sessionToken,
			user: nextAccount.user,
			lastSeenIds: nextAccount.lastSeenIds,
		});
		return nextAccount;
	},

	async updateAccount(accountId: string, patch: Partial<StoredAuthAccount>) {
		const accounts = await this.getAccounts();
		const nextAccounts = accounts.map((account) =>
			account.id === accountId ? { ...account, ...patch } : account,
		);
		await set({ accounts: nextAccounts });
		const primary = await this.getPrimaryAccount();
		if (primary?.id === accountId) {
			const updated = nextAccounts.find((account) => account.id === accountId);
			if (updated) {
				await set({
					idpUrl: updated.idpUrl,
					sessionToken: updated.sessionToken,
					user: updated.user,
					lastSeenIds: updated.lastSeenIds,
				});
			}
		}
	},

	async removeAccount(accountId: string) {
		const accounts = await this.getAccounts();
		const nextAccounts = accounts.filter((account) => account.id !== accountId);
		const nextPrimary = nextAccounts[0];
		await set({
			accounts: nextAccounts,
			primaryAccountId: nextPrimary?.id,
			idpUrl: nextPrimary?.idpUrl,
			sessionToken: nextPrimary?.sessionToken,
			user: nextPrimary?.user,
			lastSeenIds: nextPrimary?.lastSeenIds ?? [],
		});
	},

	async getIdpUrl() {
		return (await this.getPrimaryAccount())?.idpUrl;
	},
	async setIdpUrl(url: string) {
		const primary = await this.getPrimaryAccount();
		if (!primary) {
			await set({ idpUrl: url });
			return;
		}
		await this.updateAccount(primary.id, { idpUrl: url });
	},

	async getSessionToken() {
		return (await this.getPrimaryAccount())?.sessionToken;
	},
	async setSessionToken(token: string) {
		const primary = await this.getPrimaryAccount();
		if (!primary) {
			await set({ sessionToken: token });
			return;
		}
		await this.updateAccount(primary.id, { sessionToken: token });
	},

	async getUser() {
		return (await this.getPrimaryAccount())?.user;
	},
	async setUser(user: User) {
		const primary = await this.getPrimaryAccount();
		if (!primary) {
			await set({ user });
			return;
		}
		await this.updateAccount(primary.id, { user });
	},

	getSettings: async (): Promise<ExtensionSettings> => {
		const settings = await get<ExtensionSettings>("settings");
		return settings ?? DEFAULT_SETTINGS;
	},
	setSettings: (settings: ExtensionSettings) => set({ settings }),

	async getLastSeenIds(accountId?: string): Promise<string[]> {
		if (accountId) {
			const account = (await this.getAccounts()).find(
				(a) => a.id === accountId,
			);
			return account?.lastSeenIds ?? [];
		}
		return (await this.getPrimaryAccount())?.lastSeenIds ?? [];
	},
	async setLastSeenIds(ids: string[], accountId?: string) {
		const targetId = accountId ?? (await this.getPrimaryAccount())?.id;
		if (!targetId) return;
		await this.updateAccount(targetId, { lastSeenIds: ids });
	},

	async clearSession() {
		await remove([
			"accounts",
			"primaryAccountId",
			"idpUrl",
			"sessionToken",
			"user",
			"lastSeenIds",
		]);
	},

	clearAll: () =>
		remove([
			"accounts",
			"primaryAccountId",
			"idpUrl",
			"sessionToken",
			"user",
			"settings",
			"lastSeenIds",
		]),
};
