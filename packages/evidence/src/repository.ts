import type {
  Interview,
  InterviewObservation,
  InterviewResponse,
  ResearchFieldVersionRecord,
  ResponseEvidence,
  Transcript,
  TranscriptSegment,
} from "./models";

export interface EvidenceRepository {
  saveFieldVersion(fieldVersion: ResearchFieldVersionRecord): void;
  getFieldVersion(id: string): ResearchFieldVersionRecord | undefined;

  saveInterview(interview: Interview): void;
  getInterview(id: string): Interview | undefined;

  saveTranscript(transcript: Transcript): void;
  getTranscript(id: string): Transcript | undefined;

  saveTranscriptSegment(segment: TranscriptSegment): void;
  getTranscriptSegment(id: string): TranscriptSegment | undefined;
  listTranscriptSegments(transcriptId: string): readonly TranscriptSegment[];

  saveResponse(response: InterviewResponse): void;
  supersedeAcceptedResponse(id: string): void;
  getResponse(id: string): InterviewResponse | undefined;
  listResponses(
    interviewId: string,
    researchFieldVersionId?: string,
  ): readonly InterviewResponse[];

  saveResponseEvidence(evidence: ResponseEvidence): void;
  listResponseEvidence(
    interviewResponseId: string,
  ): readonly ResponseEvidence[];

  saveObservation(observation: InterviewObservation): void;
  listObservations(interviewId: string): readonly InterviewObservation[];
}

export class InMemoryEvidenceRepository implements EvidenceRepository {
  readonly #fieldVersions = new Map<string, ResearchFieldVersionRecord>();
  readonly #interviews = new Map<string, Interview>();
  readonly #transcripts = new Map<string, Transcript>();
  readonly #segments = new Map<string, TranscriptSegment>();
  readonly #responses = new Map<string, InterviewResponse>();
  readonly #responseEvidence = new Map<string, ResponseEvidence>();
  readonly #observations = new Map<string, InterviewObservation>();

  saveFieldVersion(fieldVersion: ResearchFieldVersionRecord): void {
    this.#insert(
      this.#fieldVersions,
      fieldVersion.id,
      fieldVersion,
      "research field version",
    );
  }

  getFieldVersion(id: string): ResearchFieldVersionRecord | undefined {
    return this.#fieldVersions.get(id);
  }

  saveInterview(interview: Interview): void {
    this.#insert(this.#interviews, interview.id, interview, "interview");
  }

  getInterview(id: string): Interview | undefined {
    return this.#interviews.get(id);
  }

  saveTranscript(transcript: Transcript): void {
    this.#insert(this.#transcripts, transcript.id, transcript, "transcript");
  }

  getTranscript(id: string): Transcript | undefined {
    return this.#transcripts.get(id);
  }

  saveTranscriptSegment(segment: TranscriptSegment): void {
    if (
      this.listTranscriptSegments(segment.transcriptId).some(
        (candidate) => candidate.sequence === segment.sequence,
      )
    ) {
      throw new Error(
        `Transcript sequence already exists: ${segment.sequence}`,
      );
    }
    this.#insert(this.#segments, segment.id, segment, "transcript segment");
  }

  getTranscriptSegment(id: string): TranscriptSegment | undefined {
    return this.#segments.get(id);
  }

  listTranscriptSegments(transcriptId: string): readonly TranscriptSegment[] {
    return [...this.#segments.values()]
      .filter((segment) => segment.transcriptId === transcriptId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  saveResponse(response: InterviewResponse): void {
    this.#insert(this.#responses, response.id, response, "interview response");
  }

  supersedeAcceptedResponse(id: string): void {
    const existing = this.#responses.get(id);
    if (!existing || existing.reviewStatus !== "accepted") {
      throw new Error(`Accepted interview response not found: ${id}`);
    }
    this.#responses.set(id, { ...existing, reviewStatus: "superseded" });
  }

  getResponse(id: string): InterviewResponse | undefined {
    return this.#responses.get(id);
  }

  listResponses(
    interviewId: string,
    researchFieldVersionId?: string,
  ): readonly InterviewResponse[] {
    return [...this.#responses.values()]
      .filter(
        (response) =>
          response.interviewId === interviewId &&
          (researchFieldVersionId === undefined ||
            response.researchFieldVersionId === researchFieldVersionId),
      )
      .sort((left, right) => left.version - right.version);
  }

  saveResponseEvidence(evidence: ResponseEvidence): void {
    this.#insert(
      this.#responseEvidence,
      evidence.id,
      evidence,
      "response evidence",
    );
  }

  listResponseEvidence(
    interviewResponseId: string,
  ): readonly ResponseEvidence[] {
    return [...this.#responseEvidence.values()].filter(
      (evidence) => evidence.interviewResponseId === interviewResponseId,
    );
  }

  saveObservation(observation: InterviewObservation): void {
    this.#insert(
      this.#observations,
      observation.id,
      observation,
      "interview observation",
    );
  }

  listObservations(interviewId: string): readonly InterviewObservation[] {
    return [...this.#observations.values()].filter(
      (observation) => observation.interviewId === interviewId,
    );
  }

  #insert<T>(map: Map<string, T>, id: string, value: T, label: string): void {
    if (map.has(id)) throw new Error(`${label} already exists: ${id}`);
    map.set(id, value);
  }
}
