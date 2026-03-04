"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  storeGet: (key) => import_electron.ipcRenderer.invoke("store:get", key),
  storeSet: (key, value) => import_electron.ipcRenderer.invoke("store:set", key, value),
  storeRemove: (keys) => import_electron.ipcRenderer.invoke("store:remove", keys),
  apiFetch: (path, options) => import_electron.ipcRenderer.invoke("api:fetch", path, options),
  apiFetchWithUrl: (url, token) => import_electron.ipcRenderer.invoke("api:fetch-with-url", url, token),
  openSignIn: (idpUrl) => import_electron.ipcRenderer.invoke("auth:open-signin", idpUrl),
  openReAuth: (idpUrl) => import_electron.ipcRenderer.invoke("auth:open-reauth", idpUrl),
  openExternal: (url) => import_electron.ipcRenderer.invoke("shell:open-external", url),
  startPolling: () => import_electron.ipcRenderer.invoke("app:start-polling"),
  stopPolling: () => import_electron.ipcRenderer.invoke("app:stop-polling"),
  restartPolling: () => import_electron.ipcRenderer.invoke("app:restart-polling"),
  updateTray: (count) => import_electron.ipcRenderer.invoke("app:update-tray", count),
  hideWindow: () => import_electron.ipcRenderer.invoke("app:hide-window"),
  onApprovalsUpdated: (callback) => {
    import_electron.ipcRenderer.on("approvals-updated", (_event, count) => callback(count));
  },
  platform: process.platform
});
//# sourceMappingURL=preload.js.map
