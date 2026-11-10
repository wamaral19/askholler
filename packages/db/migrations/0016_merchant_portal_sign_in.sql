CREATE TABLE "merchant_login_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_portal_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"oidc_issuer" text NOT NULL,
	"oidc_subject" text NOT NULL,
	"email" text NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchant_login_domains" ADD CONSTRAINT "merchant_login_domains_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_portal_sessions" ADD CONSTRAINT "merchant_portal_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_login_domains_merchant_idx" ON "merchant_login_domains" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_portal_sessions_token_hash_uidx" ON "merchant_portal_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "merchant_portal_sessions_merchant_idx" ON "merchant_portal_sessions" USING btree ("merchant_id");