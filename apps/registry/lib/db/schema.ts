import { boolean, pgTable, text } from "drizzle-orm/pg-core";

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
	verified: boolean("verified").notNull().default(false),
	lastCheckedAt: text("last_checked_at"),
	status: text("status").notNull().default("active"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});
