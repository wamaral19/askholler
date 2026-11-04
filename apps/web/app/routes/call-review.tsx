import { Link, useLoaderData } from "react-router";

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
            <strong>{data.transcript.length}</strong>
            <span>transcript lines</span>
          </div>
        </section>

        <SheetSection
          index="01"
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

        <SheetSection index="02" title="Customer">
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

        <SheetSection index="03" title="This order">
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
