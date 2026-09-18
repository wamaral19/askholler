import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  angleMetricSchema,
  renderReportHtml,
  reportRenderModelSchema,
  type AngleMetric,
  type AngleRenderModel,
  type CohortSnapshot,
  type ReportRenderModel,
  type ReportingPeriod,
} from "./index";

const period: ReportingPeriod = {
  start: "2026-09-01T04:00:00.000Z",
  end: "2026-10-01T04:00:00.000Z",
  displayMonth: "2026-09-01",
};

const cohort: CohortSnapshot = {
  key: "juniper-row-repeat-moisturizer-v1",
  label: "Second purchase into skincare",
  definitionVersion: 1,
};

function percentMetric(overrides: Partial<AngleMetric> = {}): AngleMetric {
  return {
    id: "00000000-0000-7000-8000-000000000731",
    name: "Observed Meta-attributed qualifying orders",
    source: "observed_commerce",
    population: "commerce_population",
    unit: "percent",
    value: 100,
    numerator: 1,
    denominator: 1,
    cohort,
    period,
    calculationVersion: "attribution-comparison-v1",
    ...overrides,
  };
}

function angle(
  id: string,
  revisionId: string,
  title: string,
  evidenceId: string,
  metrics: readonly AngleMetric[],
): AngleRenderModel {
  return {
    id,
    revisionId,
    title,
    summary:
      "Observed Meta captured the purchase session while the customer reported creator discovery and an email purchase trigger.",
    researchQuestion:
      "What created discovery, and what triggered this purchase?",
    cohort,
    period,
    caveat:
      "This synthetic one-interview sample demonstrates provenance and comparison behavior; it is not statistically representative.",
    recommendedAction:
      "Test creator-led discovery creative and distinguish discovery from email purchase triggers in attribution reviews.",
    evidence: [
      {
        evidenceId,
        interviewId: "00000000-0000-7000-8000-000000000531",
        kind: "tag_evidence",
        label: "Reviewed creator-discovery evidence",
      },
    ],
    metrics: [...metrics],
  };
}

function canonicalReport(): ReportRenderModel {
  const observed = percentMetric();
  const selfReported = percentMetric({
    id: "00000000-0000-7000-8000-000000000732",
    name: "Completed interviews reporting creator discovery",
    source: "self_reported_interview",
    population: "interview_sample",
  });
  const canonicalAngle = angle(
    "00000000-0000-7000-8000-000000000701",
    "00000000-0000-7000-8000-000000000702",
    "Meta captured the session; creator discovery and email drove the journey",
    "00000000-0000-7000-8000-000000000611",
    [observed, selfReported],
  );
  const textureAngle = angle(
    "00000000-0000-7000-8000-000000000703",
    "00000000-0000-7000-8000-000000000704",
    "Ideal moisturizer texture generated notable excitement",
    "00000000-0000-7000-8000-000000000614",
    [
      percentMetric({
        id: "00000000-0000-7000-8000-000000000733",
        name: "Interviewed customers describing texture as ideal",
        source: "self_reported_interview",
        population: "interview_sample",
      }),
    ],
  );
  const triggerAngle = angle(
    "00000000-0000-7000-8000-000000000705",
    "00000000-0000-7000-8000-000000000706",
    "Email was the immediate purchase trigger",
    "00000000-0000-7000-8000-000000000613",
    [
      percentMetric({
        id: "00000000-0000-7000-8000-000000000734",
        name: "Completed interviews reporting an email trigger",
        source: "self_reported_interview",
        population: "interview_sample",
      }),
    ],
  );

  return {
    schemaVersion: 1,
    templateVersion: "angles-html-v1",
    reportId: "00000000-0000-7000-8000-000000000711",
    revisionId: "00000000-0000-7000-8000-000000000712",
    merchantName: "Juniper Row",
    title: "Juniper Row — September 2026 Angles",
    period,
    generatedAt: "2026-10-01T14:00:00.000Z",
    methodology:
      "Synthetic second-purchase cohort evaluated against current catalog categories; interview findings remain linked to reviewed evidence.",
    sampleNotes:
      "One completed synthetic interview. Commerce and interview-sample metrics use separate populations and are not statistically representative.",
    angles: [canonicalAngle, textureAngle, triggerAngle],
    executiveAngleIds: [canonicalAngle.id, textureAngle.id, triggerAngle.id],
  };
}

describe("reporting validation", () => {
  it("rejects a percentage without numerator and denominator", () => {
    const unsupported = {
      ...percentMetric(),
      numerator: undefined,
      denominator: undefined,
    };

    const result = angleMetricSchema.safeParse(unsupported);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Percent metrics require a numerator",
          "Percent metrics require a denominator",
        ]),
      );
    }
  });

  it("rejects observed and self-reported metrics assigned to the wrong populations", () => {
    expect(
      angleMetricSchema.safeParse(
        percentMetric({ population: "interview_sample" }),
      ).success,
    ).toBe(false);
    expect(
      angleMetricSchema.safeParse(
        percentMetric({
          source: "self_reported_interview",
          population: "commerce_population",
        }),
      ).success,
    ).toBe(false);
  });

  it("requires evidence, caveat, cohort, period, and three to five executive Angles", () => {
    const report = canonicalReport();
    const invalid = {
      ...report,
      angles: [
        {
          ...report.angles[0],
          caveat: "",
          evidence: [],
          cohort: undefined,
          period: undefined,
        },
        report.angles[1],
      ],
      executiveAngleIds: report.executiveAngleIds.slice(0, 2),
    };

    expect(reportRenderModelSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("renderReportHtml", () => {
  it("renders deterministic HTML with methodology, sample notes, populations, and evidence IDs", () => {
    const report = canonicalReport();
    const first = renderReportHtml(report);
    const replay = renderReportHtml(structuredClone(report));

    expect(replay).toBe(first);
    expect(createHash("sha256").update(first).digest("hex")).toBe(
      "886fe02a77264950489037a8498a3dacd4815b5fdec1ca5b029f03a6f9e89d0a",
    );
    expect(first).toContain(
      "Meta captured the session; creator discovery and email drove the journey",
    );
    expect(first).toContain("Methodology");
    expect(first).toContain("Sample notes");
    expect(first).toContain('data-population="commerce_population"');
    expect(first).toContain('data-population="interview_sample"');
    expect(first).toContain("00000000-0000-7000-8000-000000000611");
    expect(first).toContain("00000000-0000-7000-8000-000000000613");
    expect(first).not.toContain("Casey Example");
  });

  it("escapes merchant-controlled text", () => {
    const report = canonicalReport();
    report.merchantName = "Juniper <script>alert('x')</script> Row";

    const html = renderReportHtml(report);

    expect(html).toContain(
      "Juniper &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; Row",
    );
    expect(html).not.toContain("<script>alert");
  });
});
