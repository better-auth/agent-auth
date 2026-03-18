import { generateKeyPairSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	BrowserWindow as BrowserWindowType,
	NativeImage,
	Tray as TrayType,
} from "electron";
import {
	app,
	BrowserWindow,
	ipcMain,
	Notification,
	nativeImage,
	screen,
	shell,
	Tray,
} from "electron";

const isMac = process.platform === "darwin";
const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 540;
const PROTOCOL = "agent-auth";

let tray: TrayType | null = null;
let mainWindow: BrowserWindowType | null = null;
let authWindow: BrowserWindowType | null = null;
let store: Record<string, unknown> = {};
let pollInterval: ReturnType<typeof setInterval> | null = null;
type StoredAuthAccount = {
	id: string;
	idpUrl: string;
	sessionToken: string;
	user: Record<string, unknown>;
	lastSeenIds: string[];
};

const storePath = path.join(app.getPath("userData"), "agent-auth-store.json");

function loadStore() {
	try {
		if (fs.existsSync(storePath)) {
			store = JSON.parse(fs.readFileSync(storePath, "utf-8"));
		}
	} catch {
		store = {};
	}
}

function saveStore() {
	try {
		fs.writeFileSync(storePath, JSON.stringify(store, null, "\t"), "utf-8");
	} catch {}
}

function getStoredAccounts(): StoredAuthAccount[] {
	const accounts = store.accounts;
	return Array.isArray(accounts) ? (accounts as StoredAuthAccount[]) : [];
}

function saveAccounts(accounts: StoredAuthAccount[]) {
	store.accounts = accounts;
	const primary = accounts[0];
	store.primaryAccountId = primary?.id;
	store.idpUrl = primary?.idpUrl;
	store.sessionToken = primary?.sessionToken;
	store.user = primary?.user;
	store.lastSeenIds = primary?.lastSeenIds ?? [];
	saveStore();
}

function createTrayIcon(): NativeImage {
	const iconSize = isMac ? 18 : 32;
	const img = nativeImage.createEmpty();

	const resourcesPath = app.isPackaged
		? path.join(process.resourcesPath, "resources")
		: path.join(__dirname, "../resources");

	const iconFile = isMac ? "trayIconTemplate.png" : "tray-icon.png";
	const iconPath = path.join(resourcesPath, iconFile);

	if (fs.existsSync(iconPath)) {
		const loaded = nativeImage.createFromPath(iconPath);
		return loaded.resize({ width: iconSize, height: iconSize });
	}

	const fallbackFiles = ["icon-32.png", "icon-16.png"];
	for (const file of fallbackFiles) {
		const fp = path.join(resourcesPath, file);
		if (fs.existsSync(fp)) {
			const loaded = nativeImage.createFromPath(fp);
			return loaded.resize({ width: iconSize, height: iconSize });
		}
	}

	return img;
}

function createTray() {
	const icon = createTrayIcon();
	tray = new Tray(icon);
	tray.setToolTip("Better Auth Agent");

	tray.on("click", (_event, bounds) => {
		if (!mainWindow) return;

		if (mainWindow.isVisible()) {
			mainWindow.hide();
			return;
		}

		const { x, y } = getWindowPosition(bounds);
		mainWindow.setPosition(x, y, false);
		mainWindow.show();
		mainWindow.focus();
	});
}

function getWindowPosition(trayBounds: Electron.Rectangle) {
	const windowBounds = mainWindow!.getBounds();

	if (isMac) {
		const x = Math.round(
			trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2,
		);
		const y = Math.round(trayBounds.y + trayBounds.height + 4);
		return { x, y };
	}

	const display = screen.getDisplayNearestPoint({
		x: trayBounds.x,
		y: trayBounds.y,
	});
	const x = Math.round(
		trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2,
	);
	const y = Math.round(
		display.workArea.y + display.workArea.height - windowBounds.height,
	);
	return { x, y };
}

function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		show: false,
		frame: false,
		resizable: false,
		skipTaskbar: true,
		alwaysOnTop: true,
		fullscreenable: false,
		...(isMac
			? {
					vibrancy: "under-window" as const,
					visualEffectState: "active" as const,
				}
			: {}),
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (process.env.VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
	}

	mainWindow.on("blur", () => {
		if (authWindow && !authWindow.isDestroyed()) return;
		mainWindow?.hide();
	});
}

// ── API proxy (runs in main process via Chromium net — no CORS) ─────

const DESKTOP_ORIGIN = "better-auth-desktop://app";

