import type { AppSettings, StoredAuthAccount, User } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const api = window.electronAPI;

export const storage = {
	buildAccountId(idpUrl: string, userId: string) {
		return `${idpUrl.replace(/\/+$/, "")}::${userId}`;
	},

	async getAccounts(): Promise<StoredAuthAccount[]> {
		const accounts = (await api.storeGet("accounts")) as
			| StoredAuthAccount[]
			| undefined;
		if (accounts?.length) return accounts;
		const [idpUrl, sessionToken, user, lastSeenIds] = (await Promise.all([
			api.storeGet("idpUrl"),
			api.storeGet("sessionToken"),
			api.storeGet("user"),
			api.storeGet("lastSeenIds"),
		])) as [
			string | undefined,
			string | undefined,
			User | undefined,
			string[] | undefined,
		];
		if (!idpUrl || !sessionToken || !user) return [];
		const migratedAccount: StoredAuthAccount = {
			id: this.buildAccountId(idpUrl, user.id),
			idpUrl,
			sessionToken,
			user,
			lastSeenIds: lastSeenIds ?? [],
		};
		await api.storeSet("accounts", [migratedAccount]);
		await api.storeSet("primaryAccountId", migratedAccount.id);
		return [migratedAccount];
	},

	setAccounts: (accounts: StoredAuthAccount[]) =>
		api.storeSet("accounts", accounts),

	async getPrimaryAccount(): Promise<StoredAuthAccount | undefined> {
		const accounts = await this.getAccounts();
		const primaryAccountId = (await api.storeGet("primaryAccountId")) as
			| string
			| undefined;
		return (
			accounts.find((account) => account.id === primaryAccountId) ?? accounts[0]
		);
	},

	setPrimaryAccountId: (accountId: string) =>
		api.storeSet("primaryAccountId", accountId),

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
		await api.storeSet("accounts", nextAccounts);
		await api.storeSet("primaryAccountId", normalizedId);
		await api.storeSet("idpUrl", nextAccount.idpUrl);
		await api.storeSet("sessionToken", nextAccount.sessionToken);
		await api.storeSet("user", nextAccount.user);
		await api.storeSet("lastSeenIds", nextAccount.lastSeenIds);
		return nextAccount;
	},

	async updateAccount(accountId: string, patch: Partial<StoredAuthAccount>) {
		const accounts = await this.getAccounts();
		const nextAccounts = accounts.map((account) =>
			account.id === accountId ? { ...account, ...patch } : account,
		);
		await api.storeSet("accounts", nextAccounts);
		const primary = await this.getPrimaryAccount();
		if (primary?.id === accountId) {
			const updated = nextAccounts.find((account) => account.id === accountId);
			if (updated) {
				await api.storeSet("idpUrl", updated.idpUrl);
				await api.storeSet("sessionToken", updated.sessionToken);
				await api.storeSet("user", updated.user);
				await api.storeSet("lastSeenIds", updated.lastSeenIds);
			}
		}
	},

	async removeAccount(accountId: string) {
		const accounts = await this.getAccounts();
		const nextAccounts = accounts.filter((account) => account.id !== accountId);
		const nextPrimary = nextAccounts[0];
		await api.storeSet("accounts", nextAccounts);
		await api.storeSet("primaryAccountId", nextPrimary?.id);
		await api.storeSet("idpUrl", nextPrimary?.idpUrl);
		await api.storeSet("sessionToken", nextPrimary?.sessionToken);
		await api.storeSet("user", nextPrimary?.user);
		await api.storeSet("lastSeenIds", nextPrimary?.lastSeenIds ?? []);
	},

	async getIdpUrl() {
		return (await this.getPrimaryAccount())?.idpUrl;
	},
	async setIdpUrl(url: string) {
		const primary = await this.getPrimaryAccount();
		if (!primary) {
			await api.storeSet("idpUrl", url);
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
			await api.storeSet("sessionToken", token);
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
			await api.storeSet("user", user);
			return;
		}
		await this.updateAccount(primary.id, { user });
	},

	getSettings: async (): Promise<AppSettings> => {
		const settings = (await api.storeGet("settings")) as
			| AppSettings
			| undefined;
		return settings ?? DEFAULT_SETTINGS;
	},
	setSettings: (settings: AppSettings) => api.storeSet("settings", settings),

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

	clearSession: () =>
		api.storeRemove([
			"accounts",
			"primaryAccountId",
			"sessionToken",
			"user",
			"lastSeenIds",
			"idpUrl",
		]),

	clearAll: () =>
		api.storeRemove([
			"accounts",
			"primaryAccountId",
			"idpUrl",
			"sessionToken",
			"user",
			"settings",
			"lastSeenIds",
		]),
};
