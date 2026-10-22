CREATE TABLE "demo_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"website" text NOT NULL,
	"company_name" text NOT NULL,
	"config" jsonb NOT NULL,
	"sample" jsonb NOT NULL,
	"research_moment_id" uuid,
	"status" text NOT NULL,
	"live_until" timestamp with time zone,
	"live_orders_sent" integer DEFAULT 0 NOT NULL,
	"prospect_customer_id" uuid,
	"prospect_order_number" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_sessions_merchant_idx" ON "demo_sessions" USING btree ("merchant_id");