async function apiFetch(
	apiPath: string,
	options?: { method?: string; body?: string },
): Promise<{ ok: boolean; status: number; body: string }> {
	const idpUrl = store.idpUrl as string | undefined;
	const token = store.sessionToken as string | undefined;
	if (!idpUrl || !token) {
		return { ok: false, status: 401, body: '{"message":"Not authenticated"}' };
	}
	try {
		const url = `${idpUrl}/api/auth${apiPath}`;
		const res = await fetch(url, {
			method: options?.method ?? "GET",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				Origin: DESKTOP_ORIGIN,
			},
			body: options?.body,
		});
		const body = await res.text();
		return { ok: res.ok, status: res.status, body };
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Network error";
		return { ok: false, status: 0, body: JSON.stringify({ message: msg }) };
	}
}

async function apiFetchWithUrl(
	fullUrl: string,
	token: string,
	options?: { method?: string; body?: string },
): Promise<{ ok: boolean; status: number; body: string }> {
	try {
		const res = await fetch(fullUrl, {
			method: options?.method ?? "GET",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				Origin: DESKTOP_ORIGIN,
			},
			body: options?.body,
		});
		const body = await res.text();
		return { ok: res.ok, status: res.status, body };
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Network error";
		return { ok: false, status: 0, body: JSON.stringify({ message: msg }) };
	}
}

// ── Sign-in / re-auth windows ───────────────────────────────────────

async function extractSession(
	win: BrowserWindowType,
	idpUrl: string,
): Promise<{ token: string; user: Record<string, unknown> } | null> {
	try {
		const result = await win.webContents.executeJavaScript(`
			fetch('${idpUrl}/api/auth/get-session', { credentials: 'include' })
				.then(r => r.ok ? r.json() : null)
				.catch(() => null)
		`);
		if (result?.session?.token && result?.user) {
			return {
				token: result.session.token,
				user: {
					id: result.user.id,
					name: result.user.name ?? result.user.email,
					email: result.user.email,
					image: result.user.image ?? null,
				},
			};
		}
	} catch {}

	try {
		const cookies = await win.webContents.session.cookies.get({
			url: idpUrl,
		});
		for (const cookie of cookies) {
			if (!cookie.value || cookie.value.length < 16) continue;
			try {
				const r = await apiFetchWithUrl(
					`${idpUrl}/api/auth/get-session`,
					cookie.value,
				);
				if (r.ok) {
					const data = JSON.parse(r.body);
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
				}
			} catch {}
		}
	} catch {}

	return null;
}

function openSignInWindow(
	idpUrl: string,
): Promise<{ token: string; user: Record<string, unknown> } | null> {
	return new Promise((resolve) => {
		if (authWindow && !authWindow.isDestroyed()) {
			authWindow.focus();
			return;
		}

		authWindow = new BrowserWindow({
			width: 900,
			height: 700,
			title: "Sign in — Better Auth",
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
			},
		});

		authWindow.loadURL(idpUrl);

		let resolved = false;
		const tryExtract = async () => {
			if (resolved || !authWindow || authWindow.isDestroyed()) return;
			const result = await extractSession(authWindow, idpUrl);
			if (result) {
				resolved = true;
				authWindow.close();
				resolve(result);
			}
		};

		authWindow.webContents.on("did-navigate", () => {
			setTimeout(tryExtract, 500);
		});
		authWindow.webContents.on("did-navigate-in-page", () => {
			setTimeout(tryExtract, 500);
		});
		authWindow.webContents.on("did-finish-load", () => {
			setTimeout(tryExtract, 1000);
		});

		authWindow.on("closed", () => {
			authWindow = null;
			if (!resolved) {
				resolved = true;
				resolve(null);
			}
		});
	});
}

function openReAuthWindow(idpUrl: string): Promise<boolean> {
	return new Promise((resolve) => {
		const reAuthWin = new BrowserWindow({
			width: 900,
			height: 700,
			title: "Re-authenticate — Better Auth",
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
			},
		});

		reAuthWin.loadURL(`${idpUrl}/re-auth?returnTo=close`);

		let resolved = false;

		const tryExtract = async () => {
			if (resolved || reAuthWin.isDestroyed()) return;
			const result = await extractSession(reAuthWin, idpUrl);
			if (result) {
				resolved = true;
				store.sessionToken = result.token;
				store.user = result.user;
				saveStore();
				reAuthWin.close();
				resolve(true);
			}
		};

		reAuthWin.webContents.on("did-navigate", () => setTimeout(tryExtract, 500));
		reAuthWin.webContents.on("did-navigate-in-page", () =>
			setTimeout(tryExtract, 500),
		);

		reAuthWin.on("closed", () => {
			if (!resolved) {
				resolved = true;
				resolve(false);
			}
		});
	});
}

// ── Background polling ──────────────────────────────────────────────

