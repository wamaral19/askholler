CREATE TABLE "commerce_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid,
	"order_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" integer NOT NULL,
	"attributes" jsonb NOT NULL,
	"observed_attribution" jsonb NOT NULL,
	"correlation_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_private" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"encrypted_given_name" text,
	"encrypted_phone_e164" text,
	"key_version" text NOT NULL,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shopify_customer_id" text,
	"order_count" integer DEFAULT 0 NOT NULL,
	"lifetime_revenue_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text,
	"first_order_at" timestamp with time zone,
	"latest_order_at" timestamp with time zone,
	"history_completeness" jsonb NOT NULL,
	"contactability_status" text DEFAULT 'unknown' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shopify_shop_id" text,
	"shop_domain" text,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"weekly_interview_target" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"installed_at" timestamp with time zone,
	"uninstalled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_line_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shopify_line_item_id" text NOT NULL,
	"product_id" uuid,
	"shopify_variant_id" text,
	"sku" text,
	"title" text,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid,
	"shopify_order_id" text NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"customer_order_sequence" integer,
	"financial_status" text,
	"fulfillment_status" text,
	"observed_attribution" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_category_assignments" (
	"merchant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_category_assignments_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"shopify_product_id" text NOT NULL,
	"title" text NOT NULL,
	"catalog_enrichment_state" text DEFAULT 'pending' NOT NULL,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"commerce_event_id" uuid NOT NULL,
	"research_moment_version_id" uuid NOT NULL,
	"engine_version" text NOT NULL,
	"outcome" text NOT NULL,
	"reason_codes" text[] NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"research_moment_version_id" uuid NOT NULL,
	"qualification_evaluation_id" uuid NOT NULL,
	"commerce_event_id" uuid NOT NULL,
	"customer_id" uuid,
	"order_id" uuid NOT NULL,
	"script_version_id" uuid NOT NULL,
	"research_field_set_version_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	"status" text NOT NULL,
	"assigned_researcher_id" uuid,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_field_set_items" (
	"field_set_version_id" uuid NOT NULL,
	"field_version_id" uuid NOT NULL,
	"source" text NOT NULL,
	"required" boolean NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "research_field_set_items_field_set_version_id_field_version_id_pk" PRIMARY KEY("field_set_version_id","field_version_id")
);
--> statement-breakpoint
CREATE TABLE "research_field_set_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"research_field_set_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_field_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_field_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"research_field_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_fields" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_moment_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"research_moment_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"event_type" text NOT NULL,
	"objective" text NOT NULL,
	"cohort_expression" jsonb NOT NULL,
	"priority" integer NOT NULL,
	"allocation_policy" jsonb NOT NULL,
	"script_version_id" uuid NOT NULL,
	"research_field_set_version_id" uuid NOT NULL,
	"active_from" timestamp with time zone,
	"active_to" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_moments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"script_id" uuid NOT NULL,
	"merchant_id" uuid,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"content" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid,
	"provider" text NOT NULL,
	"delivery_id" text NOT NULL,
	"topic" text NOT NULL,
	"body_sha256" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_status" text NOT NULL,
	"error_code" text
);
--> statement-breakpoint
ALTER TABLE "commerce_events" ADD CONSTRAINT "commerce_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_events" ADD CONSTRAINT "commerce_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_events" ADD CONSTRAINT "commerce_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_private" ADD CONSTRAINT "customer_private_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_private" ADD CONSTRAINT "customer_private_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_assignments" ADD CONSTRAINT "product_category_assignments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_assignments" ADD CONSTRAINT "product_category_assignments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_assignments" ADD CONSTRAINT "product_category_assignments_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_evaluations" ADD CONSTRAINT "qualification_evaluations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_evaluations" ADD CONSTRAINT "qualification_evaluations_commerce_event_id_commerce_events_id_fk" FOREIGN KEY ("commerce_event_id") REFERENCES "public"."commerce_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_evaluations" ADD CONSTRAINT "qualification_evaluations_research_moment_version_id_research_moment_versions_id_fk" FOREIGN KEY ("research_moment_version_id") REFERENCES "public"."research_moment_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_assignments" ADD CONSTRAINT "research_assignments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_assignments" ADD CONSTRAINT "research_assignments_research_moment_version_id_research_moment_versions_id_fk" FOREIGN KEY ("research_moment_version_id") REFERENCES "public"."research_moment_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_assignments" ADD CONSTRAINT "research_assignments_qualification_evaluation_id_qualification_evaluations_id_fk" FOREIGN KEY ("qualification_evaluation_id") REFERENCES "public"."qualification_evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_assignments" ADD CONSTRAINT "research_assignments_commerce_event_id_commerce_events_id_fk" FOREIGN KEY ("commerce_event_id") REFERENCES "public"."commerce_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_assignments" ADD CONSTRAINT "research_assignments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_assignments" ADD CONSTRAINT "research_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_assignments" ADD CONSTRAINT "research_assignments_script_version_id_script_versions_id_fk" FOREIGN KEY ("script_version_id") REFERENCES "public"."script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_assignments" ADD CONSTRAINT "research_assignments_research_field_set_version_id_research_field_set_versions_id_fk" FOREIGN KEY ("research_field_set_version_id") REFERENCES "public"."research_field_set_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_field_set_items" ADD CONSTRAINT "research_field_set_items_field_set_version_id_research_field_set_versions_id_fk" FOREIGN KEY ("field_set_version_id") REFERENCES "public"."research_field_set_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_field_set_items" ADD CONSTRAINT "research_field_set_items_field_version_id_research_field_versions_id_fk" FOREIGN KEY ("field_version_id") REFERENCES "public"."research_field_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_field_set_versions" ADD CONSTRAINT "research_field_set_versions_research_field_set_id_research_field_sets_id_fk" FOREIGN KEY ("research_field_set_id") REFERENCES "public"."research_field_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_field_sets" ADD CONSTRAINT "research_field_sets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_field_versions" ADD CONSTRAINT "research_field_versions_research_field_id_research_fields_id_fk" FOREIGN KEY ("research_field_id") REFERENCES "public"."research_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_fields" ADD CONSTRAINT "research_fields_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_moment_versions" ADD CONSTRAINT "research_moment_versions_research_moment_id_research_moments_id_fk" FOREIGN KEY ("research_moment_id") REFERENCES "public"."research_moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_moment_versions" ADD CONSTRAINT "research_moment_versions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_moment_versions" ADD CONSTRAINT "research_moment_versions_script_version_id_script_versions_id_fk" FOREIGN KEY ("script_version_id") REFERENCES "public"."script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_moment_versions" ADD CONSTRAINT "research_moment_versions_research_field_set_version_id_research_field_set_versions_id_fk" FOREIGN KEY ("research_field_set_version_id") REFERENCES "public"."research_field_set_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_moments" ADD CONSTRAINT "research_moments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_receipts" ADD CONSTRAINT "webhook_receipts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_events_source_uidx" ON "commerce_events" USING btree ("merchant_id","source","source_event_id");--> statement-breakpoint
CREATE INDEX "commerce_events_type_time_idx" ON "commerce_events" USING btree ("merchant_id","event_type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_merchant_shopify_uidx" ON "customers" USING btree ("merchant_id","shopify_customer_id");--> statement-breakpoint
CREATE INDEX "customers_merchant_order_count_idx" ON "customers" USING btree ("merchant_id","order_count");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_shopify_shop_id_uidx" ON "merchants" USING btree ("shopify_shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_shop_domain_uidx" ON "merchants" USING btree ("shop_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "order_line_items_source_uidx" ON "order_line_items" USING btree ("merchant_id","order_id","shopify_line_item_id");--> statement-breakpoint
CREATE INDEX "order_line_items_product_idx" ON "order_line_items" USING btree ("merchant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_merchant_shopify_uidx" ON "orders" USING btree ("merchant_id","shopify_order_id");--> statement-breakpoint
CREATE INDEX "orders_customer_time_idx" ON "orders" USING btree ("merchant_id","customer_id","ordered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_idempotency_uidx" ON "outbox_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_identity_uidx" ON "product_categories" USING btree ("merchant_id","source","key");--> statement-breakpoint
CREATE INDEX "product_category_assignments_lookup_idx" ON "product_category_assignments" USING btree ("merchant_id","category_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_shopify_uidx" ON "products" USING btree ("merchant_id","shopify_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_evaluations_idempotency_uidx" ON "qualification_evaluations" USING btree ("commerce_event_id","research_moment_version_id","engine_version");--> statement-breakpoint
CREATE UNIQUE INDEX "research_assignments_event_moment_uidx" ON "research_assignments" USING btree ("commerce_event_id","research_moment_version_id");--> statement-breakpoint
CREATE INDEX "research_assignments_queue_idx" ON "research_assignments" USING btree ("merchant_id","status","priority","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "research_field_set_versions_version_uidx" ON "research_field_set_versions" USING btree ("research_field_set_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "research_field_versions_version_uidx" ON "research_field_versions" USING btree ("research_field_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "research_moment_versions_version_uidx" ON "research_moment_versions" USING btree ("research_moment_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "script_versions_version_uidx" ON "script_versions" USING btree ("script_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_receipts_delivery_uidx" ON "webhook_receipts" USING btree ("provider","delivery_id");