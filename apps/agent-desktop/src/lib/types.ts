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
	accountId?: string;
	accountLabel?: string;
	metadata: string | null;
	createdAt: string;
	updatedAt: string;
	lastUsedAt: string | null;
};

export type StoredAuthAccount = {
	id: string;
	idpUrl: string;
	sessionToken: string;
	user: User;
	lastSeenIds: string[];
};

export type PendingApprovalRequest = {
	auth_req_id: string;
	client_id: string | null;
	agent_id: string | null;
	agent_name: string | null;
	binding_message: string | null;
	scope: string | null;
	requested_scopes: string[];
	delivery_mode: "poll" | "ping" | "push" | null;
	expires_in: number;
	created_at: string;
	// Client-side additions
	account_id: string;
	account_label: string;
	idp_url: string;
};

export type Host = {
	id: string;
	name: string | null;
	scopes: string[];
	status: string;
	activatedAt: string | null;
	expiresAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type CreatedHost = {
	hostId: string;
	scopes: string[];
	status: string;
	enrollmentToken?: string;
	enrollmentTokenExpiresAt?: string;
};

export type AppSettings = {
	pollIntervalMinutes: number;
	notificationsEnabled: boolean;
};

export type StoredState = {
	accounts: StoredAuthAccount[];
	primaryAccountId?: string;
	settings: AppSettings;
};

export const DEFAULT_SETTINGS: AppSettings = {
	pollIntervalMinutes: 0.5,
	notificationsEnabled: true,
};
