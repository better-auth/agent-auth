const ALARM_NAME = "poll-approvals";

type UserData = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

async function getAuth(): Promise<{
	idpUrl: string;
	token: string;
} | null> {
	const result = await chrome.storage.local.get(["idpUrl", "sessionToken"]);
	if (!result.idpUrl || !result.sessionToken) return null;
	return { idpUrl: result.idpUrl, token: result.sessionToken };
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

	await chrome.storage.local.set({
		idpUrl,
		sessionToken: result.token,
		user: result.user,
	});
	await chrome.storage.local.remove("pendingSignIn");

	chrome.tabs.remove(tabId).catch(() => {});

	await chrome.action.setBadgeText({ text: "✓" });
	await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
	setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);

	setupAlarm();
	pollApprovals();
}

async function startSignInMonitoring(idpUrl: string) {
	stopSignInMonitoring();

	const tab = await chrome.tabs.create({
		url: `${idpUrl}/sign-in`,
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

	if (changes.settings || changes.sessionToken || changes.idpUrl) {
		setupAlarm();
		pollApprovals();
	}
});

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
		// Side panel may already be open or restricted context
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
	const auth = await getAuth();
	if (!auth) {
		await chrome.action.setBadgeText({ text: "" });
		return;
	}

	try {
		const res = await fetch(`${auth.idpUrl}/api/auth/agent/ciba/pending`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${auth.token}`,
			},
		});

		if (!res.ok) {
			if (res.status === 401) {
				await chrome.action.setBadgeText({ text: "!" });
				await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
			}
			return;
		}

		const data = await res.json();
		const requests: Array<{
			auth_req_id: string;
			binding_message?: string;
		}> = data.requests ?? [];

		const count = requests.length;
		await chrome.action.setBadgeText({
			text: count > 0 ? String(count) : "",
		});
		await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });

		if (count === 0) return;

		const stored = await chrome.storage.local.get("lastSeenIds");
		const lastSeenIds: string[] = stored.lastSeenIds ?? [];
		const currentIds = requests.map((r) => r.auth_req_id);
		const newRequests = requests.filter(
			(r) => !lastSeenIds.includes(r.auth_req_id),
		);

		if (newRequests.length > 0) {
			const settings = await getSettings();
			if (settings.notificationsEnabled) {
				chrome.notifications.create(`approval-${Date.now()}`, {
					type: "basic",
					iconUrl: chrome.runtime.getURL("icon-128.png"),
					title: "Agent Auth",
					message:
						newRequests.length === 1
							? (newRequests[0].binding_message ??
								"New approval request pending")
							: `${newRequests.length} new approval requests pending`,
					priority: 2,
					requireInteraction: true,
				});
			}
			await chrome.storage.local.set({ lastSeenIds: currentIds });
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
		pollApprovals();
	}
});

chrome.runtime.onInstalled.addListener(() => {
	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	setupAlarm();
	pollApprovals();
});

chrome.runtime.onStartup.addListener(() => {
	setupAlarm();
	pollApprovals();
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

chrome.runtime.onMessage.addListener((message) => {
	if (message.type === "close-side-panel") {
		closeSidePanel();
	}
});
