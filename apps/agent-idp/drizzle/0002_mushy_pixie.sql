ALTER TABLE "agent_host" ALTER COLUMN "public_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "device_authorization" ALTER COLUMN "verification_uri" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_host" ADD COLUMN "enrollment_token_hash" text;--> statement-breakpoint
ALTER TABLE "agent_host" ADD COLUMN "enrollment_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "device_authorization" ADD COLUMN "polling_interval" integer DEFAULT 5 NOT NULL;