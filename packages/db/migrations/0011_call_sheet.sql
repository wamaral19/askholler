-- Call sheet: what a researcher needs on screen before and during a call.
-- City and state are KMS-encrypted like the first name (as "City, ST").
ALTER TABLE "customer_private" ADD COLUMN "encrypted_locality" text;--> statement-breakpoint
-- Line detail from Shopify: variant ("M / Navy"), discounts applied to the
-- line, and how many units have been refunded (kept current by orders/updated).
ALTER TABLE "order_line_items" ADD COLUMN "variant_title" text;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "discount_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "refunded_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- One row per script prompt or research field on an interview: whether the
-- researcher covered it on the call, the options they tagged, and a note.
CREATE TABLE "interview_prompt_progress" (
	"interview_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"prompt_key" text NOT NULL,
	"covered_at" timestamp with time zone,
	"selected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_prompt_progress_pk" PRIMARY KEY("interview_id","prompt_key")
);--> statement-breakpoint
ALTER TABLE "interview_prompt_progress" ADD CONSTRAINT "interview_prompt_progress_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_prompt_progress" ADD CONSTRAINT "interview_prompt_progress_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_prompt_progress_merchant_idx" ON "interview_prompt_progress" USING btree ("merchant_id","interview_id");
