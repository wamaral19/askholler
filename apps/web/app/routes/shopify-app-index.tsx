import { useLoaderData, type LoaderFunctionArgs } from "react-router";

import { authenticateMerchant } from "../lib/merchant-context.server";
import {
  executeOperationsRequest,
  getOperationsService,
} from "../lib/operations-service.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { context } = await authenticateMerchant(request);
  return executeOperationsRequest(async () => {
    const service = getOperationsService();
    const [runs, angles] = await Promise.all([
      service.listCompletedRuns(context),
      service.listMoments(context),
    ]);
    return { runs, angles };
  });
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function CompletedResearchRuns() {
  const { runs, angles } = useLoaderData<typeof loader>();
  const requested = angles.filter(
    (angle) => angle.status === "draft" && angle.requestedByMerchant,
  );
  const underway = angles.filter(
    (angle) => angle.status === "live" || angle.status === "paused",
  );
  return (
    <>
      <header className="shopify-app__header">
        <p className="eyebrow">Holler</p>
        <h1>Your research</h1>
        <p>
          See what Holler is reviewing, researching, and ready to share with
          your team.
        </p>
      </header>

      <section aria-label="Setup status" className="merchant-setup">
        <div className="shopify-app__card merchant-setup__item is-complete">
          <span>1</span>
          <div>
            <strong>Shopify connected</strong>
            <p>New orders are monitored for approved Research Angles.</p>
          </div>
        </div>
        <div
          className={`shopify-app__card merchant-setup__item${angles.length ? " is-complete" : ""}`}
        >
          <span>2</span>
          <div>
            <strong>Choose a question</strong>
            <p>
              {angles.length
                ? `${angles.length} research ${angles.length === 1 ? "angle is" : "angles are"} on file.`
                : "Request the first customer question you want Holler to investigate."}
            </p>
          </div>
        </div>
        <div
          className={`shopify-app__card merchant-setup__item${runs.length ? " is-complete" : ""}`}
        >
          <span>3</span>
          <div>
            <strong>Receive the evidence</strong>
            <p>
              {runs.length
                ? `${runs.length} completed ${runs.length === 1 ? "run is" : "runs are"} available.`
                : "Reports and supporting calls appear here when a run finishes."}
            </p>
          </div>
        </div>
      </section>

      {requested.length ? (
        <section className="sheet-section">
          <header className="sheet-section__header">
            <div>
              <p className="eyebrow">Requests</p>
              <h2>Waiting for Holler review</h2>
            </div>
          </header>
          <ul className="merchant-runs">
            {requested.map((angle) => (
              <li className="shopify-app__card merchant-run" key={angle.id}>
                <div>
                  <h3>{angle.name}</h3>
                  <p>{angle.objective}</p>
                  <p className="merchant-run__meta">Submitted · Draft</p>
                </div>
                <span className="status-pill state-draft">Under review</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {underway.length ? (
        <section className="sheet-section">
          <header className="sheet-section__header">
            <div>
              <p className="eyebrow">In progress</p>
              <h2>Active research</h2>
            </div>
          </header>
          <ul className="merchant-runs">
            {underway.map((angle) => (
              <li className="shopify-app__card merchant-run" key={angle.id}>
                <div>
                  <h3>{angle.name}</h3>
                  <p>{angle.objective}</p>
                  <p className="merchant-run__meta">
                    {angle.status === "live"
                      ? "Research in progress"
                      : "Paused"}
                    {angle.completedThisWeek
                      ? ` · ${angle.completedThisWeek} completed this week`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sheet-section">
        <header className="sheet-section__header">
          <div>
            <p className="eyebrow">Reports</p>
            <h2>Completed research runs</h2>
          </div>
        </header>
        {runs.length ? (
          <ul className="merchant-runs">
            {runs.map((run) => (
              <li className="shopify-app__card merchant-run" key={run.id}>
                <div>
                  <h2>{run.name}</h2>
                  {run.objective ? <p>{run.objective}</p> : null}
                  <p className="merchant-run__meta">
                    Completed{" "}
                    <time dateTime={run.completedAt}>
                      {dateFormat.format(new Date(run.completedAt))}
                    </time>{" "}
                    · {run.completedInterviews}{" "}
                    {run.completedInterviews === 1 ? "interview" : "interviews"}
                  </p>
                </div>
                {run.reportUrl ? (
                  <a
                    className="button button-primary"
                    href={run.reportUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View report
                  </a>
                ) : (
                  <span className="merchant-run__pending">
                    Report in progress
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <section className="shopify-app__card">
            <h2>No completed runs yet</h2>
            <p>
              Holler researchers call your customers after they order and ask
              how they found you and why they bought. When a research run
              finishes, its report will be listed here.
            </p>
            <p>
              Have a question you want answered? Use{" "}
              <strong>Request an angle</strong> to tell us which customers to
              talk to and what to ask.
            </p>
            <p>
              <a href="/sample-report" target="_blank" rel="noreferrer">
                Explore a clearly labeled sample report
              </a>{" "}
              while your first run is prepared.
            </p>
          </section>
        )}
      </section>
    </>
  );
}
