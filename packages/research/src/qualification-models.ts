import {
  assignmentStatusSchema,
  cohortExpressionSchema,
  commerceEventV1Schema,
} from "@holler/domain";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export const normalizedCommerceEventRecordSchema = z
  .object({
    id: uuidSchema,
    correlationId: z.string().min(1).max(200),
    event: commerceEventV1Schema,
  })
  .strict();

export const publishedResearchMomentSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    eventType: z.literal("order_completed"),
    status: z.literal("published"),
    cohort: cohortExpressionSchema,
    priority: z.number().int(),
    scriptVersionId: uuidSchema,
    researchFieldSetVersionId: uuidSchema,
    activeFrom: z.date().nullable(),
    activeTo: z.date().nullable(),
    assignmentTtlMs: z.number().int().positive(),
  })
  .strict();

export const qualificationEvaluationSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    commerceEventId: uuidSchema,
    researchMomentVersionId: uuidSchema,
    engineVersion: z.string().min(1).max(80),
    outcome: z.enum(["match", "no_match", "unknown"]),
    eligible: z.boolean(),
    reasonCodes: z.array(z.string().min(1)),
    evaluatedAt: z.date(),
  })
  .strict()
  .superRefine((evaluation, context) => {
    if (evaluation.eligible !== (evaluation.outcome === "match")) {
      context.addIssue({
        code: "custom",
        message: "Only a match may be eligible",
        path: ["eligible"],
      });
    }
  });

export const researchAssignmentSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    commerceEventId: uuidSchema,
    researchMomentVersionId: uuidSchema,
    qualificationEvaluationId: uuidSchema,
    customerId: uuidSchema.nullable(),
    orderId: uuidSchema,
    scriptVersionId: uuidSchema,
    researchFieldSetVersionId: uuidSchema,
    priority: z.number().int(),
    status: assignmentStatusSchema,
    assignedResearcherId: uuidSchema.nullable(),
    createdAt: z.date(),
    expiresAt: z.date(),
    claimedAt: z.date().nullable(),
    interviewStartedAt: z.date().nullable(),
    lockVersion: z.number().int().nonnegative(),
  })
  .strict();

export const interviewHandoffSchema = z
  .object({
    id: uuidSchema,
    merchantId: uuidSchema,
    researchAssignmentId: uuidSchema,
    researcherId: uuidSchema,
    scriptVersionId: uuidSchema,
    researchFieldSetVersionId: uuidSchema,
    startedAt: z.date(),
    telephonyAction: z.literal("none"),
  })
  .strict();

export type NormalizedCommerceEventRecord = z.infer<
  typeof normalizedCommerceEventRecordSchema
>;
export type PublishedResearchMoment = z.infer<
  typeof publishedResearchMomentSchema
>;
export type QualificationEvaluation = z.infer<
  typeof qualificationEvaluationSchema
>;
export type ResearchAssignment = z.infer<typeof researchAssignmentSchema>;
export type InterviewHandoff = z.infer<typeof interviewHandoffSchema>;
