import type { User } from "./types";

declare global {
	interface ElectronAPI {
		storeGet: (key: string) => Promise<unknown>;
		storeSet: (key: string, value: unknown) => Promise<void>;
		storeRemove: (keys: string[]) => Promise<void>;

		apiFetch: (
			path: string,
			options?: { method?: string; body?: string },
		) => Promise<{ ok: boolean; status: number; body: string }>;
		apiFetchWithUrl: (
			url: string,
			token: string,
		) => Promise<{ ok: boolean; status: number; body: string }>;
		apiFetchAbsolute: (
			url: string,
			token: string,
			options?: { method?: string; body?: string },
		) => Promise<{ ok: boolean; status: number; body: string }>;

		openSignIn: (
			idpUrl: string,
		) => Promise<{ token: string; user: User } | null>;
		openReAuth: (idpUrl: string) => Promise<boolean>;

		openExternal: (url: string) => Promise<void>;

		startPolling: () => Promise<void>;
		stopPolling: () => Promise<void>;
		restartPolling: () => Promise<void>;
		updateTray: (count: number) => Promise<void>;
		hideWindow: () => Promise<void>;

		onApprovalsUpdated: (callback: (count: number) => void) => void;

		onEnrollmentStarted: (callback: (data: { idpUrl: string }) => void) => void;
		onEnrollmentSuccess: (
			callback: (data: {
				hostId: string;
				name?: string;
				idpUrl: string;
			}) => void,
		) => void;
		onEnrollmentFailed: (callback: (data: { error: string }) => void) => void;

		platform: string;
	}

	interface Window {
		electronAPI: ElectronAPI;
	}
}

export {};
