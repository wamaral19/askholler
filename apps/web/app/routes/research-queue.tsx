import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useSubmit,
} from "react-router";

import { AppShell, PrototypeBanner } from "../components/app-shell";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { ordinal } from "../lib/cohort-description";
import { momentStatusLabels } from "../lib/moment-status";

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const service = getOperationsService();
    const [assignments, moments] = await Promise.all([
      service.listQueue(context),
      service.listMoments(context),
    ]);
    // Only running or paused moments can have work waiting in the queue.
    const momentOptions = moments
      .filter(
        (moment) => moment.status === "live" || moment.status === "paused",
      )
      .map(({ id, name, status }) => ({ id, name, status }));
    const requested = new URL(request.url).searchParams.get("moment");
    const selectedMomentId = momentOptions.some(
      (moment) => moment.id === requested,
    )
      ? requested
      : null;
    return {
      assignments: selectedMomentId
        ? assignments.filter(
            (assignment) => assignment.momentId === selectedMomentId,
          )
        : assignments,
      momentOptions,
      selectedMomentId,
      liveCount: momentOptions.filter((moment) => moment.status === "live")
        .length,
    };
  });
}

export async function action({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const form = await request.formData();
    const assignmentId = String(form.get("assignmentId") ?? "");
    const intent = String(form.get("intent") ?? "");
    if (!assignmentId)
      throw new Response("Assignment is required", { status: 400 });
    const service = getOperationsService();
    const context = await getTenantContext(request);
    if (intent === "claim")
      return {
        intent,
        assignmentId,
        assignment: await service.claimAssignment(
          context,
          assignmentId,
          Number(form.get("lockVersion")),
        ),
      };
    if (intent === "release")
      return {
        intent,
        assignmentId,
        assignment: await service.releaseAssignment(
          context,
          assignmentId,
          Number(form.get("lockVersion")),
        ),
      };
    if (intent === "start") {
      const interview = await service.startInterview(
        context,
        assignmentId,
        Number(form.get("lockVersion")),
      );
      return redirect(`/interviews/${interview.id}`);
    }
    if (intent === "reveal") {
      const result = await service.revealPhone(context, assignmentId);
      return Response.json(
        { intent, assignmentId, phone: result.phone },
        {
          headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" },
        },
      );
    }
    throw new Response("Unsupported action", { status: 400 });
  });
}

export function meta() {
  return [{ title: "Order queue · Holler" }];
}

