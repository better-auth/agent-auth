"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var import_electron = require("electron");
var isMac = process.platform === "darwin";
var WINDOW_WIDTH = 380;
var WINDOW_HEIGHT = 540;
var tray = null;
var mainWindow = null;
var authWindow = null;
var store = {};
var pollInterval = null;
var lastSeenIds = [];
var storePath = import_node_path.default.join(import_electron.app.getPath("userData"), "agent-auth-store.json");
function loadStore() {
  try {
    if (import_node_fs.default.existsSync(storePath)) {
      store = JSON.parse(import_node_fs.default.readFileSync(storePath, "utf-8"));
    }
  } catch {
    store = {};
  }
}
function saveStore() {
  try {
    import_node_fs.default.writeFileSync(storePath, JSON.stringify(store, null, "	"), "utf-8");
  } catch {
  }
}
function createTrayIcon() {
  const iconSize = isMac ? 18 : 32;
  const img = import_electron.nativeImage.createEmpty();
  const resourcesPath = import_electron.app.isPackaged ? import_node_path.default.join(process.resourcesPath, "resources") : import_node_path.default.join(__dirname, "../resources");
  const iconFile = isMac ? "trayIconTemplate.png" : "tray-icon.png";
  const iconPath = import_node_path.default.join(resourcesPath, iconFile);
  if (import_node_fs.default.existsSync(iconPath)) {
    const loaded = import_electron.nativeImage.createFromPath(iconPath);
    if (isMac) loaded.setTemplateImage(true);
    return loaded.resize({ width: iconSize, height: iconSize });
  }
  const fallbackFiles = ["icon-32.png", "icon-16.png"];
  for (const file of fallbackFiles) {
    const fp = import_node_path.default.join(resourcesPath, file);
    if (import_node_fs.default.existsSync(fp)) {
      const loaded = import_electron.nativeImage.createFromPath(fp);
      if (isMac) loaded.setTemplateImage(true);
      return loaded.resize({ width: iconSize, height: iconSize });
    }
  }
  return img;
}
function createTray() {
  const icon = createTrayIcon();
  tray = new import_electron.Tray(icon);
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
function getWindowPosition(trayBounds) {
  const windowBounds = mainWindow.getBounds();
  if (isMac) {
    const x2 = Math.round(
      trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
    );
    const y2 = Math.round(trayBounds.y + trayBounds.height + 4);
    return { x: x2, y: y2 };
  }
  const display = import_electron.screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y
  });
  const x = Math.round(
    trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
  );
  const y = Math.round(
    display.workArea.y + display.workArea.height - windowBounds.height
  );
  return { x, y };
}
function createMainWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    ...isMac ? {
      vibrancy: "under-window",
      visualEffectState: "active"
    } : {},
    webPreferences: {
      preload: import_node_path.default.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(import_node_path.default.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("blur", () => {
    if (authWindow && !authWindow.isDestroyed()) return;
    mainWindow?.hide();
  });
}
var DESKTOP_ORIGIN = "better-auth-desktop://app";
async function apiFetch(apiPath, options) {
  const idpUrl = store.idpUrl;
  const token = store.sessionToken;
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
        Origin: DESKTOP_ORIGIN
      },
      body: options?.body
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: 0, body: JSON.stringify({ message: msg }) };
  }
}
async function apiFetchWithUrl(fullUrl, token) {
  try {
    const res = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: DESKTOP_ORIGIN
      }
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: 0, body: JSON.stringify({ message: msg }) };
  }
}
async function extractSession(win, idpUrl) {
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
          image: result.user.image ?? null
        }
      };
    }
  } catch {
  }
  try {
    const cookies = await win.webContents.session.cookies.get({
      url: idpUrl
    });
    for (const cookie of cookies) {
      if (!cookie.value || cookie.value.length < 16) continue;
      try {
        const r = await apiFetchWithUrl(
          `${idpUrl}/api/auth/get-session`,
          cookie.value
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
                image: data.user.image ?? null
              }
            };
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return null;
}
function openSignInWindow(idpUrl) {
  return new Promise((resolve) => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.focus();
      return;
    }
    authWindow = new import_electron.BrowserWindow({
      width: 900,
      height: 700,
      title: "Sign in \u2014 Better Auth",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
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
      setTimeout(tryExtract, 1e3);
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
function openReAuthWindow(idpUrl) {
  return new Promise((resolve) => {
    const reAuthWin = new import_electron.BrowserWindow({
      width: 900,
      height: 700,
      title: "Re-authenticate \u2014 Better Auth",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
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
    reAuthWin.webContents.on(
      "did-navigate-in-page",
      () => setTimeout(tryExtract, 500)
    );
    reAuthWin.on("closed", () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
  });
}
async function pollApprovals() {
  const idpUrl = store.idpUrl;
  const token = store.sessionToken;
  if (!idpUrl || !token) return;
  try {
    const res = await fetch(`${idpUrl}/api/auth/agent/ciba/pending`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: DESKTOP_ORIGIN
      }
    });
    if (!res.ok) {
      if (res.status === 401 && tray) {
        tray.setTitle("!");
      }
      return;
    }
    const data = await res.json();
    const requests = data.requests ?? [];
    if (tray) {
      tray.setTitle(requests.length > 0 ? String(requests.length) : "");
    }
    const settings = store.settings;
    if (settings?.notificationsEnabled !== false) {
      const currentIds = requests.map((r) => r.auth_req_id);
      const newRequests = requests.filter(
        (r) => !lastSeenIds.includes(r.auth_req_id)
      );
      if (newRequests.length > 0 && lastSeenIds.length > 0) {
        const notification = new import_electron.Notification({
          title: "Agent Auth Request",
          body: newRequests.length === 1 ? newRequests[0].binding_message ?? "New approval request" : `${newRequests.length} new approval requests`
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
  } catch {
  }
}
function startPolling() {
  stopPolling();
  const settings = store.settings;
  const minutes = settings?.pollIntervalMinutes ?? 0.5;
  pollInterval = setInterval(pollApprovals, minutes * 60 * 1e3);
  pollApprovals();
}
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
function registerIpcHandlers() {
  import_electron.ipcMain.handle("store:get", (_event, key) => {
    return store[key];
  });
  import_electron.ipcMain.handle("store:set", (_event, key, value) => {
    store[key] = value;
    saveStore();
  });
  import_electron.ipcMain.handle("store:remove", (_event, keys) => {
    for (const k of keys) delete store[k];
    saveStore();
  });
  import_electron.ipcMain.handle(
    "api:fetch",
    (_event, apiPath, options) => {
      return apiFetch(apiPath, options);
    }
  );
  import_electron.ipcMain.handle("api:fetch-with-url", (_event, url, token) => {
    return apiFetchWithUrl(url, token);
  });
  import_electron.ipcMain.handle("auth:open-signin", async (_event, idpUrl) => {
    return openSignInWindow(idpUrl);
  });
  import_electron.ipcMain.handle("auth:open-reauth", async (_event, idpUrl) => {
    return openReAuthWindow(idpUrl);
  });
  import_electron.ipcMain.handle("shell:open-external", (_event, url) => {
    import_electron.shell.openExternal(url);
  });
  import_electron.ipcMain.handle("app:start-polling", () => {
    startPolling();
  });
  import_electron.ipcMain.handle("app:stop-polling", () => {
    stopPolling();
  });
  import_electron.ipcMain.handle("app:restart-polling", () => {
    startPolling();
  });
  import_electron.ipcMain.handle("app:update-tray", (_event, count) => {
    if (tray) {
      tray.setTitle(count > 0 ? String(count) : "");
    }
  });
  import_electron.ipcMain.handle("app:hide-window", () => {
    mainWindow?.hide();
  });
}
import_electron.app.whenReady().then(() => {
  loadStore();
  registerIpcHandlers();
  createTray();
  createMainWindow();
  if (isMac) {
    import_electron.app.dock?.hide();
  }
  if (store.sessionToken && store.idpUrl) {
    startPolling();
  }
});
import_electron.app.on("window-all-closed", (e) => {
  e.preventDefault();
});
import_electron.app.on("activate", () => {
  if (mainWindow && tray) {
    const bounds = tray.getBounds();
    const pos = getWindowPosition(bounds);
    mainWindow.setPosition(pos.x, pos.y, false);
    mainWindow.show();
    mainWindow.focus();
  }
});
//# sourceMappingURL=main.js.map
