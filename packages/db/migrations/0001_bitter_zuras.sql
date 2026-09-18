CREATE TABLE "angle_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"angle_revision_id" uuid NOT NULL,
	"response_id" uuid NOT NULL,
	"transcript_segment_id" uuid NOT NULL,
	"display_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "angle_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"angle_revision_id" uuid NOT NULL,
	"name" text NOT NULL,
	"population" text NOT NULL,
	"numerator" bigint,
	"denominator" bigint,
	"value" text NOT NULL,
	"unit" text NOT NULL,
	"cohort_snapshot" jsonb NOT NULL,
	"calculation_version" text NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "angle_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"angle_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"research_question" text NOT NULL,
	"cohort_definition" jsonb NOT NULL,
	"recommended_action" text,
	"caveat" text NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "angles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"reporting_period_start" timestamp with time zone NOT NULL,
	"reporting_period_end" timestamp with time zone NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_call_ref" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"researcher_id" uuid NOT NULL,
	"observation_type" text NOT NULL,
	"note" text NOT NULL,
	"interview_offset_seconds" integer,
	"research_field_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"research_field_version_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"provenance" text NOT NULL,
	"review_status" text NOT NULL,
	"created_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"supersedes_response_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"research_assignment_id" uuid NOT NULL,
	"researcher_id" uuid NOT NULL,
	"script_version_id" uuid NOT NULL,
	"research_field_set_version_id" uuid NOT NULL,
	"status" text NOT NULL,
	"outcome" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"recording_consent" text DEFAULT 'not_requested' NOT NULL,
	"transcript_status" text DEFAULT 'not_requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_angles" (
	"report_revision_id" uuid NOT NULL,
	"angle_revision_id" uuid NOT NULL,
	"section" text NOT NULL,
	"display_order" integer NOT NULL,
	"promoted_to_executive_summary" boolean NOT NULL,
	CONSTRAINT "report_angles_report_revision_id_angle_revision_id_pk" PRIMARY KEY("report_revision_id","angle_revision_id")
);
--> statement-breakpoint
CREATE TABLE "report_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"executive_summary" text NOT NULL,
	"methodology" text NOT NULL,
	"sample_notes" text NOT NULL,
	"template_version" text NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"display_month" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_evidence" (
	"response_id" uuid NOT NULL,
	"transcript_segment_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"start_char" integer NOT NULL,
	"end_char" integer NOT NULL,
	"excerpt_snapshot" text,
	CONSTRAINT "response_evidence_response_id_transcript_segment_id_start_char_pk" PRIMARY KEY("response_id","transcript_segment_id","start_char")
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"transcript_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"speaker" text NOT NULL,
	"start_ms" integer,
	"end_ms" integer,
	"text" text NOT NULL,
	"redaction_status" text DEFAULT 'unreviewed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"language" text NOT NULL,
	"status" text NOT NULL,
	"schema_version" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "angle_evidence" ADD CONSTRAINT "angle_evidence_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_evidence" ADD CONSTRAINT "angle_evidence_angle_revision_id_angle_revisions_id_fk" FOREIGN KEY ("angle_revision_id") REFERENCES "public"."angle_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_evidence" ADD CONSTRAINT "angle_evidence_response_id_interview_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."interview_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_evidence" ADD CONSTRAINT "angle_evidence_transcript_segment_id_transcript_segments_id_fk" FOREIGN KEY ("transcript_segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_metrics" ADD CONSTRAINT "angle_metrics_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_metrics" ADD CONSTRAINT "angle_metrics_angle_revision_id_angle_revisions_id_fk" FOREIGN KEY ("angle_revision_id") REFERENCES "public"."angle_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_revisions" ADD CONSTRAINT "angle_revisions_angle_id_angles_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."angles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_revisions" ADD CONSTRAINT "angle_revisions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angles" ADD CONSTRAINT "angles_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_observations" ADD CONSTRAINT "interview_observations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_observations" ADD CONSTRAINT "interview_observations_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_observations" ADD CONSTRAINT "interview_observations_research_field_version_id_research_field_versions_id_fk" FOREIGN KEY ("research_field_version_id") REFERENCES "public"."research_field_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_responses" ADD CONSTRAINT "interview_responses_research_field_version_id_research_field_versions_id_fk" FOREIGN KEY ("research_field_version_id") REFERENCES "public"."research_field_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_research_assignment_id_research_assignments_id_fk" FOREIGN KEY ("research_assignment_id") REFERENCES "public"."research_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_script_version_id_script_versions_id_fk" FOREIGN KEY ("script_version_id") REFERENCES "public"."script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_research_field_set_version_id_research_field_set_versions_id_fk" FOREIGN KEY ("research_field_set_version_id") REFERENCES "public"."research_field_set_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_angles" ADD CONSTRAINT "report_angles_report_revision_id_report_revisions_id_fk" FOREIGN KEY ("report_revision_id") REFERENCES "public"."report_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_angles" ADD CONSTRAINT "report_angles_angle_revision_id_angle_revisions_id_fk" FOREIGN KEY ("angle_revision_id") REFERENCES "public"."angle_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_revisions" ADD CONSTRAINT "report_revisions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_revisions" ADD CONSTRAINT "report_revisions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_evidence" ADD CONSTRAINT "response_evidence_response_id_interview_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."interview_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_evidence" ADD CONSTRAINT "response_evidence_transcript_segment_id_transcript_segments_id_fk" FOREIGN KEY ("transcript_segment_id") REFERENCES "public"."transcript_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_evidence" ADD CONSTRAINT "response_evidence_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "angle_evidence_order_uidx" ON "angle_evidence" USING btree ("angle_revision_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "angle_revisions_version_uidx" ON "angle_revisions" USING btree ("angle_id","revision");--> statement-breakpoint
CREATE INDEX "angles_period_idx" ON "angles" USING btree ("merchant_id","reporting_period_start","reporting_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_provider_ref_uidx" ON "calls" USING btree ("provider","provider_call_ref");--> statement-breakpoint
CREATE INDEX "interview_observations_interview_idx" ON "interview_observations" USING btree ("merchant_id","interview_id");--> statement-breakpoint
CREATE INDEX "interview_responses_field_idx" ON "interview_responses" USING btree ("merchant_id","interview_id","research_field_version_id");--> statement-breakpoint
CREATE INDEX "interviews_assignment_idx" ON "interviews" USING btree ("merchant_id","research_assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_revisions_version_uidx" ON "report_revisions" USING btree ("report_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_period_uidx" ON "reports" USING btree ("merchant_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segments_sequence_uidx" ON "transcript_segments" USING btree ("transcript_id","sequence");