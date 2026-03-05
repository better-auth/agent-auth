import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const site = sqliteTable("site", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	userId: text("user_id").notNull(),
	status: text("status").notNull().default("active"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const deployment = sqliteTable("deployment", {
	id: text("id").primaryKey(),
	siteId: text("site_id")
		.notNull()
		.references(() => site.id, { onDelete: "cascade" }),
	html: text("html").notNull(),
	label: text("label"),
	status: text("status").notNull().default("live"),
	url: text("url"),
	size: integer("size"),
	createdAt: text("created_at").notNull(),
});

export const agentActivity = sqliteTable("agent_activity", {
	id: text("id").primaryKey(),
	agentId: text("agent_id").notNull(),
	agentName: text("agent_name"),
	action: text("action").notNull(),
	resourceType: text("resource_type"),
	resourceId: text("resource_id"),
	details: text("details"),
	status: text("status").notNull().default("success"),
	createdAt: text("created_at").notNull(),
});
