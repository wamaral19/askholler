import { z } from "zod";

export const assignmentStatusSchema = z.enum([
  "queued",
  "claimed",
  "interview_started",
  "completed",
  "declined",
  "no_answer",
  "expired",
  "cancelled",
]);

export const callStatusSchema = z.enum([
  "created",
  "manual_dial_ready",
  "dialing",
  "ringing",
  "answered",
  "completed",
  "no_answer",
  "failed",
]);

export const responseProvenanceSchema = z.enum([
  "human_live",
  "human_reviewed",
  "ai_suggested",
  "imported",
]);

export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;
export type CallStatus = z.infer<typeof callStatusSchema>;
