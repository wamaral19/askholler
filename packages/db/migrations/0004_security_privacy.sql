CREATE TABLE "workforce_users" (
  "id" uuid PRIMARY KEY NOT NULL, "oidc_issuer" text NOT NULL, "oidc_subject" text NOT NULL,
  "status" text NOT NULL, "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "workforce_users_oidc_identity_uidx" ON "workforce_users" ("oidc_issuer", "oidc_subject");
CREATE TABLE "merchant_memberships" (
  "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"), "user_id" uuid NOT NULL REFERENCES "workforce_users"("id"),
  "role" text NOT NULL, "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("merchant_id", "user_id", "role")
);
CREATE TABLE "retention_policies" (
  "id" uuid PRIMARY KEY NOT NULL, "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "pii_days" integer NOT NULL CHECK (pii_days >= 0), "recording_days" integer NOT NULL CHECK (recording_days >= 0),
  "transcript_days" integer NOT NULL CHECK (transcript_days >= 0), "evidence_days" integer NOT NULL CHECK (evidence_days >= 0),
  "artifact_days" integer NOT NULL CHECK (artifact_days >= 0), "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "deletion_requests" (
  "id" uuid PRIMARY KEY NOT NULL, "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"), "scope" text NOT NULL,
  "subject_ref_hash" text NOT NULL, "status" text NOT NULL, "due_at" timestamp with time zone NOT NULL,
  "legal_hold" boolean DEFAULT false NOT NULL, "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "deletion_requests_identity_uidx" ON "deletion_requests" ("merchant_id", "scope", "subject_ref_hash");
CREATE TABLE "deletion_steps" (
  "request_id" uuid NOT NULL REFERENCES "deletion_requests"("id"), "merchant_id" uuid NOT NULL REFERENCES "merchants"("id"),
  "step_key" text NOT NULL, "status" text NOT NULL, "attempts" integer DEFAULT 0 NOT NULL,
  "safe_error_code" text, "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("request_id", "step_key")
);
CREATE INDEX "deletion_steps_pending_idx" ON "deletion_steps" ("merchant_id", "status");
