import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const provider = sqliteTable("provider", {
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
	verified: integer("verified", { mode: "boolean" }).notNull().default(false),
	lastCheckedAt: text("last_checked_at"),
	status: text("status").notNull().default("active"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});
