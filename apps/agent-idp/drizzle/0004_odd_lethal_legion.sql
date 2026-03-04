CREATE TABLE "mcp_agent_connection" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"app_url" text NOT NULL,
	"name" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"keypair" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_host_keypair" (
	"app_url" text PRIMARY KEY NOT NULL,
	"host_id" text NOT NULL,
	"keypair" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_pending_flow" (
	"app_url" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_provider_config" (
	"name" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