async function pollApprovals() {
	const accounts = getStoredAccounts();
	if (accounts.length === 0) return;

	try {
		let totalCount = 0;
		let totalNew = 0;
		let latestMessage = "New approval request";
		const nextAccounts: StoredAuthAccount[] = [];

		for (const account of accounts) {
			const res = await fetch(`${account.idpUrl}/api/auth/agent/ciba/pending`, {
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${account.sessionToken}`,
					Origin: DESKTOP_ORIGIN,
				},
			});
			if (!res.ok) {
				nextAccounts.push(account);
				continue;
			}
			const data = (await res.json()) as {
				requests?: {
					auth_req_id: string;
					binding_message?: string;
					agent_name?: string;
				}[];
			};
			const requests = data.requests ?? [];
			const currentIds = requests.map((request) => request.auth_req_id);
			const newRequests = requests.filter(
				(request) => !account.lastSeenIds.includes(request.auth_req_id),
			);
			totalCount += requests.length;
			totalNew += newRequests.length;
			if (newRequests[0]) {
				latestMessage = `${newRequests[0].binding_message ?? newRequests[0].agent_name ?? "New approval request"} (${new URL(account.idpUrl).hostname})`;
			}
			nextAccounts.push({ ...account, lastSeenIds: currentIds });
		}
		saveAccounts(nextAccounts);

		if (tray) {
			tray.setTitle(totalCount > 0 ? String(totalCount) : "");
		}

		const settings = store.settings as
			| { notificationsEnabled?: boolean }
			| undefined;
		if (settings?.notificationsEnabled !== false) {
			if (totalNew > 0) {
				const notification = new Notification({
					title: "Agent Auth Request",
					body:
						totalNew === 1
							? latestMessage
							: `${totalNew} new approval requests`,
				});
				notification.on("click", () => {
					if (mainWindow && tray) {
						const bounds = tray.getBounds();
						const pos = getWindowPosition(bounds);
						mainWindow.setPosition(pos.x, pos.y, false);
						mainWindow.show();
						mainWindow.focus();
					}
				});
				notification.show();
			}
		}

		mainWindow?.webContents.send("approvals-updated", totalCount);
	} catch {}
}

function startPolling() {
	stopPolling();
	const settings = store.settings as
		| { pollIntervalMinutes?: number }
		| undefined;
	const minutes = settings?.pollIntervalMinutes ?? 0.5;
	pollInterval = setInterval(pollApprovals, minutes * 60 * 1000);
	pollApprovals();
}

function stopPolling() {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
}

// ── Deep link enrollment ─────────────────────────────────────────────

function generateHostKeypair(): {
	publicKey: Record<string, string>;
	privateKey: Record<string, string>;
	kid: string;
} {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	const pubJWK = publicKey.export({ format: "jwk" });
	const privJWK = privateKey.export({ format: "jwk" });
	const kid = `agt_key_${randomBytes(12).toString("hex").slice(0, 16)}`;
	return {
		publicKey: { ...pubJWK, kid } as Record<string, string>,
		privateKey: { ...privJWK, kid } as Record<string, string>,
		kid,
	};
}

interface HostEntry {
	keypair: {
		publicKey: Record<string, string>;
		privateKey: Record<string, string>;
		kid: string;
	};
	hostId: string;
}

function getHostsFilePath(): string {
	return path.join(os.homedir(), ".better-auth", "agents", "hosts.json");
}

function readHostFromDisk(appUrl: string): HostEntry | null {
	try {
		const hostsFile = getHostsFilePath();
		if (!fs.existsSync(hostsFile)) return null;
		const hosts = JSON.parse(fs.readFileSync(hostsFile, "utf-8")) as Record<
			string,
			HostEntry
		>;
		return hosts[appUrl] ?? null;
	} catch {
		return null;
	}
}

function saveHostKeypairToDisk(
	appUrl: string,
	keypair: {
		publicKey: Record<string, string>;
		privateKey: Record<string, string>;
		kid: string;
	},
	hostId: string,
) {
	const hostsFile = getHostsFilePath();
	const agentsDir = path.dirname(hostsFile);

	if (!fs.existsSync(agentsDir)) {
		fs.mkdirSync(agentsDir, { recursive: true });
	}

	let hosts: Record<string, unknown> = {};
	try {
		if (fs.existsSync(hostsFile)) {
			hosts = JSON.parse(fs.readFileSync(hostsFile, "utf-8"));
		}
	} catch {}

	hosts[appUrl] = {
		keypair: {
			publicKey: keypair.publicKey,
			privateKey: keypair.privateKey,
			kid: keypair.kid,
		},
		hostId,
	};

	fs.writeFileSync(hostsFile, JSON.stringify(hosts, null, 2), "utf-8");
	fs.chmodSync(hostsFile, 0o600);
}

async function handleEnrollmentUrl(rawUrl: string) {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return;
	}

	if (parsed.hostname !== "enroll") return;

	const token = parsed.searchParams.get("token");
	const idpUrl = parsed.searchParams.get("url");
	if (!token || !idpUrl) return;

	mainWindow?.webContents.send("enrollment:started", { idpUrl });
	showMainWindow();

	try {
		const existing = readHostFromDisk(idpUrl);
		const keypair = existing?.keypair ?? generateHostKeypair();

		const res = await fetch(`${idpUrl}/api/auth/agent/host/enroll`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				token,
				publicKey: keypair.publicKey,
			}),
		});

		const body = await res.text();
		if (!res.ok) {
			let msg = "Enrollment failed";
			try {
				const err = JSON.parse(body);
				msg = err.message ?? err.error ?? msg;
			} catch {}
			mainWindow?.webContents.send("enrollment:failed", { error: msg });
			return;
		}

		const data = JSON.parse(body) as {
			hostId: string;
			name?: string;
			scopes?: string[];
			status: string;
		};

		saveHostKeypairToDisk(idpUrl, keypair, data.hostId);

		mainWindow?.webContents.send("enrollment:success", {
			hostId: data.hostId,
			name: data.name,
			idpUrl,
			reused: !!existing,
		});
	} catch (err) {
		mainWindow?.webContents.send("enrollment:failed", {
			error: err instanceof Error ? err.message : "Network error",
		});
	}
}

function showMainWindow() {
	if (!mainWindow || !tray) return;
	if (mainWindow.isVisible()) return;
	const bounds = tray.getBounds();
	const pos = getWindowPosition(bounds);
	mainWindow.setPosition(pos.x, pos.y, false);
	mainWindow.show();
	mainWindow.focus();
}

let pendingDeepLink: string | null = null;

// ── IPC handlers ────────────────────────────────────────────────────

function registerIpcHandlers() {
	ipcMain.handle("store:get", (_event, key: string) => {
		return store[key];
	});

	ipcMain.handle("store:set", (_event, key: string, value: unknown) => {
		store[key] = value;
		saveStore();
	});

	ipcMain.handle("store:remove", (_event, keys: string[]) => {
		for (const k of keys) delete store[k];
		saveStore();
	});

	ipcMain.handle(
		"api:fetch",
		(_event, apiPath: string, options?: { method?: string; body?: string }) => {
			return apiFetch(apiPath, options);
		},
	);

	ipcMain.handle("api:fetch-with-url", (_event, url: string, token: string) => {
		return apiFetchWithUrl(url, token);
	});

	ipcMain.handle(
		"api:fetch-absolute",
		(
			_event,
			url: string,
			token: string,
			options?: { method?: string; body?: string },
		) => {
			return apiFetchWithUrl(url, token, options);
		},
	);

	ipcMain.handle("auth:open-signin", async (_event, idpUrl: string) => {
		return openSignInWindow(idpUrl);
	});

	ipcMain.handle("auth:open-reauth", async (_event, idpUrl: string) => {
		return openReAuthWindow(idpUrl);
	});

	ipcMain.handle("shell:open-external", (_event, url: string) => {
		shell.openExternal(url);
	});

	ipcMain.handle("app:start-polling", () => {
		startPolling();
	});

	ipcMain.handle("app:stop-polling", () => {
		stopPolling();
	});

	ipcMain.handle("app:restart-polling", () => {
		startPolling();
	});

	ipcMain.handle("app:update-tray", (_event, count: number) => {
		if (tray) {
			tray.setTitle(count > 0 ? String(count) : "");
		}
	});

	ipcMain.handle("app:hide-window", () => {
		mainWindow?.hide();
	});
}

// ── Custom protocol registration ────────────────────────────────────

if (!app.isDefaultProtocolClient(PROTOCOL)) {
	app.setAsDefaultProtocolClient(PROTOCOL);
}

// macOS: deep links arrive via open-url
app.on("open-url", (event, url) => {
	event.preventDefault();
	if (mainWindow) {
		handleEnrollmentUrl(url);
	} else {
		pendingDeepLink = url;
	}
});

// Windows/Linux: deep links arrive as argv on second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	app.quit();
} else {
	app.on("second-instance", (_event, argv) => {
		const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
		if (url) {
			handleEnrollmentUrl(url);
		}
		showMainWindow();
	});
}

app.whenReady().then(() => {
	loadStore();
	registerIpcHandlers();
	createTray();
	createMainWindow();

	if (isMac) {
		app.dock?.hide();
	}

	if (getStoredAccounts().length > 0 || (store.sessionToken && store.idpUrl)) {
		startPolling();
	}

	if (pendingDeepLink) {
		handleEnrollmentUrl(pendingDeepLink);
		pendingDeepLink = null;
	}
});

app.on("window-all-closed", (e: Event) => {
	e.preventDefault();
});

app.on("activate", () => {
	if (mainWindow && tray) {
		const bounds = tray.getBounds();
		const pos = getWindowPosition(bounds);
		mainWindow.setPosition(pos.x, pos.y, false);
		mainWindow.show();
		mainWindow.focus();
	}
});
