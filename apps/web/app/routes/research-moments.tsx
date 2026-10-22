import { Form, Link, useActionData, useLoaderData } from "react-router";

import { AppShell, PrototypeBanner } from "../components/app-shell";
import {
  canManageMoments,
  isMomentRunStatus,
  momentStatusLabels,
  momentTransitionLabel,
  momentTransitionsFrom,
} from "../lib/moment-status";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import type { MomentStatus } from "../lib/prototype-data";

const statusOrder: readonly MomentStatus[] = [
  "live",
  "paused",
  "draft",
  "completed",
];

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const service = getOperationsService();
    const [moments, general] = await Promise.all([
      service.listMoments(context),
      service.getGeneralCalls(context),
    ]);
    return {
      general,
      moments: [...moments].sort(
        (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
      ),
      canManage: canManageMoments(context.roles),
    };
  });
}

export async function action({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const form = await request.formData();
    const intent = form.get("intent");
    if (intent === "set_status") {
      const momentId = String(form.get("momentId") ?? "");
      const status = form.get("status");
      if (!momentId || !isMomentRunStatus(status))
        throw new Response("Invalid moment status", { status: 400 });
      const moment = await getOperationsService().setMomentStatus(
        await getTenantContext(request),
        momentId,
        status,
      );
      return { intent, momentId: moment.id, status: moment.status };
    }
    if (intent === "set_report_url") {
      const momentId = String(form.get("momentId") ?? "");
      const reportUrl = String(form.get("reportUrl") ?? "").trim();
      if (!momentId) throw new Response("Invalid moment", { status: 400 });
      await getOperationsService().setMomentReportUrl(
        await getTenantContext(request),
        momentId,
        reportUrl || null,
      );
      return { intent, momentId };
    }
    if (intent !== "generate_report") {
      throw new Response("Unsupported action", { status: 400 });
    }
    const period = String(form.get("period") ?? "");
    if (!/^\d{4}-\d{2}$/.test(period))
      throw new Response("Invalid report period", { status: 400 });
    return {
      intent,
      ...(await getOperationsService().generateReport(
        await getTenantContext(request),
        period,
      )),
    };
  });
}

export function meta() {
  return [{ title: "Live angles · Holler" }];
}

