import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { AppShell } from "../components/app-shell";
import {
  dateLabel,
  OrderBlock,
  ProfileCell,
  SheetSection,
} from "../components/call-sheet";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import type { CallReview, TranscriptLine } from "../lib/operations-types";

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { interviewId?: string };
}) {
  return executeOperationsRequest(async () => {
    if (!params.interviewId)
      throw new Response("Interview is required", { status: 400 });
    return getOperationsService().getCallReview(
      await getTenantContext(request),
      params.interviewId,
    );
  });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { interviewId?: string };
}) {
  if (!params.interviewId)
    throw new Response("Interview is required", { status: 400 });
  const form = await request.formData();
  if (form.get("intent") !== "code_evidence")
    throw new Response("Unsupported action", { status: 400 });
  const tag = String(form.get("tag") ?? "").trim();
  const status = String(form.get("codingStatus") ?? "found");
  const normalized = String(form.get("normalized") ?? "").trim();
  const rawLanguage = String(form.get("rawLanguage") ?? "").trim();
  const evidence = String(form.get("evidence") ?? "").trim();
  if (!tag || (status === "found" && (!normalized || !evidence)))
    return {
      error:
        "Choose a tag and include both a normalized value and evidence excerpt.",
    };
  await executeOperationsRequest(async () => {
    await getOperationsService().addObservation(
      await getTenantContext(request),
      params.interviewId!,
      "other",
      JSON.stringify({
        evidenceTag: tag,
        status,
        normalized,
        rawLanguage,
        evidence,
        confidence: String(form.get("confidence") ?? "medium"),
        interpretation: String(form.get("interpretation") ?? "direct"),
      }),
    );
  });
  return { saved: true };
}

export function meta() {
  return [{ title: "Call review · Holler" }];
}

const outcomeLabels: Record<CallReview["outcome"], string> = {
  completed: "Completed",
  no_answer: "Unanswered",
  declined: "Do not contact",
};

const speakerLabels: Record<TranscriptLine["speaker"], string> = {
  researcher: "Researcher",
  customer: "Customer",
  unknown: "Speaker",
};

