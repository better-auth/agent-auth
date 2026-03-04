ALTER TABLE "agent" ALTER COLUMN "mode" SET DEFAULT 'delegated';--> statement-breakpoint
ALTER TABLE "agent_host" ADD COLUMN "name" text;