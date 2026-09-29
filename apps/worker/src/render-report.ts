import { createHash, randomUUID } from "node:crypto";
import {
  angleEvidence,
  angleMetrics,
  angleRevisions,
  angles,
  interviewResponses,
  merchants,
  reportAngles,
  reportArtifacts,
  reportRevisions,
  reports,
  responseEvidence,
  type HollerDatabase,
} from "@holler/db";
import {
  renderReportHtml,
  type AngleMetric,
  type AngleRenderModel,
  type ReportRenderModel,
} from "@holler/reporting";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { SafeJobError, type RenderReportPayload } from "./jobs";

export const MIN_DISCO_ANGLES = 3;
const MAX_EXECUTIVE_ANGLES = 5;
const TEMPLATE_VERSION = "disco-html-v1";

/** Terminal revision/report states written by the renderer. */
export const reportRenderStatus = {
  ready: "ready_for_review",
  insufficientAngles: "blocked_insufficient_angles",
  invalid: "render_failed",
} as const;

const cohortDefinitionSchema = z
  .object({
    key: z.string().min(1),
    version: z.number().int().positive().default(1),
    label: z.string().min(1).optional(),
  })
  .passthrough();

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

function metricSource(population: string): AngleMetric["source"] {
  return population === "commerce_population"
    ? "observed_commerce"
    : "self_reported_interview";
}

/**
 * Assembles published Angles for a report's period into a validated Disco,
 * renders it to HTML, and stores the artifact inline. Idempotent: a revision
 * that is no longer `generating` is left untouched.
 */