function clock(ms: number | null) {
  if (ms === null) return "";
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function CallReviewRoute() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const { id: interviewId, assignment, profile } = data;

  return (
    <AppShell
      className="app-shell--console"
      eyebrow={`Call review${assignment.moment ? ` · ${assignment.moment}` : ""}`}
      title={profile.firstName ?? assignment.customerName}
      description={[
        profile.locality,
        assignment.orderNumber ? `Order ${assignment.orderNumber}` : null,
        assignment.merchant,
      ]
        .filter(Boolean)
        .join(" · ")}
      hideHeader
    >
      <div className="call-sheet">
        <section className="call-bar" aria-label="Call summary">
          <div className="call-bar__dial">
            <Link className="console-button console-button--quiet" to="/calls">
              ← Completed calls
            </Link>
            <span className="call-bar__phone">
              {outcomeLabels[data.outcome]}
              {data.endedAt
                ? ` · ${new Date(data.endedAt).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })} ET`
                : ""}
              {data.durationSeconds !== null
                ? ` · ${clock(data.durationSeconds * 1000)} long`
                : ""}
            </span>
          </div>
          <div className="call-bar__progress is-done">
            <strong>{data.fields.length}</strong>
            <span>target tags to review</span>
          </div>
        </section>

        <EvidenceCodingPanel fields={data.fields} result={result} />

        <SheetSection
          index="02"
          title="Recording and transcript"
          meta={
            data.transcriptStatus === "completed"
              ? `${data.transcript.length} lines · live transcription`
              : data.transcriptStatus === "processing"
                ? "Transcript still arriving"
                : data.transcriptStatus === "failed"
                  ? "Transcription failed"
                  : "No transcript for this call"
          }
        >
          {data.hasRecording ? (
            <audio
              className="review-audio"
              controls
              preload="none"
              src={`/calls/${encodeURIComponent(interviewId)}/recording`}
            >
              Your browser cannot play this recording.
            </audio>
          ) : (
            <p className="sheet-note">No stored recording for this call.</p>
          )}
          {data.transcript.length ? (
            <ol className="review-transcript">
              {data.transcript.map((line) => (
                <li
                  className={`review-transcript__line review-transcript__line--${line.speaker}`}
                  key={line.sequence}
                >
                  <span className="review-transcript__who">
                    {speakerLabels[line.speaker]}
                    {line.atMs !== null ? (
                      <time className="review-transcript__at">
                        {clock(line.atMs)}
                      </time>
                    ) : null}
                  </span>
                  <p>{line.text}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </SheetSection>

        <SheetSection index="03" title="Customer">
          <dl className="profile-grid">
            <ProfileCell label="First name" value={profile.firstName} />
            <ProfileCell label="City, state" value={profile.locality} />
            <ProfileCell
              label="Customer since"
              value={dateLabel(profile.customerSince)}
            />
            <ProfileCell label="Orders" value={String(profile.orderCount)} />
            <ProfileCell label="Lifetime value" value={profile.lifetimeValue} />
            <ProfileCell
              label="Shopify customer"
              value={profile.shopifyCustomerId ?? "Guest checkout"}
            />
          </dl>
        </SheetSection>

        <SheetSection index="04" title="This order">
          {data.currentOrder ? (
            <OrderBlock order={data.currentOrder} tone="current" />
          ) : (
            <p className="sheet-empty">Order details unavailable.</p>
          )}
        </SheetSection>
      </div>
    </AppShell>
  );
}

function EvidenceCodingPanel({
  fields,
  result,
}: {
  fields: CallReview["fields"];
  result: { error: string } | { saved: boolean } | undefined;
}) {
  const navigation = useNavigation();
  return (
    <SheetSection
      className="evidence-coding"
      index="01"
      title="Code transcript evidence"
      meta="Multiple values per tag are allowed"
    >
      <div className="evidence-coding__intro">
        <div>
          <strong>Evidence first</strong>
          <p>
            Code what the customer said, preserve their language, and anchor
            every interpretation to a transcript excerpt. “Not discussed” is
            distinct from “no.”
          </p>
        </div>
        <div className="evidence-coding__targets" aria-label="Target tags">
          {fields.map((field) => (
            <span key={field.id}>{field.label}</span>
          ))}
          <span>emerging_signal</span>
        </div>
      </div>
      <Form className="evidence-form" method="post">
        <input name="intent" type="hidden" value="code_evidence" />
        <label>
          <span>Target tag</span>
          <select name="tag" required>
            <option value="">Choose a tag…</option>
            {fields.map((field) => (
              <option key={field.id} value={field.label}>
                {field.label}
              </option>
            ))}
            <option value="emerging_signal">Emerging signal</option>
          </select>
        </label>
        <label>
          <span>Review status</span>
          <select name="codingStatus" defaultValue="found">
            <option value="found">Evidence found</option>
            <option value="not_discussed">Not discussed</option>
          </select>
        </label>
        <label>
          <span>Normalized value</span>
          <input name="normalized" placeholder="e.g. upcoming_event" />
        </label>
        <label>
          <span>Customer’s language</span>
          <input name="rawLanguage" placeholder="Their exact phrasing" />
        </label>
        <label className="full-span">
          <span>Evidence excerpt</span>
          <textarea
            name="evidence"
            placeholder="Paste the smallest transcript span that supports this code"
            rows={3}
          />
        </label>
        <label>
          <span>Interpretation</span>
          <select name="interpretation" defaultValue="direct">
            <option value="direct">Directly stated</option>
            <option value="inferred">Researcher inferred</option>
          </select>
        </label>
        <label>
          <span>Confidence</span>
          <select name="confidence" defaultValue="high">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <div className="evidence-form__actions full-span">
          {result && "error" in result ? (
            <span className="save-notice save-notice--error" role="alert">
              {result.error}
            </span>
          ) : result?.saved ? (
            <span className="save-notice" role="status">
              Evidence saved. Add another value or continue reviewing.
            </span>
          ) : null}
          <button
            className="console-button console-button--go"
            disabled={navigation.state === "submitting"}
            type="submit"
          >
            {navigation.state === "submitting" ? "Saving…" : "Save evidence"}
          </button>
        </div>
      </Form>
    </SheetSection>
  );
}
