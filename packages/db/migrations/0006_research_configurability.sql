-- Research configurability: a per-merchant field library with default
-- inclusion, required, and order settings; and research-run scripts that
-- adapt a library script for one moment without changing the library copy.
CREATE TABLE "merchant_research_field_settings" (
	"merchant_id" uuid NOT NULL,
	"research_field_id" uuid NOT NULL,
	"included_by_default" boolean NOT NULL,
	"required_by_default" boolean NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_research_field_settings_merchant_id_research_field_id_pk" PRIMARY KEY("merchant_id","research_field_id")
);
--> statement-breakpoint
ALTER TABLE "merchant_research_field_settings" ADD CONSTRAINT "merchant_research_field_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_research_field_settings" ADD CONSTRAINT "merchant_research_field_settings_research_field_id_research_fields_id_fk" FOREIGN KEY ("research_field_id") REFERENCES "public"."research_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD COLUMN "based_on_script_version_id" uuid;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_based_on_script_version_id_script_versions_id_fk" FOREIGN KEY ("based_on_script_version_id") REFERENCES "public"."script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD COLUMN "kind" text DEFAULT 'library' NOT NULL;--> statement-breakpoint
ALTER TABLE "scripts" ADD COLUMN "research_moment_id" uuid;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_research_moment_id_research_moments_id_fk" FOREIGN KEY ("research_moment_id") REFERENCES "public"."research_moments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Editing a field publishes a new version; only the newest stays "published"
-- so the library shows one entry per field. Pinned field sets keep their ids.
UPDATE "research_field_versions" AS v
SET "status" = 'superseded'
WHERE v."status" = 'published'
  AND EXISTS (
    SELECT 1 FROM "research_field_versions" AS newer
    WHERE newer."research_field_id" = v."research_field_id"
      AND newer."status" = 'published'
      AND newer."version" > v."version"
  );
