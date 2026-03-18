const ALARM_NAME = "poll-approvals";

declare const __REGISTRY_URL__: string;
const REGISTRY_URL = __REGISTRY_URL__;

type UserData = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

type StoredAuthAccount = {
	id: string;
	idpUrl: string;
	sessionToken: string;
	user: UserData;
	lastSeenIds: string[];
};

function buildAccountId(idpUrl: string, userId: string): string {
	return `${idpUrl.replace(/\/+$/, "")}::${userId}`;
}

async function getAccounts(): Promise<StoredAuthAccount[]> {
	const result = await chrome.storage.local.get([
		"accounts",
		"idpUrl",
		"sessionToken",
		"user",
		"lastSeenIds",
		"primaryAccountId",
	]);
	const accounts = (result.accounts ?? []) as StoredAuthAccount[];
	if (accounts.length > 0) return accounts;
	if (!result.idpUrl || !result.sessionToken || !result.user) return [];
	const migrated: StoredAuthAccount = {
		id: buildAccountId(result.idpUrl as string, (result.user as UserData).id),
		idpUrl: result.idpUrl as string,
		sessionToken: result.sessionToken as string,
		user: result.user as UserData,
		lastSeenIds: (result.lastSeenIds as string[] | undefined) ?? [],
	};
	await chrome.storage.local.set({
		accounts: [migrated],
		primaryAccountId: migrated.id,
	});
	return [migrated];
}

async function getPrimaryAccount(): Promise<StoredAuthAccount | null> {
	const result = await chrome.storage.local.get("primaryAccountId");
	const accounts = await getAccounts();
	return (
		accounts.find((account) => account.id === result.primaryAccountId) ??
		accounts[0] ??
		null
	);
}

async function saveAccounts(accounts: StoredAuthAccount[]): Promise<void> {
	const primary = accounts[0];
	await chrome.storage.local.set({
		accounts,
		primaryAccountId: primary?.id,
		idpUrl: primary?.idpUrl,
		sessionToken: primary?.sessionToken,
		user: primary?.user,
		lastSeenIds: primary?.lastSeenIds ?? [],
	});
}

async function upsertAccount(
	idpUrl: string,
	token: string,
	user: UserData,
): Promise<StoredAuthAccount> {
	const accounts = await getAccounts();
	const accountId = buildAccountId(idpUrl, user.id);
	const nextAccount: StoredAuthAccount = {
		id: accountId,
		idpUrl,
		sessionToken: token,
		user,
		lastSeenIds:
			accounts.find((account) => account.id === accountId)?.lastSeenIds ?? [],
	};
	await saveAccounts([
		nextAccount,
		...accounts.filter((account) => account.id !== accountId),
	]);
	return nextAccount;
}

async function updateAccount(
	accountId: string,
	patch: Partial<StoredAuthAccount>,
): Promise<void> {
	const accounts = await getAccounts();
	await saveAccounts(
		accounts.map((account) =>
			account.id === accountId ? { ...account, ...patch } : account,
		),
	);
}

async function getSettings(): Promise<{
	pollIntervalMinutes: number;
	notificationsEnabled: boolean;
}> {
	const result = await chrome.storage.local.get("settings");
	return (
		result.settings ?? {
			pollIntervalMinutes: 0.5,
			notificationsEnabled: true,
		}
	);
}

// ── Sign-in monitoring ──────────────────────────────────────────────────────

