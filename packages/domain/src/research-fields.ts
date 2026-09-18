import { z } from "zod";

export const researchFieldValueTypeSchema = z.enum([
  "single_select",
  "multi_select",
  "boolean",
  "short_text",
  "long_text",
  "integer",
  "decimal",
  "rating_scale",
]);

export const researchFieldDefinitionV1Schema = z.object({
  schemaVersion: z.literal(1),
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(160),
  prompt: z.string().min(1).max(2000),
  valueType: researchFieldValueTypeSchema,
  options: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
  required: z.boolean(),
  evidenceExpected: z.boolean(),
  attributionSemantic: z
    .enum([
      "self_reported_discovery",
      "self_reported_trigger",
      "self_reported_influence",
    ])
    .nullable(),
  completionMode: z.enum(["live", "post_call", "ai_suggested", "any"]),
});

export const researchFieldSetItemSchema = z.object({
  researchFieldVersionId: z.string().uuid(),
  source: z.enum(["platform_default", "merchant_default", "research_run"]),
  required: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
});

export const interviewObservationTypeSchema = z.enum([
  "hesitation",
  "excitement",
  "reluctance",
  "confusion",
  "strong_conviction",
  "contradiction",
  "context",
  "follow_up_needed",
  "other",
]);

export type ResearchFieldDefinitionV1 = z.infer<
  typeof researchFieldDefinitionV1Schema
>;
export type ResearchFieldSetItem = z.infer<typeof researchFieldSetItemSchema>;
