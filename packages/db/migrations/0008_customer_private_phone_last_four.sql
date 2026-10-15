-- Masked-display digits for KMS-encrypted phones, so queue views never need
-- to decrypt. Synthetic rows keep deriving them from their fixture value.
ALTER TABLE "customer_private" ADD COLUMN "phone_last_four" text;