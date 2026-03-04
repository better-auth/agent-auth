export type Session = {
	token: string;
	expiresAt: string;
};

export type User = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export type Agent = {
	id: string;
	name: string;
	status: string;
	scopes: string[];
	metadata: string | null;
	createdAt: string;
	updatedAt: string;
	lastUsedAt: string | null;
};

export type CibaPendingRequest = {
	auth_req_id: string;
	client_id: string;
	binding_message: string | null;
	scope: string | null;
	delivery_mode: "poll" | "ping" | "push";
	expires_in: number;
	created_at: string;
};

export type AppSettings = {
	pollIntervalMinutes: number;
	notificationsEnabled: boolean;
};

export type StoredState = {
	idpUrl: string;
	sessionToken: string;
	user: User | null;
	settings: AppSettings;
	lastSeenIds: string[];
};

export const DEFAULT_SETTINGS: AppSettings = {
	pollIntervalMinutes: 0.5,
	notificationsEnabled: true,
};
