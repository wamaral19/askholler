import { Link, useLoaderData } from "react-router";

import { AppShell } from "../components/app-shell";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import type { CompletedCall } from "../lib/operations-types";

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    return {
      calls: await getOperationsService().listCompletedCalls(context),
    };
  });
}

export function meta() {
  return [{ title: "Completed calls · Holler" }];
}

const easternTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const outcomeLabels: Record<CompletedCall["outcome"], string> = {
  completed: "Completed",
  no_answer: "Unanswered",
  declined: "Do not contact",
};

function durationLabel(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function CompletedCallsRoute() {
  const { calls } = useLoaderData<typeof loader>();
  return (
    <AppShell
      className="app-shell--console"
      eyebrow="Live research"
      title="Completed calls"
      description="Review finished calls: listen back, read the transcript, and correct prompt tags. Research angle is blank for general calls."
      hideHeader
    >
      <div className="call-sheet queue-sheet">
        <section className="call-bar queue-bar" aria-label="Completed calls">
          <div className="queue-bar__title">
            <strong>Completed calls</strong>
            <span>Listen back, read the transcript, correct tags</span>
          </div>
        </section>
        <section className="sheet-section">
          <header className="sheet-section__header">
            <h2>Finished calls</h2>
            <span className="sheet-section__meta">
              {calls.length
                ? `${calls.length} call${calls.length === 1 ? "" : "s"}, newest first`
                : "No finished calls yet"}
            </span>
          </header>
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th className="queue-table__open" scope="col">
                    <span className="sr-only">Review</span>
                  </th>
                  <th scope="col">Research angle</th>
                  <th scope="col">Ended (ET)</th>
                  <th scope="col">Order #</th>
                  <th scope="col">Outcome</th>
                  <th scope="col" className="is-numeric">
                    Length
                  </th>
                  <th scope="col" className="is-numeric">
                    Prompts done
                  </th>
                  <th scope="col">Transcript</th>
                  <th scope="col">Recording</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr
                    className="queue-row queue-row--open"
                    key={call.interviewId}
                  >
                    <td className="queue-table__open">
                      <Link
                        className="queue-open"
                        to={`/calls/${call.interviewId}`}
                      >
                        Review
                      </Link>
                    </td>
                    <td className="queue-table__angle">{call.angle}</td>
                    <td>
                      {call.endedAt ? (
                        <time dateTime={call.endedAt}>
                          {easternTime.format(new Date(call.endedAt))}
                        </time>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{call.orderNumber ?? "—"}</td>
                    <td>
                      {outcomeLabels[call.outcome]}
                      {call.mine ? null : (
                        <span className="queue-row__zone">teammate</span>
                      )}
                    </td>
                    <td className="is-numeric">
                      {durationLabel(call.durationSeconds)}
                    </td>
                    <td className="is-numeric">{call.promptsCovered}</td>
                    <td>
                      {call.transcriptLines
                        ? `${call.transcriptLines} lines`
                        : "—"}
                    </td>
                    <td>{call.hasRecording ? "Stored" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
