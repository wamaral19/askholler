-- Lets the privacy sweep find the customer a redaction request covers. The
-- value is an internal UUID, not subject PII.
ALTER TABLE "deletion_requests" ADD COLUMN "subject_id" uuid;