ALTER TABLE "research_moments" ADD COLUMN "kind" text DEFAULT 'angle' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "research_moments_general_uidx" ON "research_moments" USING btree ("merchant_id") WHERE "research_moments"."kind" = 'general';
