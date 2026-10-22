CREATE TABLE "merchant_charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"shopify_charge_id" text,
	"created_by" text NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_moments" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "research_moments" ADD COLUMN "report_url" text;--> statement-breakpoint
ALTER TABLE "merchant_charges" ADD CONSTRAINT "merchant_charges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_charges_merchant_idx" ON "merchant_charges" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_charges_shopify_uidx" ON "merchant_charges" USING btree ("shopify_charge_id");