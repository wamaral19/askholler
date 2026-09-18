import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalIds, runCanonicalSyntheticFlow } from "./index";

describe("canonical synthetic MVP integration", () => {
  it("flows a repeat skincare order through qualification, human research, evidence, Angle, and report", async () => {
    const result = await runCanonicalSyntheticFlow();

    expect(result.commerce.event).toMatchObject({
      customerOrderSequence: 2,
      orderId: canonicalIds.order,
      customerId: canonicalIds.customer,
      observedAttribution: { source: "meta", channel: "paid_social" },
    });
    expect(result.qualification).toEqual({
      outcome: "match",
      eligible: true,
      unknownReasons: [],
    });
    expect(result.queue).toEqual([
      expect.objectContaining({
        id: canonicalIds.assignment,
        status: "queued",
      }),
    ]);

    expect(result.call).toEqual({
      providerCallReference: "fake-call-ec694231aa19bee5994d0740",
      finalStatus: "completed",
    });
    expect(result.responses.discovery).toMatchObject({
      value: "creator",
      reviewStatus: "accepted",
    });
    expect(result.responses.trigger).toMatchObject({
      value: "email",
      reviewStatus: "accepted",
    });
    expect(result.responses.influence.value).toEqual(["none"]);
    expect(result.responses.liquidity.value).toBe("ideal");
    expect(result.responses.absorption.value).toBe(5);
    expect(result.responseEvidence.map((evidence) => evidence.id)).toEqual([
      canonicalIds.creatorEvidence,
      canonicalIds.emailEvidence,
      canonicalIds.metaEvidence,
      canonicalIds.liquidityEvidence,
      canonicalIds.absorptionEvidence,
    ]);
    expect(result.observation).toMatchObject({
      id: canonicalIds.observation,
      source: "researcher_observed",
      observationType: "excitement",
      interviewOffsetMs: 64_000,
    });

    expect(result.attributionComparison).toEqual({
      observed: { source: "meta", channel: "paid_social" },
      selfReported: {
        discovery: "creator",
        trigger: "email",
        influence: ["none"],
      },
    });
    expect(result.canonicalAngle).toMatchObject({
      id: canonicalIds.angle,
      revisionId: canonicalIds.angleRevision,
      evidence: expect.arrayContaining([
        expect.objectContaining({ evidenceId: canonicalIds.creatorEvidence }),
        expect.objectContaining({ evidenceId: canonicalIds.emailEvidence }),
      ]),
    });
    expect(result.canonicalAngle.metrics).toEqual([
      expect.objectContaining({
        source: "observed_commerce",
        population: "commerce_population",
      }),
      expect.objectContaining({
        source: "self_reported_interview",
        population: "interview_sample",
      }),
    ]);
    expect(result.report.executiveAngleIds).toHaveLength(3);
    expect(result.html).toContain("Monthly Angles Report");
    expect(result.html).toContain(canonicalIds.creatorEvidence);
    expect(result.html).toContain(canonicalIds.emailEvidence);
    expect(result.html).not.toContain("Casey Example");
    expect(result.html).not.toContain("+12025550142");
    expect(createHash("sha256").update(result.html).digest("hex")).toBe(
      "c328e0a21c2a4c41c4954bb863274fe4e0a6e11009b452afd38f3f8bb9f16b5f",
    );
  });
});
