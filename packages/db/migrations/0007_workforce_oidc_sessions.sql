-- Google OIDC workforce sign-in: operators provision users by email, the
-- first sign-in binds the OIDC identity, and sessions are stored server-side
-- (token hash only) so disabling a user or revoking a session takes effect
-- on the next request.
CREATE TABLE "workforce_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workforce_users" ALTER COLUMN "oidc_issuer" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workforce_users" ALTER COLUMN "oidc_subject" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workforce_users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "workforce_sessions" ADD CONSTRAINT "workforce_sessions_user_id_workforce_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."workforce_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_sessions_token_hash_uidx" ON "workforce_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "workforce_sessions_user_idx" ON "workforce_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_users_email_uidx" ON "workforce_users" USING btree ("email");