import { z } from "zod";

export const reportingPeriodSchema = z
  .object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    displayMonth: z.iso.date(),
  })
  .strict()
  .superRefine((period, context) => {
    if (Date.parse(period.start) >= Date.parse(period.end)) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "Reporting period end must be after its start",
      });
    }
  });

export const cohortSnapshotSchema = z
  .object({
    key: z.string().min(1).max(160),
    label: z.string().min(1).max(240),
    definitionVersion: z.number().int().positive(),
  })
  .strict();

export const evidenceReferenceSchema = z
  .object({
    evidenceId: z.string().uuid(),
    interviewId: z.string().uuid(),
    kind: z.enum([
      "tag_evidence",
      "response_evidence",
      "researcher_observation",
    ]),
    label: z.string().min(1).max(240),
  })
  .strict();

export const metricPopulationSchema = z.enum([
  "commerce_population",
  "interview_sample",
]);

export const metricSourceSchema = z.enum([
  "observed_commerce",
  "self_reported_interview",
]);

export const angleMetricSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(240),
    source: metricSourceSchema,
    population: metricPopulationSchema,
    unit: z.enum(["percent", "count", "currency", "ratio"]),
    value: z.number().finite(),
    numerator: z.number().finite().nonnegative().optional(),
    denominator: z.number().finite().positive().optional(),
    cohort: cohortSnapshotSchema,
    period: reportingPeriodSchema,
    calculationVersion: z.string().min(1).max(120),
  })
  .strict()
  .superRefine((metric, context) => {
    if (
      metric.source === "observed_commerce" &&
      metric.population !== "commerce_population"
    ) {
      context.addIssue({
        code: "custom",
        path: ["population"],
        message: "Observed commerce metrics require the commerce population",
      });
    }

    if (
      metric.source === "self_reported_interview" &&
      metric.population !== "interview_sample"
    ) {
      context.addIssue({
        code: "custom",
        path: ["population"],
        message:
          "Self-reported metrics require the interview sample population",
      });
    }

    if (metric.unit !== "percent") return;

    if (metric.numerator === undefined) {
      context.addIssue({
        code: "custom",
        path: ["numerator"],
        message: "Percent metrics require a numerator",
      });
    }
    if (metric.denominator === undefined) {
      context.addIssue({
        code: "custom",
        path: ["denominator"],
        message: "Percent metrics require a denominator",
      });
    }
    if (metric.numerator === undefined || metric.denominator === undefined)
      return;

    if (metric.numerator > metric.denominator) {
      context.addIssue({
        code: "custom",
        path: ["numerator"],
        message: "Percent numerator cannot exceed denominator",
      });
      return;
    }

    const calculatedValue = (metric.numerator / metric.denominator) * 100;
    if (Math.abs(metric.value - calculatedValue) > 0.000_001) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Percent value must equal numerator divided by denominator",
      });
    }
  });

export const angleRenderModelSchema = z
  .object({
    id: z.string().uuid(),
    revisionId: z.string().uuid(),
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(4_000),
    researchQuestion: z.string().min(1).max(1_000),
    cohort: cohortSnapshotSchema,
    period: reportingPeriodSchema,
    caveat: z.string().min(1).max(2_000),
    recommendedAction: z.string().min(1).max(2_000),
    evidence: z.array(evidenceReferenceSchema).min(1),
    metrics: z.array(angleMetricSchema).min(1),
  })
  .strict()
  .superRefine((angle, context) => {
    const evidenceIds = angle.evidence.map((evidence) => evidence.evidenceId);
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Angle evidence references must be unique",
      });
    }

    for (const [index, metric] of angle.metrics.entries()) {
      if (metric.cohort.key !== angle.cohort.key) {
        context.addIssue({
          code: "custom",
          path: ["metrics", index, "cohort", "key"],
          message: "Metric cohort must match its Angle cohort",
        });
      }
      if (
        metric.period.start !== angle.period.start ||
        metric.period.end !== angle.period.end
      ) {
        context.addIssue({
          code: "custom",
          path: ["metrics", index, "period"],
          message: "Metric period must match its Angle period",
        });
      }
    }
  });

export const reportRenderModelSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateVersion: z.string().min(1).max(120),
    reportId: z.string().uuid(),
    revisionId: z.string().uuid(),
    merchantName: z.string().min(1).max(240),
    title: z.string().min(1).max(300),
    period: reportingPeriodSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    methodology: z.string().min(1).max(8_000),
    sampleNotes: z.string().min(1).max(8_000),
    angles: z.array(angleRenderModelSchema).min(3),
    executiveAngleIds: z.array(z.string().uuid()).min(3).max(5),
  })
  .strict()
  .superRefine((report, context) => {
    const angleIds = report.angles.map((angle) => angle.id);
    const knownAngleIds = new Set(angleIds);
    if (knownAngleIds.size !== angleIds.length) {
      context.addIssue({
        code: "custom",
        path: ["angles"],
        message: "Report Angle IDs must be unique",
      });
    }

    const executiveIds = new Set(report.executiveAngleIds);
    if (executiveIds.size !== report.executiveAngleIds.length) {
      context.addIssue({
        code: "custom",
        path: ["executiveAngleIds"],
        message: "Executive Angle IDs must be unique",
      });
    }

    for (const [index, id] of report.executiveAngleIds.entries()) {
      if (!knownAngleIds.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["executiveAngleIds", index],
          message: "Executive Angle must exist in the report",
        });
      }
    }

    for (const [index, angle] of report.angles.entries()) {
      if (
        angle.period.start !== report.period.start ||
        angle.period.end !== report.period.end
      ) {
        context.addIssue({
          code: "custom",
          path: ["angles", index, "period"],
          message: "Angle period must match the report period",
        });
      }
    }
  });

export type ReportingPeriod = z.infer<typeof reportingPeriodSchema>;
export type CohortSnapshot = z.infer<typeof cohortSnapshotSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type AngleMetric = z.infer<typeof angleMetricSchema>;
export type AngleRenderModel = z.infer<typeof angleRenderModelSchema>;
export type ReportRenderModel = z.infer<typeof reportRenderModelSchema>;

export function parseReportRenderModel(input: unknown): ReportRenderModel {
  return reportRenderModelSchema.parse(input);
}