async function tryExtractSession(
	tabId: number,
	idpUrl: string,
): Promise<{ token: string; user: UserData } | null> {
	// Strategy 1: run script inside the IDP tab (page context, trusted origin)
	try {
		const results = await chrome.scripting.executeScript({
			target: { tabId },
			func: async () => {
				try {
					const res = await fetch("/api/auth/get-session", {
						credentials: "include",
						headers: { "Content-Type": "application/json" },
					});
					if (!res.ok) return null;
					return res.json();
				} catch {
					return null;
				}
			},
		});
		const data = results?.[0]?.result;
		if (data?.user && data?.session) {
			const token = data.session.token ?? null;
			if (token) {
				return {
					token,
					user: {
						id: data.user.id,
						name: data.user.name ?? data.user.email,
						email: data.user.email,
						image: data.user.image ?? null,
					},
				};
			}
		}
	} catch {
		// Tab might not be ready
	}

	// Strategy 2: try cookies as Bearer tokens
	try {
		const cookies = await chrome.cookies.getAll({ url: idpUrl });
		for (const cookie of cookies) {
			if (!cookie.value || cookie.value.length < 16) continue;
			try {
				const res = await fetch(`${idpUrl}/api/auth/get-session`, {
					method: "GET",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${cookie.value}`,
					},
				});
				if (!res.ok) continue;
				const data = await res.json();
				if (data?.user) {
					return {
						token: cookie.value,
						user: {
							id: data.user.id,
							name: data.user.name ?? data.user.email,
							email: data.user.email,
							image: data.user.image ?? null,
						},
					};
				}
			} catch {
				continue;
			}
		}
	} catch {
		// Cookie access failed
	}

	return null;
}

let activeSignInTabId: number | null = null;

function onTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
	if (tabId !== activeSignInTabId) return;
	if (changeInfo.status !== "complete") return;
	attemptSessionExtraction();
}

function onTabRemoved(tabId: number) {
	if (tabId !== activeSignInTabId) return;
	stopSignInMonitoring();
	chrome.storage.local.remove("pendingSignIn");
}

function stopSignInMonitoring() {
	activeSignInTabId = null;
	chrome.tabs.onUpdated.removeListener(onTabUpdated);
	chrome.tabs.onRemoved.removeListener(onTabRemoved);
}

async function attemptSessionExtraction() {
	const data = await chrome.storage.local.get("pendingSignIn");
	if (!data.pendingSignIn) {
		stopSignInMonitoring();
		return;
	}

	const { idpUrl, tabId } = data.pendingSignIn;
	if (!tabId || tabId < 0) return;

	const result = await tryExtractSession(tabId, idpUrl);
	if (!result) return;

	stopSignInMonitoring();

	await upsertAccount(idpUrl, result.token, result.user);

	await chrome.storage.local.set({
		pendingSignIn: { idpUrl, tabId, completed: true, user: result.user },
	});
	setTimeout(() => chrome.storage.local.remove("pendingSignIn"), 2000);

	chrome.tabs.remove(tabId).catch(() => {});

	await chrome.action.setBadgeText({ text: "✓" });
	await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
	setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);

	await setupAlarm();
	pollApprovals();
}

async function startSignInMonitoring(idpUrl: string) {
	stopSignInMonitoring();

	const tab = await chrome.tabs.create({
		url: idpUrl,
		active: true,
	});

	activeSignInTabId = tab.id ?? null;

	await chrome.storage.local.set({
		pendingSignIn: { idpUrl, tabId: tab.id },
	});

	chrome.tabs.onUpdated.addListener(onTabUpdated);
	chrome.tabs.onRemoved.addListener(onTabRemoved);
}

// Triggered by popup writing pendingSignIn to storage
chrome.storage.onChanged.addListener((changes) => {
	if (changes.pendingSignIn?.newValue) {
		const pending = changes.pendingSignIn.newValue;
		if (pending.idpUrl && !pending.tabId) {
			startSignInMonitoring(pending.idpUrl);
		}
	}

	if (changes.settings || changes.accounts || changes.primaryAccountId) {
		setupAlarm();
		pollApprovals();
	}
});

// ── Cookie monitoring ────────────────────────────────────────────────────────

let cookieRefreshTimer: ReturnType<typeof setTimeout> | null = null;

chrome.cookies.onChanged.addListener((changeInfo) => {
	if (
		changeInfo.cause === "explicit" ||
		changeInfo.cause === "expired_overwrite"
	) {
		getAccounts().then((accounts) => {
			const affected = accounts.filter((account) => {
				try {
					return (
						new URL(account.idpUrl).hostname ===
						changeInfo.cookie.domain.replace(/^\./, "")
					);
				} catch {
					return false;
				}
			});
			if (affected.length === 0) return;
			if (cookieRefreshTimer) clearTimeout(cookieRefreshTimer);
			cookieRefreshTimer = setTimeout(() => {
				cookieRefreshTimer = null;
				for (const account of affected) {
					void refreshSession(account.id);
				}
			}, 1500);
		});
	}
});

async function refreshSession(accountId?: string): Promise<void> {
	const account = accountId
		? (await getAccounts()).find((candidate) => candidate.id === accountId)
		: await getPrimaryAccount();
	if (!account?.idpUrl) return;

	const cookies = await chrome.cookies.getAll({ url: account.idpUrl });
	for (const cookie of cookies) {
		if (!cookie.value || cookie.value.length < 16) continue;
		try {
			const res = await fetch(`${account.idpUrl}/api/auth/get-session`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${cookie.value}`,
				},
			});
			if (!res.ok) continue;
			const session = await res.json();
			if (!session?.user) continue;

			const newUser: UserData = {
				id: session.user.id,
				name: session.user.name ?? session.user.email,
				email: session.user.email,
				image: session.user.image ?? null,
			};

			if (
				cookie.value !== account.sessionToken ||
				newUser.id !== account.user.id ||
				newUser.email !== account.user.email ||
				newUser.name !== account.user.name
			) {
				await updateAccount(account.id, {
					sessionToken: cookie.value,
					user: newUser,
				});
			}
			return;
		} catch {
			continue;
		}
	}

	if (account.sessionToken) {
		const accounts = (await getAccounts()).filter(
			(candidate) => candidate.id !== account.id,
		);
		await saveAccounts(accounts);
	}
}