export default function ResearchMomentsRoute() {
  const { moments, general, canManage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const generatedReport =
    actionData && "reportId" in actionData ? actionData : undefined;
  const liveCount = moments.filter((moment) => moment.status === "live").length;
  const running = moments.filter(
    (moment) => moment.status === "live" || moment.status === "paused",
  );
  const completedThisWeek = moments.reduce(
    (total, moment) => total + moment.completedThisWeek,
    0,
  );
  const weeklyTarget = running.reduce(
    (total, moment) => total + moment.weeklyTarget,
    0,
  );

  return (
    <AppShell
      eyebrow="Angle setup"
      title="Live angles"
      description="Live angles send new orders to the queue for researchers to call. Pause or complete an angle to stop new orders; reopen it any time."
      actions={
        <Link className="button button-primary" to="/moments/new">
          New angle
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

      <section className="metric-grid" aria-label="Angle summary">
        <article className="metric-card">
          <span>Live angles</span>
          <strong>{liveCount}</strong>
          <small>of {moments.length} configured</small>
        </article>
        <article className="metric-card">
          <span>Completed this week</span>
          <strong>{completedThisWeek}</strong>
          <small>interviews across all angles</small>
        </article>
        <article className="metric-card">
          <span>Weekly target</span>
          <strong>{weeklyTarget}</strong>
          <small>across live and paused angles</small>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Configured runs</p>
            <h2>Current research portfolio</h2>
          </div>
          <label className="search-control">
            <span className="sr-only">Search angles</span>
            <input placeholder="Search angles" type="search" />
          </label>
        </div>
        <div className="moment-list">
          {general ? (
            <article className="moment-card">
              <div className="moment-card-main">
                <div className="moment-card-title">
                  <h3>{general.name}</h3>
                  <span className={`status-pill status-${general.status}`}>
                    {momentStatusLabels[general.status]}
                  </span>
                </div>
                <p>
                  Every callable order that no live angle matches still reaches
                  the queue, with a blank research angle.
                </p>
              </div>
              <div className="cohort-summary">
                <span>Fields</span>
                <p>
                  Your {general.fieldCount} default research{" "}
                  {general.fieldCount === 1 ? "field" : "fields"}.{" "}
                  <Link to="/admin/research-fields">Change defaults</Link>
                </p>
              </div>
              <div className="moment-card-action">
                {canManage
                  ? momentTransitionsFrom(general.status)
                      // General calls pause and resume; they never complete.
                      .filter((status) => status !== "completed")
                      .map((status) => (
                        <Form method="post" key={status}>
                          <input
                            name="intent"
                            type="hidden"
                            value="set_status"
                          />
                          <input
                            name="momentId"
                            type="hidden"
                            value={general.id}
                          />
                          <button
                            className={
                              status === "live"
                                ? "button button-primary button-small"
                                : "button button-small"
                            }
                            name="status"
                            type="submit"
                            value={status}
                          >
                            {momentTransitionLabel(general.status, status)}
                          </button>
                        </Form>
                      ))
                  : null}
                <Link
                  className="button button-quiet button-small"
                  to={`/moments/${encodeURIComponent(general.id)}/script`}
                >
                  {canManage ? "Edit script" : "View script"}
                </Link>
              </div>
            </article>
          ) : null}
          {moments.map((moment) => (
            <article className="moment-card" key={moment.id}>
              <div className="moment-card-main">
                <div className="moment-card-title">
                  <h3>{moment.name}</h3>
                  <span className={`status-pill status-${moment.status}`}>
                    {momentStatusLabels[moment.status]}
                  </span>
                  {moment.requestedByMerchant ? (
                    <span className="status-pill">Requested by merchant</span>
                  ) : null}
                </div>
                <p>{moment.objective}</p>
                {moment.status === "completed" && canManage ? (
                  <Form className="report-link-form" method="post">
                    <input name="intent" type="hidden" value="set_report_url" />
                    <input name="momentId" type="hidden" value={moment.id} />
                    <label>
                      <span>Report link (shown to the merchant)</span>
                      <input
                        defaultValue={moment.reportUrl ?? ""}
                        name="reportUrl"
                        placeholder="https://"
                        type="url"
                      />
                    </label>
                    <button className="button button-small" type="submit">
                      Save link
                    </button>
                  </Form>
                ) : null}
              </div>
              <MomentProgress
                completed={moment.completedThisWeek}
                target={moment.weeklyTarget}
              />
              <div className="cohort-summary">
                <span>Cohort</span>
                <p>{moment.cohortSummary}</p>
              </div>
              <div className="moment-card-action">
                {canManage
                  ? momentTransitionsFrom(moment.status).map((status) => (
                      <Form method="post" key={status}>
                        <input name="intent" type="hidden" value="set_status" />
                        <input
                          name="momentId"
                          type="hidden"
                          value={moment.id}
                        />
                        <button
                          className={
                            status === "live"
                              ? "button button-primary button-small"
                              : "button button-small"
                          }
                          name="status"
                          type="submit"
                          value={status}
                        >
                          {momentTransitionLabel(moment.status, status)}
                        </button>
                      </Form>
                    ))
                  : null}
                <Link
                  className="button button-quiet button-small"
                  to={`/moments/${encodeURIComponent(moment.id)}/script`}
                >
                  {canManage ? "Edit script" : "View script"}
                </Link>
                <Link
                  className="button button-quiet button-small"
                  to="/moments/new"
                >
                  {moment.status === "draft"
                    ? "Continue setup"
                    : "View configuration"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function MomentProgress({
  completed,
  target,
}: {
  readonly completed: number;
  readonly target: number;
}) {
  const percent = target > 0 ? Math.min(100, (completed / target) * 100) : 0;
  return (
    <div className="moment-progress">
      <dl className="moment-meta">
        <div>
          <dt>Target</dt>
          <dd>{target} a week</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{completed} this week</dd>
        </div>
      </dl>
      <div
        aria-label="Progress toward this week's target"
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
    </div>
  );
}
