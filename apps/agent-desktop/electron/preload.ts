import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	storeGet: (key: string) => ipcRenderer.invoke("store:get", key),
	storeSet: (key: string, value: unknown) =>
		ipcRenderer.invoke("store:set", key, value),
	storeRemove: (keys: string[]) => ipcRenderer.invoke("store:remove", keys),

	apiFetch: (path: string, options?: { method?: string; body?: string }) =>
		ipcRenderer.invoke("api:fetch", path, options),
	apiFetchWithUrl: (url: string, token: string) =>
		ipcRenderer.invoke("api:fetch-with-url", url, token),
	apiFetchAbsolute: (
		url: string,
		token: string,
		options?: { method?: string; body?: string },
	) => ipcRenderer.invoke("api:fetch-absolute", url, token, options),

	openSignIn: (idpUrl: string) =>
		ipcRenderer.invoke("auth:open-signin", idpUrl),
	openReAuth: (idpUrl: string) =>
		ipcRenderer.invoke("auth:open-reauth", idpUrl),

	openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),

	startPolling: () => ipcRenderer.invoke("app:start-polling"),
	stopPolling: () => ipcRenderer.invoke("app:stop-polling"),
	restartPolling: () => ipcRenderer.invoke("app:restart-polling"),
	updateTray: (count: number) => ipcRenderer.invoke("app:update-tray", count),
	hideWindow: () => ipcRenderer.invoke("app:hide-window"),

	onApprovalsUpdated: (callback: (count: number) => void) => {
		ipcRenderer.on("approvals-updated", (_event, count) => callback(count));
	},

	onEnrollmentStarted: (callback: (data: { idpUrl: string }) => void) => {
		ipcRenderer.on("enrollment:started", (_event, data) => callback(data));
	},
	onEnrollmentSuccess: (
		callback: (data: { hostId: string; name?: string; idpUrl: string }) => void,
	) => {
		ipcRenderer.on("enrollment:success", (_event, data) => callback(data));
	},
	onEnrollmentFailed: (callback: (data: { error: string }) => void) => {
		ipcRenderer.on("enrollment:failed", (_event, data) => callback(data));
	},

	platform: process.platform,
});
