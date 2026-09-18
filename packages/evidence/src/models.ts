import {
  interviewObservationTypeSchema,
  researchFieldDefinitionV1Schema,
  responseProvenanceSchema,
} from "@holler/domain";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const dateSchema = z.date();

export const researchFieldVersionRecordSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema.nullable(),
    version: z.number().int().positive(),
    definition: researchFieldDefinitionV1Schema,
  })
  .strict();

export const interviewSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    researchAssignmentId: uuidSchema,
    researcherId: uuidSchema,
    scriptVersionId: uuidSchema,
    researchFieldSetVersionId: uuidSchema,
    status: z.enum(["created", "in_progress", "completed", "aborted"]),
    startedAt: dateSchema.nullable(),
    endedAt: dateSchema.nullable(),
    createdAt: dateSchema,
  })
  .strict();

export const transcriptSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    interviewId: uuidSchema,
    revision: z.number().int().positive(),
    status: z.enum(["pending", "ready", "failed", "deleted"]),
    language: z.string().min(2).max(35),
    createdAt: dateSchema,
  })
  .strict();

export const transcriptSegmentSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    transcriptId: uuidSchema,
    interviewId: uuidSchema,
    sequence: z.number().int().nonnegative(),
    speaker: z.enum(["researcher", "customer", "unknown"]),
    startMs: z.number().int().nonnegative().nullable(),
    endMs: z.number().int().nonnegative().nullable(),
    text: z.string().min(1),
    createdAt: dateSchema,
  })
  .strict()
  .superRefine((segment, context) => {
    if (
      segment.startMs !== null &&
      segment.endMs !== null &&
      segment.startMs > segment.endMs
    ) {
      context.addIssue({
        code: "custom",
        message: "startMs must not exceed endMs",
        path: ["endMs"],
      });
    }
  });

export const interviewResponseValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.number(),
  z.array(z.string()),
]);

export const responseProvenanceDetailsSchema = z.discriminatedUnion(
  "provenance",
  [
    z
      .object({
        provenance: z.literal(responseProvenanceSchema.enum.human_live),
        actorId: uuidSchema,
      })
      .strict(),
    z
      .object({
        provenance: z.literal(responseProvenanceSchema.enum.human_reviewed),
        actorId: uuidSchema,
      })
      .strict(),
    z
      .object({
        provenance: z.literal(responseProvenanceSchema.enum.ai_suggested),
        modelId: z.string().min(1).max(200),
        promptTemplateVersion: z.string().min(1).max(120),
      })
      .strict(),
    z
      .object({
        provenance: z.literal(responseProvenanceSchema.enum.imported),
        importBatchId: z.string().min(1).max(200),
      })
      .strict(),
  ],
);

export const interviewResponseSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    interviewId: uuidSchema,
    researchFieldVersionId: uuidSchema,
    researchFieldSetVersionId: uuidSchema,
    version: z.number().int().positive(),
    value: interviewResponseValueSchema,
    provenance: responseProvenanceSchema,
    provenanceDetails: responseProvenanceDetailsSchema,
    reviewStatus: z.enum(["suggested", "accepted", "rejected", "superseded"]),
    supersedesResponseId: uuidSchema.nullable(),
    conflictsWithResponseId: uuidSchema.nullable(),
    createdAt: dateSchema,
  })
  .strict()
  .superRefine((response, context) => {
    if (response.provenance !== response.provenanceDetails.provenance) {
      context.addIssue({
        code: "custom",
        message: "provenance must match provenanceDetails",
        path: ["provenanceDetails"],
      });
    }
  });

export const responseEvidenceSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    interviewResponseId: uuidSchema,
    transcriptSegmentId: uuidSchema,
    startChar: z.number().int().nonnegative(),
    endChar: z.number().int().positive(),
    createdAt: dateSchema,
  })
  .strict()
  .refine((evidence) => evidence.startChar < evidence.endChar, {
    message: "startChar must be less than endChar",
    path: ["endChar"],
  });

export const interviewObservationSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    interviewId: uuidSchema,
    source: z.literal("researcher_observed"),
    observationType: interviewObservationTypeSchema,
    note: z.string().trim().min(1).max(4000),
    interviewOffsetMs: z.number().int().nonnegative().nullable(),
    scriptPromptKey: z.string().min(1).max(160).nullable(),
    relatedResearchFieldVersionId: uuidSchema.nullable(),
    observedBy: uuidSchema,
    createdAt: dateSchema,
  })
  .strict();

export type ResearchFieldVersionRecord = z.infer<
  typeof researchFieldVersionRecordSchema
>;
export type Interview = z.infer<typeof interviewSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type InterviewResponseValue = z.infer<
  typeof interviewResponseValueSchema
>;
export type ResponseProvenanceDetails = z.infer<
  typeof responseProvenanceDetailsSchema
>;
export type InterviewResponse = z.infer<typeof interviewResponseSchema>;
export type ResponseEvidence = z.infer<typeof responseEvidenceSchema>;
export type InterviewObservation = z.infer<typeof interviewObservationSchema>;