// If SW restarts with a pending sign-in, re-attach listeners
chrome.storage.local.get("pendingSignIn").then((data) => {
	if (data.pendingSignIn?.tabId && data.pendingSignIn.tabId > 0) {
		activeSignInTabId = data.pendingSignIn.tabId;
		chrome.tabs.onUpdated.addListener(onTabUpdated);
		chrome.tabs.onRemoved.addListener(onTabRemoved);

		// Try immediately in case user already signed in
		attemptSessionExtraction();
	}
});

// ── Registry auto-discovery ──────────────────────────────────────────────────

type RegistryProvider = {
	url: string;
	provider_name: string;
	display_name?: string;
	issuer: string;
};

let lastDiscoveryRun = 0;
const DISCOVERY_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

async function fetchRegistryProviders(): Promise<RegistryProvider[]> {
	const allProviders: RegistryProvider[] = [];
	let page = 1;
	const limit = 100;

	while (true) {
		const res = await fetch(
			`${REGISTRY_URL}/api/providers?page=${page}&limit=${limit}`,
			{
				method: "GET",
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!res.ok) break;
		const body = (await res.json()) as { providers?: RegistryProvider[] };
		const providers = body.providers ?? [];
		allProviders.push(...providers);
		if (providers.length < limit) break;
		page++;
	}

	return allProviders;
}

async function trySessionForUrl(
	providerUrl: string,
): Promise<{ token: string; user: UserData } | null> {
	try {
		const cookies = await chrome.cookies.getAll({ url: providerUrl });
		for (const cookie of cookies) {
			if (!cookie.value || cookie.value.length < 16) continue;
			try {
				const res = await fetch(
					`${providerUrl}/api/auth/get-session`,
					{
						method: "GET",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${cookie.value}`,
						},
						signal: AbortSignal.timeout(5_000),
					},
				);
				if (!res.ok) continue;
				const data = await res.json();
				if (data?.user) {
					return {
						token: cookie.value,
						user: {
							id: data.user.id,
							name: data.user.name ?? data.user.email,
							email: data.user.email,
							image: data.user.image ?? null,
						},
					};
				}
			} catch {
				continue;
			}
		}
	} catch {
		// Cookie access failed
	}
	return null;
}

async function discoverRegistryAccounts(
	force = false,
): Promise<{ discovered: number }> {
	if (!force && Date.now() - lastDiscoveryRun < DISCOVERY_COOLDOWN_MS) {
		return { discovered: 0 };
	}
	lastDiscoveryRun = Date.now();

	let providers: RegistryProvider[];
	try {
		providers = await fetchRegistryProviders();
	} catch {
		return { discovered: 0 };
	}

	const accounts = await getAccounts();
	const knownUrls = new Set(
		accounts.map((a) => a.idpUrl.replace(/\/+$/, "")),
	);

	let discovered = 0;

	for (const provider of providers) {
		const normalizedUrl = provider.url.replace(/\/+$/, "");
		if (knownUrls.has(normalizedUrl)) continue;

		const result = await trySessionForUrl(normalizedUrl);
		if (!result) continue;

		await upsertAccount(normalizedUrl, result.token, result.user);
		knownUrls.add(normalizedUrl);
		discovered++;
	}

	return { discovered };
}

// ── Side panel ───────────────────────────────────────────────────────────────

let panelClosing = false;

async function openSidePanel(): Promise<boolean> {
	if (panelClosing) return false;
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		});
		if (tab?.windowId) {
			await chrome.sidePanel.open({ windowId: tab.windowId });
			return true;
		}
	} catch {
		// active tab query may fail — try last focused window as fallback
	}
	try {
		const win = await chrome.windows.getLastFocused();
		if (win?.id) {
			await chrome.sidePanel.open({ windowId: win.id });
			return true;
		}
	} catch {
		// Side panel may already be open or no window available
	}
	return false;
}

async function closeSidePanel(): Promise<void> {
	panelClosing = true;
	try {
		await chrome.sidePanel.setOptions({ enabled: false });
		await chrome.sidePanel.setOptions({ enabled: true });
		await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	} catch {
		// best-effort
	}
	panelClosing = false;
}

// ── Approval polling ────────────────────────────────────────────────────────

async function pollApprovals(): Promise<void> {
	const accounts = await getAccounts();
	if (accounts.length === 0) {
		await chrome.action.setBadgeText({ text: "" });
		return;
	}

	try {
		let totalCount = 0;
		let totalNewRequests = 0;
		let latestMessage = "New approval request pending";

		for (const account of accounts) {
			const res = await fetch(`${account.idpUrl}/api/auth/agent/ciba/pending`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${account.sessionToken}`,
				},
			});

			if (!res.ok) {
				if (res.status === 401) {
					await refreshSession(account.id);
				}
				continue;
			}
			const data = await res.json();
			const requests: Array<{
				approval_id: string;
				binding_message?: string | null;
				agent_name?: string | null;
			}> = data.requests ?? [];
			const currentIds = requests.map((request) => request.approval_id);
			const newRequests = requests.filter(
				(request) => !account.lastSeenIds.includes(request.approval_id),
			);
			totalCount += requests.length;
			totalNewRequests += newRequests.length;
			if (newRequests[0]) {
				const accountLabel = new URL(account.idpUrl).hostname;
				latestMessage = `${newRequests[0].binding_message ?? newRequests[0].agent_name ?? "New approval request"} (${accountLabel})`;
			}
			await updateAccount(account.id, { lastSeenIds: currentIds });
		}

		await chrome.action.setBadgeText({
			text: totalCount > 0 ? String(totalCount) : "",
		});
		await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });

		if (totalCount === 0) return;
		if (totalNewRequests > 0) {
			const settings = await getSettings();
			if (settings.notificationsEnabled) {
				chrome.notifications.create(`approval-${Date.now()}`, {
					type: "basic",
					iconUrl: chrome.runtime.getURL("icon-128.png"),
					title: "Agent Auth",
					message:
						totalNewRequests === 1
							? latestMessage
							: `${totalNewRequests} new approval requests pending`,
					priority: 2,
					requireInteraction: true,
				});
			}
		}

		await openSidePanel();
	} catch {
		// Network error
	}
}

async function setupAlarm(): Promise<void> {
	const settings = await getSettings();
	await chrome.alarms.clear(ALARM_NAME);
	await chrome.alarms.create(ALARM_NAME, {
		periodInMinutes: Math.max(0.5, settings.pollIntervalMinutes),
	});
}

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM_NAME) {
		discoverRegistryAccounts().then(() => pollApprovals());
	}
});

chrome.runtime.onInstalled.addListener(() => {
	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	setupAlarm();
	discoverRegistryAccounts().then(() => pollApprovals());
});

chrome.runtime.onStartup.addListener(() => {
	setupAlarm();
	discoverRegistryAccounts().then(() => pollApprovals());
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
	chrome.notifications.clear(notificationId);
	const opened = await openSidePanel();
	if (!opened) {
		chrome.tabs.create({
			url: chrome.runtime.getURL("index.html"),
			active: true,
		});
	}
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "close-side-panel") {
		closeSidePanel();
	}
	if (message.type === "discover-accounts") {
		discoverRegistryAccounts(true).then(sendResponse);
		return true;
	}
});
