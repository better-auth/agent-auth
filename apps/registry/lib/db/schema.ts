import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
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
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

export const provider = pgTable("provider", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	displayName: text("display_name").notNull(),
	description: text("description").notNull(),
	issuer: text("issuer").notNull(),
	url: text("url").notNull(),
	version: text("version").notNull(),
	modes: text("modes").notNull().default("[]"),
	approvalMethods: text("approval_methods").notNull().default("[]"),
	algorithms: text("algorithms").notNull().default("[]"),
	endpoints: text("endpoints").notNull().default("{}"),
	jwksUri: text("jwks_uri"),
	categories: text("categories").notNull().default("[]"),
	logoUrl: text("logo_url"),
	public: boolean("public").notNull().default(false),
	verified: boolean("verified").notNull().default(false),
	lastCheckedAt: text("last_checked_at"),
	status: text("status").notNull().default("active"),
	submittedBy: text("submitted_by").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});
