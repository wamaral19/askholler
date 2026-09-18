import { Form, Link, useActionData, useLoaderData } from "react-router";

import { AppShell, PrototypeBanner } from "../components/app-shell";
import {
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";

export async function loader({ request }: { request: Request }) {
  return {
    moments: await getOperationsService().listMoments(
      getTenantContext(request),
    ),
  };
}

export async function action({ request }: { request: Request }) {
  const form = await request.formData();
  if (form.get("intent") !== "generate_report") {
    throw new Response("Unsupported action", { status: 400 });
  }
  const period = String(form.get("period") ?? "");
  if (!/^\d{4}-\d{2}$/.test(period))
    throw new Response("Invalid report period", { status: 400 });
  return getOperationsService().generateReport(
    getTenantContext(request),
    period,
  );
}

export function meta() {
  return [{ title: "Research Moments · Holler" }];
}

export default function ResearchMomentsRoute() {
  const { moments } = useLoaderData<typeof loader>();
  const generatedReport = useActionData<typeof action>();
  const activeCount = moments.filter(
    (moment) => moment.status === "active",
  ).length;
  const qualified = moments.reduce(
    (total, moment) => total + moment.qualifiedThisWeek,
    0,
  );

  return (
    <AppShell
      eyebrow="Research design"
      title="Research Moments"
      description="Define who should enter research, what the team wants to learn, and which approved script applies."
      actions={
        <Link className="button button-primary" to="/moments/new">
          Create Research Moment
        </Link>
      }
    >
      <PrototypeBanner>
        Development uses an injectable synthetic service; configured deployments
        use persisted application services.
      </PrototypeBanner>

      <Form method="post" className="queue-toolbar">
        <input name="intent" type="hidden" value="generate_report" />
        <label>
          <span>Reporting period</span>
          <input name="period" required type="month" />
        </label>
        <button className="button button-primary" type="submit">
          Generate report
        </button>
        {generatedReport ? (
          <span className="inline-notice">
            Report queued: {generatedReport.reportId}
          </span>
        ) : null}
      </Form>

      <section className="metric-grid" aria-label="Research Moment summary">
        <article className="metric-card">
          <span>Active moments</span>
          <strong>{activeCount}</strong>
          <small>of {moments.length} configured</small>
        </article>
        <article className="metric-card">
          <span>Qualified this week</span>
          <strong>{qualified}</strong>
          <small>synthetic opportunities</small>
        </article>
        <article className="metric-card">
          <span>Weekly interview target</span>
          <strong>
            {moments.reduce((total, moment) => total + moment.weeklyTarget, 0)}
          </strong>
          <small>across all moments</small>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Configured runs</p>
            <h2>Current research portfolio</h2>
          </div>
          <label className="search-control">
            <span className="sr-only">Search moments</span>
            <input placeholder="Search moments" type="search" />
          </label>
        </div>
        <div className="moment-list">
          {moments.map((moment) => (
            <article className="moment-card" key={moment.id}>
              <div className="moment-card-main">
                <div className="card-title-row">
                  <span className={`status-pill status-${moment.status}`}>
                    {moment.status}
                  </span>
                  <span className="subtle">{moment.trigger}</span>
                </div>
                <h3>{moment.name}</h3>
                <p>{moment.objective}</p>
                <div className="cohort-summary">
                  <span>Cohort</span>
                  <strong>{moment.cohortSummary}</strong>
                </div>
              </div>
              <dl className="moment-meta">
                <div>
                  <dt>Target</dt>
                  <dd>{moment.weeklyTarget}/week</dd>
                </div>
                <div>
                  <dt>Research fields</dt>
                  <dd>{moment.fieldCount}</dd>
                </div>
                <div>
                  <dt>Script</dt>
                  <dd>{moment.scriptVersion}</dd>
                </div>
                <div>
                  <dt>Qualified</dt>
                  <dd>{moment.qualifiedThisWeek}</dd>
                </div>
              </dl>
              <div className="moment-card-action">
                <Link className="button button-quiet" to="/moments/new">
                  View configuration
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