export default function ResearchQueueRoute() {
  const { assignments, momentOptions, selectedMomentId, liveCount } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  return (
    <AppShell
      eyebrow="Research operations"
      title="Order queue"
      description="Fresh orders from live moments, ordered by priority and time since the order. Paused and completed moments send nothing new."
      actions={
        <div className="queue-clock">
          <span className="status-dot" />
          Queue refresh: simulated
        </div>
      }
    >
      {momentOptions.length > 1 ? (
        <Form
          aria-label="Filter by moment"
          className="queue-moment-filter"
          method="get"
        >
          <label>
            <span>Moment</span>
            <select
              defaultValue={selectedMomentId ?? ""}
              key={selectedMomentId ?? "all"}
              name="moment"
              onChange={(event) => submit(event.currentTarget.form)}
            >
              <option value="">All moments</option>
              {momentOptions.map((moment) => (
                <option key={moment.id} value={moment.id}>
                  {moment.name}
                  {moment.status === "paused"
                    ? ` (${momentStatusLabels.paused.toLowerCase()})`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <noscript>
            <button className="button button-small" type="submit">
              Apply
            </button>
          </noscript>
        </Form>
      ) : null}

      {liveCount === 0 ? (
        <p className="inline-notice" role="status">
          No moments are live, so no new orders are coming in. Resume or launch
          a moment in Angle setup to start calling again.
        </p>
      ) : null}

      <PrototypeBanner>
        Manual-dial workflow. Every claim, reveal, and explicit start goes
        through the application service.
      </PrototypeBanner>

      <section className="queue-toolbar" aria-label="Queue controls">
        <div className="filter-set">
          <button className="filter active" type="button">
            Ready <span>{assignments.length}</span>
          </button>
          <button className="filter" type="button">
            Claimed
          </button>
          <button className="filter" type="button">
            Follow-up
          </button>
        </div>
      </section>

      {assignments.length === 0 ? (
        <p className="helper-copy">No orders are waiting right now.</p>
      ) : null}

      <section className="queue-list" aria-label="Research assignments">
        {assignments.map((assignment) => {
          const isClaimed = assignment.claimedByResearcherId !== undefined;
          const revealedPhone =
            actionData &&
            "phone" in actionData &&
            actionData.assignmentId === assignment.id
              ? String(actionData.phone)
              : undefined;
          return (
            <article
              className={`assignment-card priority-${assignment.priority}`}
              key={assignment.id}
            >
              <div className="assignment-age">
                <strong>{assignment.eventAgeMinutes}m</strong>
                <span>since order</span>
              </div>
              <div className="assignment-main">
                <div className="card-title-row">
                  <span className={`priority-label ${assignment.priority}`}>
                    {assignment.priority}
                  </span>
                  <span className="subtle">{assignment.merchant}</span>
                </div>
                <h2>{assignment.customerName}</h2>
                <p className="assignment-moment">{assignment.moment}</p>
                <dl className="assignment-facts">
                  <div>
                    <dt>Order</dt>
                    <dd>
                      {assignment.orderNumber ?? "Not captured"} ·{" "}
                      {assignment.orderTotal}
                      {assignment.orderSequence > 0
                        ? ` · ${ordinal(assignment.orderSequence)} order`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Products</dt>
                    <dd>{assignment.products.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Observed attribution</dt>
                    <dd>{assignment.observedAttribution}</dd>
                  </div>
                </dl>
                <div className="phone-row">
                  <span>Phone</span>
                  <strong>{revealedPhone ?? assignment.maskedPhone}</strong>
                  <Form method="post">
                    <input
                      name="assignmentId"
                      type="hidden"
                      value={assignment.id}
                    />
                    <input
                      name="lockVersion"
                      type="hidden"
                      value={assignment.lockVersion}
                    />
                    <button
                      className="text-button"
                      disabled={!isClaimed || Boolean(revealedPhone)}
                      name="intent"
                      type="submit"
                      value="reveal"
                    >
                      {revealedPhone
                        ? "Revealed"
                        : isClaimed
                          ? "Reveal for manual dial"
                          : "Claim to reveal"}
                    </button>
                  </Form>
                </div>
              </div>
              <div className="assignment-actions">
                <span className={`state-label state-${assignment.status}`}>
                  {assignment.status.replaceAll("_", " ")}
                </span>
                {assignment.status === "queued" ? (
                  <Form method="post">
                    <input
                      name="assignmentId"
                      type="hidden"
                      value={assignment.id}
                    />
                    <input
                      name="lockVersion"
                      type="hidden"
                      value={assignment.lockVersion}
                    />
                    <button
                      className="button button-primary"
                      name="intent"
                      type="submit"
                      value="claim"
                    >
                      Claim assignment
                    </button>
                  </Form>
                ) : assignment.status === "claimed" ? (
                  <Form method="post">
                    <input
                      name="assignmentId"
                      type="hidden"
                      value={assignment.id}
                    />
                    <input
                      name="lockVersion"
                      type="hidden"
                      value={assignment.lockVersion}
                    />
                    <button
                      className="button button-primary"
                      name="intent"
                      type="submit"
                      value="start"
                    >
                      Start call
                    </button>
                  </Form>
                ) : (
                  <Link
                    className="button button-primary"
                    to={`/interviews/${assignment.id}`}
                  >
                    Open interview
                  </Link>
                )}
                {isClaimed && assignment.status === "claimed" ? (
                  <Form method="post">
                    <input
                      name="assignmentId"
                      type="hidden"
                      value={assignment.id}
                    />
                    <input
                      name="lockVersion"
                      type="hidden"
                      value={assignment.lockVersion}
                    />
                    <button
                      className="button button-quiet"
                      name="intent"
                      type="submit"
                      value="release"
                    >
                      Release
                    </button>
                  </Form>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
