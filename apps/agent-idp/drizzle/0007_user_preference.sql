CREATE TABLE IF NOT EXISTS "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferred_approval_method" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