export async function renderReportRevision(
  db: HollerDatabase,
  payload: RenderReportPayload,
  now: () => Date = () => new Date(),
): Promise<string> {
  return db.transaction(async (tx) => {
    const [revision] = await tx
      .select()
      .from(reportRevisions)
      .where(
        and(
          eq(reportRevisions.id, payload.reportRevisionId),
          eq(reportRevisions.merchantId, payload.merchantId),
        ),
      )
      .for("update")
      .limit(1);
    if (!revision) throw new SafeJobError("REPORT_REVISION_NOT_FOUND", false);
    if (revision.status !== "generating") return revision.status;

    const [report] = await tx
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.id, revision.reportId),
          eq(reports.merchantId, payload.merchantId),
        ),
      )
      .limit(1);
    const [merchant] = await tx
      .select({ name: merchants.name })
      .from(merchants)
      .where(eq(merchants.id, payload.merchantId))
      .limit(1);
    if (!report || !merchant)
      throw new SafeJobError("REPORT_REVISION_NOT_FOUND", false);

    const setStatus = async (
      status: string,
      fields: Partial<typeof reportRevisions.$inferInsert> = {},
    ) => {
      const updatedAt = now();
      await tx
        .update(reportRevisions)
        .set({ ...fields, status, updatedAt })
        .where(eq(reportRevisions.id, revision.id));
      await tx
        .update(reports)
        .set({ status, updatedAt })
        .where(eq(reports.id, report.id));
      return status;
    };

    // Angles are matched by period start inside the report window, so a
    // merchant-local month (e.g. 04:00Z) still belongs to the UTC month report.
    const angleRows = await tx
      .select({
        revision: angleRevisions,
        category: angles.category,
      })
      .from(angleRevisions)
      .innerJoin(angles, eq(angles.id, angleRevisions.angleId))
      .where(
        and(
          eq(angleRevisions.merchantId, payload.merchantId),
          eq(angles.merchantId, payload.merchantId),
          eq(angleRevisions.status, "published"),
          gte(angles.reportingPeriodStart, report.periodStart),
          lt(angles.reportingPeriodStart, report.periodEnd),
        ),
      )
      .orderBy(asc(angleRevisions.publishedAt), asc(angleRevisions.id));
    // Latest published revision per Angle.
    const latest = new Map<string, (typeof angleRows)[number]>();
    for (const row of angleRows) {
      const current = latest.get(row.revision.angleId);
      if (!current || row.revision.revision > current.revision.revision)
        latest.set(row.revision.angleId, row);
    }
    const selected = [...latest.values()];
    if (selected.length < MIN_DISCO_ANGLES)
      return setStatus(reportRenderStatus.insufficientAngles);

    const revisionIds = selected.map((row) => row.revision.id);
    const evidenceRows = await tx
      .select({
        id: angleEvidence.id,
        angleRevisionId: angleEvidence.angleRevisionId,
        interviewId: interviewResponses.interviewId,
        excerpt: responseEvidence.excerptSnapshot,
      })
      .from(angleEvidence)
      .innerJoin(
        interviewResponses,
        and(
          eq(interviewResponses.id, angleEvidence.responseId),
          eq(interviewResponses.merchantId, payload.merchantId),
        ),
      )
      .leftJoin(
        responseEvidence,
        and(
          eq(responseEvidence.responseId, angleEvidence.responseId),
          eq(
            responseEvidence.transcriptSegmentId,
            angleEvidence.transcriptSegmentId,
          ),
        ),
      )
      .where(
        and(
          eq(angleEvidence.merchantId, payload.merchantId),
          inArray(angleEvidence.angleRevisionId, revisionIds),
        ),
      )
      .orderBy(
        asc(angleEvidence.displayOrder),
        asc(responseEvidence.startChar),
      );
    const metricRows = await tx
      .select()
      .from(angleMetrics)
      .where(
        and(
          eq(angleMetrics.merchantId, payload.merchantId),
          inArray(angleMetrics.angleRevisionId, revisionIds),
        ),
      )
      .orderBy(asc(angleMetrics.name), asc(angleMetrics.id));

    const period = {
      start: report.periodStart.toISOString(),
      end: report.periodEnd.toISOString(),
      displayMonth: report.periodStart.toISOString().slice(0, 10),
    };
    const monthLabel = report.periodStart.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const interviewIds = new Set<string>();

    const angleModels: AngleRenderModel[] = selected.map(
      ({ revision: angle }) => {
        const definition = cohortDefinitionSchema.parse(angle.cohortDefinition);
        const cohort = {
          key: definition.key,
          label: truncate(definition.label ?? definition.key, 240),
          definitionVersion: definition.version,
        };
        const seen = new Set<string>();
        const evidence = evidenceRows
          .filter((row) => row.angleRevisionId === angle.id)
          .filter((row) => !seen.has(row.id) && seen.add(row.id))
          .map((row) => {
            interviewIds.add(row.interviewId);
            return {
              evidenceId: row.id,
              interviewId: row.interviewId,
              kind: "response_evidence" as const,
              label: truncate(
                row.excerpt ? `“${row.excerpt}”` : "Interview response",
                240,
              ),
            };
          });
        const metrics = metricRows
          .filter((row) => row.angleRevisionId === angle.id)
          .map((row) => ({
            id: row.id,
            name: row.name,
            source: metricSource(row.population),
            population: row.population as AngleMetric["population"],
            unit: row.unit as AngleMetric["unit"],
            value: Number(row.value),
            ...(row.numerator === null ? {} : { numerator: row.numerator }),
            ...(row.denominator === null
              ? {}
              : { denominator: row.denominator }),
            cohort,
            period,
            calculationVersion: row.calculationVersion,
          }));
        return {
          id: angle.angleId,
          revisionId: angle.id,
          title: angle.title,
          summary: angle.summary,
          researchQuestion: angle.researchQuestion,
          cohort,
          period,
          caveat: angle.caveat,
          recommendedAction:
            angle.recommendedAction ?? "No recommended action recorded.",
          evidence,
          metrics,
        };
      },
    );
    const executiveAngles = angleModels.slice(0, MAX_EXECUTIVE_ANGLES);
    const title = `${merchant.name} — ${monthLabel} Disco`;
    const methodology =
      "Assembled from published, evidence-linked Angles whose reporting period falls in this month. Each Angle cites human-reviewed interview responses and separates observed commerce metrics from self-reported interview metrics.";
    const sampleNotes = `${angleModels.length} published Angles citing ${interviewIds.size} completed interview${interviewIds.size === 1 ? "" : "s"}.`;
    const model: ReportRenderModel = {
      schemaVersion: 1,
      templateVersion: TEMPLATE_VERSION,
      reportId: report.id,
      revisionId: revision.id,
      merchantName: merchant.name,
      title,
      period,
      generatedAt: now().toISOString(),
      methodology,
      sampleNotes,
      angles: angleModels,
      executiveAngleIds: executiveAngles.map((angle) => angle.id),
    };

    let html: string;
    try {
      html = renderReportHtml(model);
    } catch (error) {
      if (error instanceof z.ZodError)
        return setStatus(reportRenderStatus.invalid);
      throw error;
    }

    const executiveIds = new Set(model.executiveAngleIds);
    await tx
      .insert(reportAngles)
      .values(
        selected.map(({ revision: angle, category }, index) => ({
          reportRevisionId: revision.id,
          angleRevisionId: angle.id,
          section: category,
          displayOrder: index + 1,
          promotedToExecutiveSummary: executiveIds.has(angle.angleId),
        })),
      )
      .onConflictDoNothing();
    const contentSha256 = createHash("sha256").update(html).digest("hex");
    await tx
      .insert(reportArtifacts)
      .values({
        id: randomUUID(),
        merchantId: payload.merchantId,
        reportRevisionId: revision.id,
        format: "html",
        contentSha256,
        inlineContent: html,
        generatedAt: now(),
      })
      .onConflictDoNothing();
    return setStatus(reportRenderStatus.ready, {
      title,
      executiveSummary: executiveAngles.map((angle) => angle.title).join(" · "),
      methodology,
      sampleNotes,
      templateVersion: TEMPLATE_VERSION,
    });
  });
}
