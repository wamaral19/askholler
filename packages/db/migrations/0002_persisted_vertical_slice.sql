ALTER TABLE "research_assignments" ADD COLUMN "interview_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;
ALTER TABLE "interview_responses" ADD COLUMN "research_field_set_version_id" uuid;
ALTER TABLE "interview_responses" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "interview_responses" ADD COLUMN "provenance_details" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "interview_responses" ADD COLUMN "conflicts_with_response_id" uuid;
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_field_set_version_fk" FOREIGN KEY ("research_field_set_version_id") REFERENCES "research_field_set_versions"("id");
ALTER TABLE "interview_responses" ALTER COLUMN "research_field_set_version_id" SET NOT NULL;
ALTER TABLE "interview_observations" ADD COLUMN "source" text DEFAULT 'researcher_observed' NOT NULL;
ALTER TABLE "interview_observations" ADD COLUMN "interview_offset_ms" integer;
ALTER TABLE "interview_observations" ADD COLUMN "script_prompt_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_assignment_uidx" ON "interviews" USING btree ("research_assignment_id");
--> statement-breakpoint
CREATE TABLE "assignment_transitions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "assignment_id" uuid NOT NULL REFERENCES "research_assignments"("id"),
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "actor_id" uuid,
  "occurred_at" timestamp with time zone NOT NULL,
  "lock_version" integer NOT NULL,
  "metadata" jsonb NOT NULL
);
CREATE UNIQUE INDEX "assignment_transitions_version_uidx" ON "assignment_transitions" USING btree ("merchant_id", "assignment_id", "lock_version");
--> statement-breakpoint
CREATE TABLE "recordings" (
  "id" uuid PRIMARY KEY NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "interview_id" uuid NOT NULL REFERENCES "interviews"("id"),
  "provider" text NOT NULL,
  "provider_ref" text,
  "object_key" text NOT NULL,
  "status" text NOT NULL,
  "consent_status" text NOT NULL,
  "expires_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recordings_interview_uidx" ON "recordings" USING btree ("merchant_id", "interview_id");
--> statement-breakpoint
CREATE TABLE "report_artifacts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "report_revision_id" uuid NOT NULL REFERENCES "report_revisions"("id"),
  "format" text NOT NULL,
  "content_sha256" text NOT NULL,
  "object_key" text,
  "inline_content" text,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "report_artifacts_content_location_check" CHECK (("object_key" IS NULL) <> ("inline_content" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "report_artifacts_render_uidx" ON "report_artifacts" USING btree ("merchant_id", "report_revision_id", "format", "content_sha256");
--> statement-breakpoint
CREATE TABLE "durable_jobs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "job_type" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "completed_at" timestamp with time zone,
  "last_error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "durable_jobs_idempotency_uidx" ON "durable_jobs" USING btree ("merchant_id", "job_type", "idempotency_key");
CREATE INDEX "durable_jobs_poll_idx" ON "durable_jobs" USING btree ("status", "available_at", "created_at");
--> statement-breakpoint
CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "actor_id" uuid,
  "action" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid NOT NULL,
  "metadata" jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("merchant_id", "subject_type", "subject_id", "occurred_at");
