import { useState } from "react";
import {
  Link,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from "react-router";

import {
  dateLabel,
  OrderBlock,
  ProfileCell,
  PromptAnswer,
  promptGroups,
  SheetSection,
} from "../components/call-sheet";
import { authenticateMerchant } from "../lib/merchant-context.server";
import {
  executeOperationsRequest,
  getOperationsService,
} from "../lib/operations-service.server";
import type { CallReview, TranscriptLine } from "../lib/operations-types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { context } = await authenticateMerchant(request);
  return executeOperationsRequest(async () => {
    if (!params.interviewId)
      throw new Response("Interview is required", { status: 400 });
    const review = await getOperationsService().getCallReview(
      context,
      params.interviewId,
    );
    // Only what the merchant's page shows; no phone digits or researcher IDs.
    return {
      id: review.id,
      angle: review.assignment.moment,
      orderNumber: review.assignment.orderNumber,
      outcome: review.outcome,
      endedAt: review.endedAt,
      durationSeconds: review.durationSeconds,
      transcriptStatus: review.transcriptStatus,
      transcript: review.transcript,
      hasRecording: review.hasRecording,
      profile: {
        customerSince: review.profile.customerSince,
        orderCount: review.profile.orderCount,
        lifetimeValue: review.profile.lifetimeValue,
        shopifyCustomerId: review.profile.shopifyCustomerId,
      },
      currentOrder: review.currentOrder,
      prompts: review.prompts,
    };
  });
}

const outcomeLabels: Record<CallReview["outcome"], string> = {
  completed: "Completed",
  no_answer: "Unanswered",
  declined: "Asked not to be contacted",
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

export default function MerchantCall() {
  const data = useLoaderData<typeof loader>();
  // Return to the list the merchant came from, keeping its research filter.
  const { state } = useLocation();
  const backTo =
    typeof state?.backTo === "string" && state.backTo.startsWith("/app/calls")
      ? state.backTo
      : "/app/calls";
  return (
    <div className="call-sheet">
      <section className="call-bar" aria-label="Call summary">
        <div className="call-bar__dial">
          <Link className="console-button console-button--quiet" to={backTo}>
            ← Completed calls
          </Link>
          <span className="call-bar__phone">
            {data.angle || "General call"}
            {data.orderNumber ? ` · Order ${data.orderNumber}` : ""} ·{" "}
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
      </section>

      <SheetSection
        index="01"
        title="Recording and transcript"
        meta={
          data.transcriptStatus === "completed"
            ? `${data.transcript.length} lines`
            : data.transcriptStatus === "processing"
              ? "Transcript still arriving"
              : "No transcript for this call"
        }
      >
        {data.hasRecording ? (
          <RecordingPlayer interviewId={data.id} />
        ) : (
          <p className="sheet-note">No recording for this call.</p>
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

      <SheetSection
        className="sheet-section--research"
        index="02"
        title="What we learned"
        meta="The researcher's tags and notes for each question."
      >
        {promptGroups(data.prompts, data.currentOrder).map((group) => (
          <div
            className={`prompt-group prompt-group--${group.scope}`}
            key={group.key}
          >
            <header className="prompt-group__header">
              <span className="prompt-group__kind">{group.kind}</span>
              <h3>{group.title}</h3>
            </header>
            <div className="sheet-prompts">
              {group.prompts.map((prompt) => (
                <PromptAnswer
                  category={group.kind}
                  key={prompt.key}
                  prompt={prompt}
                />
              ))}
            </div>
          </div>
        ))}
      </SheetSection>

      <SheetSection index="03" title="Customer">
        <dl className="profile-grid">
          <ProfileCell
            label="Customer since"
            value={dateLabel(data.profile.customerSince)}
          />
          <ProfileCell label="Orders" value={String(data.profile.orderCount)} />
          <ProfileCell
            label="Lifetime value"
            value={data.profile.lifetimeValue}
          />
          <ProfileCell
            label="Shopify customer"
            value={data.profile.shopifyCustomerId ?? "Guest checkout"}
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
  );
}

/**
 * Asks for a short-lived recording link only when the merchant presses play.
 * App Bridge adds the session token to the request.
 */
function RecordingPlayer({ interviewId }: { interviewId: string }) {
  const [state, setState] = useState<
    { status: "idle" | "loading" | "failed" } | { status: "ready"; url: string }
  >({ status: "idle" });

  async function load() {
    setState({ status: "loading" });
    try {
      const response = await fetch(
        `/app/calls/${encodeURIComponent(interviewId)}/recording`,
      );
      const body = (await response.json()) as { url?: string };
      setState(
        response.ok && body.url
          ? { status: "ready", url: body.url }
          : { status: "failed" },
      );
    } catch {
      setState({ status: "failed" });
    }
  }

  if (state.status === "ready")
    return (
      <audio autoPlay className="review-audio" controls src={state.url}>
        Your browser cannot play this recording.
      </audio>
    );
  return (
    <p className="sheet-note">
      <button
        className="button button-small"
        disabled={state.status === "loading"}
        onClick={load}
        type="button"
      >
        {state.status === "loading" ? "Loading…" : "Play recording"}
      </button>
      {state.status === "failed" ? " The recording could not be loaded." : null}
    </p>
  );
}
