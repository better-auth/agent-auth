import fs from "node:fs";
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

let tray: TrayType | null = null;
let mainWindow: BrowserWindowType | null = null;
let authWindow: BrowserWindowType | null = null;
let store: Record<string, unknown> = {};
let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastSeenIds: string[] = [];

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
		if (isMac) loaded.setTemplateImage(true);
		return loaded.resize({ width: iconSize, height: iconSize });
	}

	const fallbackFiles = ["icon-32.png", "icon-16.png"];
	for (const file of fallbackFiles) {
		const fp = path.join(resourcesPath, file);
		if (fs.existsSync(fp)) {
			const loaded = nativeImage.createFromPath(fp);
			if (isMac) loaded.setTemplateImage(true);
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
): Promise<{ ok: boolean; status: number; body: string }> {
	try {
		const res = await fetch(fullUrl, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				Origin: DESKTOP_ORIGIN,
			},
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

		authWindow.loadURL(`${idpUrl}/sign-in`);

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
	const idpUrl = store.idpUrl as string | undefined;
	const token = store.sessionToken as string | undefined;
	if (!idpUrl || !token) return;

	try {
		const res = await fetch(`${idpUrl}/api/auth/agent/ciba/pending`, {
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				Origin: DESKTOP_ORIGIN,
			},
		});

		if (!res.ok) {
			if (res.status === 401 && tray) {
				tray.setTitle("!");
			}
			return;
		}

		const data = (await res.json()) as {
			requests?: { auth_req_id: string; binding_message?: string }[];
		};
		const requests = data.requests ?? [];

		if (tray) {
			tray.setTitle(requests.length > 0 ? String(requests.length) : "");
		}

		const settings = store.settings as
			| { notificationsEnabled?: boolean }
			| undefined;
		if (settings?.notificationsEnabled !== false) {
			const currentIds = requests.map((r) => r.auth_req_id);
			const newRequests = requests.filter(
				(r) => !lastSeenIds.includes(r.auth_req_id),
			);

			if (newRequests.length > 0 && lastSeenIds.length > 0) {
				const notification = new Notification({
					title: "Agent Auth Request",
					body:
						newRequests.length === 1
							? (newRequests[0].binding_message ?? "New approval request")
							: `${newRequests.length} new approval requests`,
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

			lastSeenIds = currentIds;
		}

		mainWindow?.webContents.send("approvals-updated", requests.length);
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

app.whenReady().then(() => {
	loadStore();
	registerIpcHandlers();
	createTray();
	createMainWindow();

	if (isMac) {
		app.dock?.hide();
	}

	if (store.sessionToken && store.idpUrl) {
		startPolling();
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
