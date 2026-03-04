import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./better-auth-schema";

// Unified connection model
export const connection = pgTable("connection", {
	id: text("id").primaryKey(),
	orgId: text("org_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	displayName: text("display_name").notNull(),
	type: text("type").notNull(), // "oauth" | "mcp" | "openapi"
	// OAuth fields
	builtinId: text("builtin_id"), // e.g. "github", "google"
	oauthScopes: text("oauth_scopes"),
	// MCP fields
	transport: text("transport"), // "http" | "stdio"
	mcpEndpoint: text("mcp_endpoint"),
	command: text("command"),
	args: text("args"),
	// OpenAPI fields
	specUrl: text("spec_url"),
	specContent: text("spec_content"),
	baseUrl: text("base_url"),
	authMethod: text("auth_method"),
	// Common
	credentialType: text("credential_type"),
	status: text("status").notNull().default("active"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const connectionCredential = pgTable("connection_credential", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	connectionId: text("connection_id")
		.notNull()
		.references(() => connection.id, { onDelete: "cascade" }),
	orgId: text("org_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	tokenExpiresAt: timestamp("token_expires_at"),
	apiKey: text("api_key"),
	metadata: text("metadata"),
	status: text("status").notNull().default("active"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mcpAgentConnection = pgTable("mcp_agent_connection", {
	agentId: text("agent_id").primaryKey(),
	appUrl: text("app_url").notNull(),
	name: text("name").notNull(),
	scopes: jsonb("scopes").notNull().$type<string[]>().default([]),
	provider: text("provider"),
	keypair: jsonb("keypair").notNull().$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mcpHostKeypair = pgTable("mcp_host_keypair", {
	appUrl: text("app_url").primaryKey(),
	hostId: text("host_id").notNull(),
	keypair: jsonb("keypair").notNull().$type<{
		privateKey: Record<string, unknown>;
		publicKey: Record<string, unknown>;
		kid: string;
	}>(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mcpPendingFlow = pgTable("mcp_pending_flow", {
	appUrl: text("app_url").primaryKey(),
	deviceCode: text("device_code").notNull(),
	clientId: text("client_id").notNull(),
	name: text("name").notNull(),
	scopes: jsonb("scopes").notNull().$type<string[]>().default([]),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mcpProviderConfig = pgTable("mcp_provider_config", {
	name: text("name").primaryKey(),
	config: jsonb("config").notNull().$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userPreference = pgTable("user_preference", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	preferredApprovalMethod: text("preferred_approval_method"),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agentActivity = pgTable("agent_activity", {
	id: text("id").primaryKey(),
	orgId: text("org_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	agentId: text("agent_id").notNull(),
	agentName: text("agent_name"),
	userId: text("user_id"),
	tool: text("tool").notNull(),
	provider: text("provider"),
	status: text("status").notNull().default("success"),
	durationMs: integer("duration_ms"),
	error: text("error"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});
