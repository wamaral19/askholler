import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";

import { AppShell, PrototypeBanner } from "../components/app-shell";
import {
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";

export async function loader({ request }: { request: Request }) {
  return {
    assignments: await getOperationsService().listQueue(
      getTenantContext(request),
    ),
  };
}

export async function action({ request }: { request: Request }) {
  const form = await request.formData();
  const assignmentId = String(form.get("assignmentId") ?? "");
  const intent = String(form.get("intent") ?? "");
  if (!assignmentId)
    throw new Response("Assignment is required", { status: 400 });
  const service = getOperationsService();
  const context = getTenantContext(request);
  if (intent === "claim")
    return {
      intent,
      assignmentId,
      assignment: await service.claimAssignment(context, assignmentId),
    };
  if (intent === "release")
    return {
      intent,
      assignmentId,
      assignment: await service.releaseAssignment(context, assignmentId),
    };
  if (intent === "start") {
    const interview = await service.startInterview(context, assignmentId);
    return redirect(`/interviews/${interview.id}`);
  }
  if (intent === "reveal") {
    const result = await service.revealPhone(context, assignmentId);
    return Response.json(
      { intent, assignmentId, phone: result.phone },
      { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } },
    );
  }
  throw new Response("Unsupported action", { status: 400 });
}

export function meta() {
  return [{ title: "Research Queue · Holler" }];
}

export default function ResearchQueueRoute() {
  const { assignments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell
      eyebrow="Research operations"
      title="Live researcher queue"
      description="Fresh qualified opportunities, ordered by priority and time since the commerce event."
      actions={
        <div className="queue-clock">
          <span className="status-dot" />
          Queue refresh: simulated
        </div>
      }
    >
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
        <label className="search-control">
          <span className="sr-only">Filter assignments</span>
          <input placeholder="Filter merchant or moment" type="search" />
        </label>
      </section>

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
                      #{assignment.orderSequence} · {assignment.orderTotal}
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
