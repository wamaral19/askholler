import type { Clock, IdGenerator, TenantContext } from "@holler/domain";
import { describe, expect, it } from "vitest";
import { InMemoryEvidenceRepository } from "./repository";
import { EvidenceService } from "./service";

const ids = {
  merchant: "01993f5e-7b6c-7000-8000-000000000001",
  researcher: "01993f5e-7b6c-7000-8000-000000000002",
  assignment: "01993f5e-7b6c-7000-8000-000000000003",
  scriptVersion: "01993f5e-7b6c-7000-8000-000000000004",
  fieldSetVersion: "01993f5e-7b6c-7000-8000-000000000005",
  interview: "01993f5e-7b6c-7000-8000-000000000006",
  transcript: "01993f5e-7b6c-7000-8000-000000000007",
  segment: "01993f5e-7b6c-7000-8000-000000000008",
  fieldVersion: "01993f5e-7b6c-7000-8000-000000000009",
} as const;

const context: TenantContext = {
  merchantId: ids.merchant as TenantContext["merchantId"],
  actorId: ids.researcher as NonNullable<TenantContext["actorId"]>,
  correlationId: "evidence-test",
};

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-09-17T12:00:00.000Z");
  }
}

class SequenceIds implements IdGenerator {
  #next = 10;

  next(): string {
    const suffix = String(this.#next++).padStart(12, "0");
    return `01993f5e-7b6c-7000-8000-${suffix}`;
  }
}

function setup(evidenceExpected = true): {
  repository: InMemoryEvidenceRepository;
  service: EvidenceService;
} {
  const repository = new InMemoryEvidenceRepository();
  const service = new EvidenceService(
    repository,
    new FixedClock(),
    new SequenceIds(),
  );
  service.registerFieldVersion({
    id: ids.fieldVersion,
    merchantId: null,
    version: 1,
    definition: {
      schemaVersion: 1,
      key: "discovery_source",
      label: "Discovery source",
      prompt: "How did you first discover the brand?",
      valueType: "single_select",
      options: [
        { key: "creator", label: "Creator" },
        { key: "meta", label: "Meta" },
      ],
      required: true,
      evidenceExpected,
      attributionSemantic: "self_reported_discovery",
      completionMode: "any",
    },
  });
  service.createInterview(context, {
    id: ids.interview,
    researchAssignmentId: ids.assignment,
    researcherId: ids.researcher,
    scriptVersionId: ids.scriptVersion,
    researchFieldSetVersionId: ids.fieldSetVersion,
    status: "in_progress",
    startedAt: new Date("2026-09-17T11:59:00.000Z"),
    endedAt: null,
  });
  service.createTranscript(context, {
    id: ids.transcript,
    interviewId: ids.interview,
    revision: 1,
    status: "ready",
    language: "en-US",
  });
  service.addTranscriptSegment(context, {
    id: ids.segment,
    transcriptId: ids.transcript,
    sequence: 0,
    speaker: "customer",
    startMs: 1000,
    endMs: 4200,
    text: "I first heard about you from a creator.",
  });
  return { repository, service };
}

describe("EvidenceService", () => {
  it("stores an accepted response with validated transcript evidence", () => {
    const { service } = setup();
    const response = service.recordResponse(context, {
      interviewId: ids.interview,
      researchFieldVersionId: ids.fieldVersion,
      value: "creator",
      provenance: { provenance: "human_reviewed", actorId: ids.researcher },
      evidence: [
        { transcriptSegmentId: ids.segment, startChar: 31, endChar: 38 },
      ],
    });

    expect(response).toMatchObject({
      provenance: "human_reviewed",
      reviewStatus: "accepted",
      researchFieldVersionId: ids.fieldVersion,
      researchFieldSetVersionId: ids.fieldSetVersion,
    });
    expect(service.listResponseEvidence(context, response.id)).toHaveLength(1);

    expect(() =>
      service.recordResponse(context, {
        interviewId: ids.interview,
        researchFieldVersionId: ids.fieldVersion,
        value: "creator",
        provenance: { provenance: "human_reviewed", actorId: ids.researcher },
        evidence: [
          { transcriptSegmentId: ids.segment, startChar: 0, endChar: 500 },
        ],
        supersedesResponseId: response.id,
      }),
    ).toThrow("Invalid evidence span");
  });

  it("stores transcript-invisible live notes as explicit researcher observations", () => {
    const { repository, service } = setup();
    const observation = service.addObservation(context, {
      interviewId: ids.interview,
      observationType: "hesitation",
      note: "Long pause and a noticeably uncertain tone before answering.",
      interviewOffsetMs: 18_500,
      scriptPromptKey: "discovery_source",
      relatedResearchFieldVersionId: ids.fieldVersion,
    });

    expect(observation).toMatchObject({
      source: "researcher_observed",
      observationType: "hesitation",
      observedBy: ids.researcher,
    });
    expect(repository.listObservations(ids.interview)).toEqual([observation]);
  });

  it("keeps AI suggestions as conflicts without overwriting accepted human responses", () => {
    const { repository, service } = setup();
    const human = service.recordResponse(context, {
      interviewId: ids.interview,
      researchFieldVersionId: ids.fieldVersion,
      value: "creator",
      provenance: { provenance: "human_reviewed", actorId: ids.researcher },
      evidence: [
        { transcriptSegmentId: ids.segment, startChar: 31, endChar: 38 },
      ],
    });
    const suggestion = service.recordResponse(context, {
      interviewId: ids.interview,
      researchFieldVersionId: ids.fieldVersion,
      value: "meta",
      provenance: {
        provenance: "ai_suggested",
        modelId: "synthetic-test-model",
        promptTemplateVersion: "attribution-v1",
      },
      evidence: [
        { transcriptSegmentId: ids.segment, startChar: 0, endChar: 1 },
      ],
    });

    expect(suggestion).toMatchObject({
      reviewStatus: "suggested",
      conflictsWithResponseId: human.id,
    });
    expect(
      service.getCurrentAcceptedResponse(
        context,
        ids.interview,
        ids.fieldVersion,
      ),
    ).toEqual(human);
    expect(repository.getResponse(human.id)?.reviewStatus).toBe("accepted");

    expect(() =>
      service.recordResponse(context, {
        interviewId: ids.interview,
        researchFieldVersionId: ids.fieldVersion,
        value: "meta",
        provenance: {
          provenance: "ai_suggested",
          modelId: "synthetic-test-model",
          promptTemplateVersion: "attribution-v1",
        },
        evidence: [
          { transcriptSegmentId: ids.segment, startChar: 0, endChar: 1 },
        ],
        supersedesResponseId: human.id,
      }),
    ).toThrow("cannot supersede");
  });
});
