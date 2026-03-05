import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	username: text("username").unique(),
	displayUsername: text("display_username"),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// Organization tables
export const organization = pgTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").unique(),
	logo: text("logo"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	metadata: text("metadata"),
});

export const member = pgTable("member", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	role: text("role").notNull().default("member"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	email: text("email").notNull(),
	role: text("role"),
	status: text("status").notNull().default("pending"),
	teamId: text("team_id"),
	expiresAt: timestamp("expires_at").notNull(),
	inviterId: text("inviter_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const team = pgTable("team", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const teamMember = pgTable("team_member", {
	id: text("id").primaryKey(),
	teamId: text("team_id")
		.notNull()
		.references(() => team.id, { onDelete: "cascade" }),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationRole = pgTable("organization_role", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	role: text("role").notNull(),
	permission: text("permission"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent Auth tables
export const agent = pgTable("agent", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
	hostId: text("host_id"),
	status: text("status").notNull().default("active"),
	mode: text("mode").notNull().default("delegated"),
	publicKey: text("public_key").notNull(),
	kid: text("kid"),
	jwksUrl: text("jwks_url"),
	lastUsedAt: timestamp("last_used_at"),
	activatedAt: timestamp("activated_at"),
	expiresAt: timestamp("expires_at"),
	metadata: text("metadata"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agentPermission = pgTable("agent_permission", {
	id: text("id").primaryKey(),
	agentId: text("agent_id")
		.notNull()
		.references(() => agent.id, { onDelete: "cascade" }),
	scope: text("scope").notNull(),
	referenceId: text("reference_id"),
	grantedBy: text("granted_by"),
	expiresAt: timestamp("expires_at"),
	status: text("status").notNull().default("active"),
	reason: text("reason"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agentHost = pgTable("agent_host", {
	id: text("id").primaryKey(),
	name: text("name"),
	userId: text("user_id"),
	referenceId: text("reference_id"),
	scopes: text("scopes"),
	publicKey: text("public_key"),
	kid: text("kid"),
	jwksUrl: text("jwks_url"),
	enrollmentTokenHash: text("enrollment_token_hash"),
	enrollmentTokenExpiresAt: timestamp("enrollment_token_expires_at"),
	status: text("status").notNull().default("active"),
	activatedAt: timestamp("activated_at"),
	expiresAt: timestamp("expires_at"),
	lastUsedAt: timestamp("last_used_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cibaAuthRequest = pgTable("ciba_auth_request", {
	id: text("id").primaryKey(),
	clientId: text("client_id").notNull(),
	loginHint: text("login_hint").notNull(),
	userId: text("user_id"),
	scope: text("scope"),
	bindingMessage: text("binding_message"),
	clientNotificationToken: text("client_notification_token"),
	clientNotificationEndpoint: text("client_notification_endpoint"),
	deliveryMode: text("delivery_mode").notNull().default("poll"),
	status: text("status").notNull().default("pending"),
	accessToken: text("access_token"),
	interval: integer("interval").notNull().default(5),
	lastPolledAt: timestamp("last_polled_at"),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deviceCode = pgTable("device_authorization", {
	id: text("id").primaryKey(),
	deviceCode: text("device_code").notNull().unique(),
	userCode: text("user_code").notNull().unique(),
	clientId: text("client_id").notNull(),
	scope: text("scope"),
	verificationUri: text("verification_uri"),
	verificationUriComplete: text("verification_uri_complete"),
	expiresAt: timestamp("expires_at").notNull(),
	interval: integer("interval").notNull().default(5),
	pollingInterval: integer("polling_interval").notNull().default(5),
	status: text("status").notNull().default("pending"),
	userId: text("user_id"),
	lastPolledAt: timestamp("last_polled_at"),
	clientName: text("client_name"),
	authorizationDetails: text("authorization_details"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
