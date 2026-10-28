import {
  Link,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from "react-router";

import { authenticateMerchant } from "../lib/merchant-context.server";
import {
  executeOperationsRequest,
  getOperationsService,
} from "../lib/operations-service.server";
import type { CompletedCall } from "../lib/operations-types";

export async function loader({ request }: LoaderFunctionArgs) {
  const { context } = await authenticateMerchant(request);
  const angleId = new URL(request.url).searchParams.get("research");
  return executeOperationsRequest(async () => {
    const service = getOperationsService();
    // Only filter by this merchant's own research; anything else shows all.
    const angle = angleId
      ? ((await service.listMoments(context)).find(
          (moment) => moment.id === angleId,
        ) ?? null)
      : null;
    const calls = await service.listCompletedCalls(
      context,
      angle ? { angleId: angle.id } : {},
    );
    return {
      angle: angle ? { id: angle.id, name: angle.name } : null,
      // Which researcher made the call is internal.
      calls: calls.map(({ mine: _mine, ...call }) => call),
    };
  });
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
  declined: "Asked not to be contacted",
};

function durationLabel(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function RawResearch() {
  const { angle, calls } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  return (
    <>
      <header className="shopify-app__header">
        <p className="eyebrow">Raw research</p>
        <h1>{angle ? angle.name : "Completed calls"}</h1>
        <p>
          {angle
            ? "Finished calls for this research: listen to the recording, read the transcript, and see what the researcher recorded."
            : "Every finished call with your customers: listen to the recording, read the transcript, and see what the researcher recorded."}
        </p>
        {angle ? (
          <p>
            <Link to={`/app/research/${encodeURIComponent(angle.id)}`}>
              Who we call and what we ask
            </Link>{" "}
            · <Link to="/app/calls">Show calls from all research</Link>
          </p>
        ) : null}
      </header>
      <section className="sheet-section">
        <header className="sheet-section__header">
          <h2>Finished calls</h2>
          <span className="sheet-section__meta">
            {calls.length
              ? `${calls.length} call${calls.length === 1 ? "" : "s"}, newest first`
              : "No finished calls yet"}
          </span>
        </header>
        {calls.length ? (
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th className="queue-table__open" scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                  <th scope="col">Research</th>
                  <th scope="col">Ended (ET)</th>
                  <th scope="col">Order #</th>
                  <th scope="col">Outcome</th>
                  <th scope="col" className="is-numeric">
                    Length
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
                        state={{ backTo: `/app/calls${search}` }}
                        to={`/app/calls/${call.interviewId}`}
                      >
                        Open
                      </Link>
                    </td>
                    <td className="queue-table__angle">
                      {call.angle || "General"}
                    </td>
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
                    <td>{outcomeLabels[call.outcome]}</td>
                    <td className="is-numeric">
                      {durationLabel(call.durationSeconds)}
                    </td>
                    <td>
                      {call.transcriptLines
                        ? `${call.transcriptLines} lines`
                        : "—"}
                    </td>
                    <td>{call.hasRecording ? "Available" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sheet-empty">
            {angle
              ? "Calls for this research appear here as researchers finish them."
              : "Calls appear here as researchers finish them."}
          </p>
        )}
      </section>
    </>
  );
}
