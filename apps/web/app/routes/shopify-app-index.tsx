import { useEffect, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";

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

// Per-browser display preferences; the page must render correctly without them.
const SETUP_SEEN_KEY = "holler.merchantHome.setupSeen";
const ACTIVE_COLLAPSED_KEY = "holler.merchantHome.activeCollapsed";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is blocked (private window, partitioned iframe); keep defaults.
  }
}

/** Open on a merchant's first visit, collapsed on every visit after. */
function useFirstVisitOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (readStorage(SETUP_SEEN_KEY)) return;
    setOpen(true);
    writeStorage(SETUP_SEEN_KEY, "1");
  }, []);
  return [open, setOpen] as const;
}

/** Open unless the merchant collapsed it last time. */
function useRememberedOpen(key: string) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (readStorage(key) === "1") setOpen(false);
  }, [key]);
  const update = (next: boolean) => {
    // <details> also fires toggle when it first renders open; ignore no-ops so
    // that doesn't overwrite a saved preference.
    if (next === open) return;
    setOpen(next);
    writeStorage(key, next ? "0" : "1");
  };
  return [open, update] as const;
}

export default function CompletedResearchRuns() {
  const { runs, angles } = useLoaderData<typeof loader>();
  const [setupOpen, setSetupOpen] = useFirstVisitOpen();
  const [activeOpen, setActiveOpen] = useRememberedOpen(ACTIVE_COLLAPSED_KEY);
  const setupDone = 1 + (angles.length ? 1 : 0) + (runs.length ? 1 : 0);
  const requested = angles.filter(
    (angle) => angle.status === "draft" && angle.requestedByMerchant,
  );
  const underway = angles.filter(
    (angle) => angle.status === "live" || angle.status === "paused",
  );
  return (
    <div className="merchant-home">
      <header className="shopify-app__header">
        <p className="eyebrow">Holler</p>
        <h1>Your research</h1>
        <p>
          See what Holler is reviewing, researching, and ready to share with
          your team.
        </p>
      </header>

      <details
        className="merchant-collapsible merchant-collapsible--setup"
        onToggle={(event) => setSetupOpen(event.currentTarget.open)}
        open={setupOpen}
      >
        <summary className="merchant-collapsible__summary">
          <span>
            <strong>Getting started</strong>{" "}
            <span className="merchant-run__meta">
              {setupDone} of 3 steps complete
            </span>
          </span>
          <span aria-hidden="true" className="merchant-collapsible__toggle">
            {setupOpen ? "Hide" : "Show"}
          </span>
        </summary>
        <section aria-label="Setup status" className="merchant-setup">
          <div className="shopify-app__card merchant-setup__item is-complete">
            <span>1</span>
            <div>
              <strong>Shopify connected</strong>
              <p>New orders are monitored for approved research.</p>
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
                  ? `${angles.length} research ${angles.length === 1 ? "request is" : "requests are"} on file.`
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
      </details>

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
                  <h3>
                    <Link to={`/app/research/${encodeURIComponent(angle.id)}`}>
                      {angle.name}
                    </Link>
                  </h3>
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
        <details
          className="merchant-collapsible"
          onToggle={(event) => setActiveOpen(event.currentTarget.open)}
          open={activeOpen}
        >
          <summary className="sheet-section__header merchant-collapsible__summary">
            <div>
              <p className="eyebrow">In progress</p>
              <h2>
                Active research{" "}
                <span className="merchant-run__count">{underway.length}</span>
              </h2>
            </div>
            <span aria-hidden="true" className="merchant-collapsible__toggle">
              {activeOpen ? "Hide" : "Show"}
            </span>
          </summary>
          <ul className="merchant-runs">
            {underway.map((angle) => (
              <li
                className="shopify-app__card merchant-run merchant-run--active"
                key={angle.id}
              >
                <div>
                  <h3>
                    <Link to={`/app/research/${encodeURIComponent(angle.id)}`}>
                      {angle.name}
                    </Link>
                  </h3>
                  <p>{angle.objective}</p>
                  <p className="merchant-run__meta">
                    {angle.status === "live"
                      ? "Research in progress"
                      : "Paused"}
                  </p>
                </div>
                <div className="merchant-run__progress">
                  <WeeklyProgress
                    completed={angle.completedThisWeek}
                    target={angle.weeklyTarget}
                  />
                  <Link
                    className="merchant-run__link"
                    to={`/app/research/${encodeURIComponent(angle.id)}`}
                  >
                    Who we call and what we ask →
                  </Link>
                  <Link
                    className="merchant-run__link"
                    to={`/app/calls?research=${encodeURIComponent(angle.id)}`}
                  >
                    View completed calls →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </details>
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
                    {run.completedInterviews}{" "}
                    {run.completedInterviews === 1 ? "interview" : "interviews"}
                  </p>
                </div>
                <div className="merchant-run__actions">
                  <span className="merchant-run__date">
                    Completed{" "}
                    <time dateTime={run.completedAt}>
                      {dateFormat.format(new Date(run.completedAt))}
                    </time>
                  </span>
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
                </div>
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
              <strong>Request research</strong> to tell us which customers to
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
    </div>
  );
}

function WeeklyProgress({
  completed,
  target,
}: {
  readonly completed: number;
  readonly target: number;
}) {
  const percent = target > 0 ? Math.min(100, (completed / target) * 100) : 0;
  return (
    <>
      <p className="merchant-run__meta">
        <strong>{completed}</strong>
        {target > 0 ? ` of ${target}` : ""}{" "}
        {completed === 1 && !target ? "interview" : "interviews"} this week
      </p>
      <div
        aria-label="Interviews completed toward this week's target"
        aria-valuemax={target}
        aria-valuemin={0}
        aria-valuenow={Math.min(completed, target)}
        aria-valuetext={`${completed} of ${target} interviews`}
        className="progress-track"
        role="progressbar"
      >
        <span
          className={completed >= target && target > 0 ? "is-met" : undefined}
          style={{ width: `${percent}%` }}
        />
      </div>
    </>
  );
}
