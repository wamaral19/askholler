import { useEffect, useState } from "react";
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { AppShell } from "../components/app-shell";
import { TwilioCallPanel } from "../components/twilio-call-panel";
import { ordinal } from "../lib/ordinal";
import {
  dateLabel,
  OrderBlock,
  ProfileCell,
  promptGroups,
  PromptRow,
  SheetSection,
  type RowState,
} from "../components/call-sheet";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import {
  sendZapierDialRequest,
  ZapierDialError,
  zapierDialerEnabled,
} from "../lib/zapier-dialer.server";

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
    const workspace = await getOperationsService().getInterview(
      await getTenantContext(request),
      params.interviewId,
    );
    return {
      ...workspace,
      dialer:
        process.env.DIALER_PROVIDER === "twilio"
          ? ("twilio" as const)
          : zapierDialerEnabled()
            ? ("zapier" as const)
            : ("manual" as const),
    };
  });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { interviewId?: string };
}) {
  return executeOperationsRequest(async () => {
    if (!params.interviewId)
      throw new Response("Interview is required", { status: 400 });
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "");
    const service = getOperationsService();
    const context = await getTenantContext(request);
    if (intent === "reveal") {
      const { assignment } = await service.getInterview(
        context,
        params.interviewId,
      );
      const result = await service.revealPhone(context, assignment.id);
      return Response.json(
        { intent, phone: result.phone },
        {
          headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" },
        },
      );
    }
    if (intent === "dial") {
      if (!zapierDialerEnabled())
        throw new Response("Unsupported action", { status: 400 });
      const { assignment } = await service.getInterview(
        context,
        params.interviewId,
      );
      const { phone } = await service.revealPhone(
        context,
        assignment.id,
        "zapier_dial",
      );
      try {
        await sendZapierDialRequest({
          interviewId: params.interviewId,
          researcherId: context.researcherId,
          phone,
          orderNumber: assignment.orderNumber,
          merchant: assignment.merchant,
          moment: assignment.moment,
        });
      } catch (error) {
        if (!(error instanceof ZapierDialError)) throw error;
        return { intent, sent: false, error: error.code };
      }
      return { intent, sent: true };
    }
    if (intent === "response") {
      await service.saveResponse(
        context,
        params.interviewId,
        String(form.get("fieldId")),
        String(form.get("value")),
      );
      return { intent, saved: true };
    }
    if (intent === "progress") {
      await service.savePromptProgress(
        context,
        params.interviewId,
        String(form.get("promptKey") ?? ""),
        {
          covered: form.get("covered") === "true",
          selected: form.getAll("selected").map(String),
          note: String(form.get("note") ?? ""),
        },
      );
      return { intent, saved: true };
    }
    if (intent === "observation") {
      const detail = String(form.get("detail") ?? "");
      // Tags are optional; an untagged note is general call context.
      const kinds = form.getAll("kind").map(String);
      for (const kind of kinds.length ? kinds : ["context"])
        await service.addObservation(context, params.interviewId, kind, detail);
      return { intent, saved: true };
    }
    if (
      intent === "complete" ||
      intent === "no_answer" ||
      intent === "declined"
    ) {
      await service.completeInterview(
        context,
        params.interviewId,
        intent === "complete" ? "completed" : intent,
      );
      return { intent, saved: true };
    }
    throw new Response("Unsupported action", { status: 400 });
  });
}

// Saving a row keeps the page as it is; reloading would decrypt the profile
// (and audit it) on every click.
export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formData?.get("intent") === "progress"
    ? false
    : defaultShouldRevalidate;
}

export function meta() {
  return [{ title: "Call sheet · Holler" }];
}

const observationOptions = [
  ["hesitation", "Hesitation"],
  ["excitement", "Excitement"],
  ["reluctance", "Reluctance"],
  ["confusion", "Confusion"],
  ["strong_conviction", "Strong conviction"],
  ["follow_up_needed", "Follow up"],
] as const;

export default function CallSheetRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { id: interviewId, assignment, profile, status, dialer } = data;
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      data.prompts.map((prompt) => [
        prompt.key,
        {
          covered: prompt.covered,
          selected: prompt.selected,
          note: prompt.note,
        },
      ]),
    ),
  );
  const coveredCount = data.prompts.filter(
    (prompt) => rows[prompt.key]?.covered,
  ).length;
  const requiredOpen = data.prompts.filter(
    (prompt) => prompt.required && !rows[prompt.key]?.covered,
  ).length;

  if (!assignment) return null;
  const hasHistory = data.pastOrders.length > 0;
  // Sections after the history keep consecutive numbers when it is hidden.
  const sectionIndex = (position: number) =>
    String(hasHistory ? position : position - 1).padStart(2, "0");
  const closed =
    status === "completed" || status === "no_answer" || status === "declined";

  return (
    <AppShell
      className="app-shell--console"
      eyebrow={`Call sheet · ${assignment.moment}`}
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
      {closed ? (
        <OutcomePanel status={status} />
      ) : (
        <div className="call-sheet">
          <section className="call-bar" aria-label="Call controls">
            <div className="call-bar__dial">
              <Link
                className="console-button console-button--quiet"
                to="/queue"
              >
                ← Queue
              </Link>
              {dialer === "twilio" ? (
                <TwilioCallPanel interviewId={interviewId} />
              ) : dialer === "zapier" ? (
                <Form className="call-bar__form" method="post">
                  <button
                    className="console-button console-button--go"
                    name="intent"
                    type="submit"
                    value="dial"
                  >
                    {actionData?.intent === "dial" && actionData.sent
                      ? "Ringing · call again"
                      : "Call via Zapier"}
                  </button>
                  {actionData?.intent === "dial" && !actionData.sent ? (
                    <span className="call-bar__error" role="alert">
                      {actionData.error === "ZAPIER_NOT_CONFIGURED"
                        ? "Zapier is not configured. Reveal to dial manually."
                        : "Zapier did not accept the call. Retry or reveal."}
                    </span>
                  ) : null}
                </Form>
              ) : null}
              <Form className="call-bar__form" method="post">
                <span className="call-bar__phone">
                  {actionData && "phone" in actionData
                    ? String(actionData.phone)
                    : assignment.maskedPhone}
                </span>
                <button
                  className="console-button"
                  name="intent"
                  type="submit"
                  value="reveal"
                >
                  Reveal number
                </button>
              </Form>
            </div>
            <div
              className={`call-bar__progress ${requiredOpen ? "is-open" : "is-done"}`}
            >
              <strong>
                {coveredCount}/{data.prompts.length}
              </strong>
              <span>
                {requiredOpen
                  ? `${requiredOpen} required open`
                  : "prompts covered"}
              </span>
            </div>
            <div className="call-bar__outcomes">
              <Form method="post">
                <button
                  className="console-button console-button--go"
                  disabled={requiredOpen > 0}
                  name="intent"
                  title={
                    requiredOpen
                      ? "Mark every required prompt done first"
                      : undefined
                  }
                  type="submit"
                  value="complete"
                >
                  Complete call
                </button>
              </Form>
              <Form method="post">
                <button
                  className="console-button console-button--warn"
                  name="intent"
                  type="submit"
                  value="no_answer"
                >
                  Unanswered
                </button>
              </Form>
              <Form
                method="post"
                onSubmit={(event) => {
                  if (
                    !window.confirm(
                      "Record that this customer asked not to be contacted? They will never be called again.",
                    )
                  )
                    event.preventDefault();
                }}
              >
                <button
                  className="console-button console-button--stop"
                  name="intent"
                  type="submit"
                  value="declined"
                >
                  Do not contact
                </button>
              </Form>
            </div>
          </section>

          <SheetSection index="01" title="Customer">
            <dl className="profile-grid">
              <ProfileCell label="First name" value={profile.firstName} />
              <ProfileCell label="City, state" value={profile.locality} />
              <ProfileCell
                label="Customer since"
                value={dateLabel(profile.customerSince)}
              />
              <ProfileCell
                label="Orders"
                value={`${profile.orderCount}${profile.orderCount ? ` · this is the ${ordinal(assignment.orderSequence || profile.orderCount)}` : ""}`}
              />
              <ProfileCell
                label="Lifetime value"
                value={profile.lifetimeValue}
              />
              <ProfileCell
                label="Shopify customer"
                value={profile.shopifyCustomerId ?? "Guest checkout"}
              />
            </dl>
            {profile.historyComplete ? null : (
              <p className="sheet-note">
                History starts when the store installed Holler; earlier orders
                are not shown.
              </p>
            )}
          </SheetSection>

          {/* A first order has no history to show, so the section is left out. */}
          {hasHistory ? (
            <SheetSection
              index="02"
              title="Order history"
              meta={`${data.pastOrders.length} earlier order${data.pastOrders.length === 1 ? "" : "s"}`}
            >
              {data.pastOrders.map((order, index) => (
                <OrderBlock
                  key={order.id}
                  order={order}
                  tone={index % 2 ? "even" : "odd"}
                />
              ))}
            </SheetSection>
          ) : null}

          <SheetSection
            index={sectionIndex(3)}
            title={
              !hasHistory && profile.historyComplete
                ? "This order · first order"
                : "This order"
            }
          >
            {data.currentOrder ? (
              <OrderBlock order={data.currentOrder} tone="current" />
            ) : (
              <p className="sheet-empty">Order details unavailable.</p>
            )}
          </SheetSection>

          <SheetSection
            className="sheet-section--research"
            index={sectionIndex(4)}
            title="Research prompts"
            meta="Mark each prompt done as you cover it. Details can come from the recording."
          >
            {promptGroups(data.prompts, data.currentOrder).map((group) => {
              const done = group.prompts.filter(
                (prompt) => rows[prompt.key]?.covered,
              ).length;
              return (
                <div
                  className={`prompt-group prompt-group--${group.scope}`}
                  key={group.key}
                >
                  <header className="prompt-group__header">
                    <span className="prompt-group__kind">{group.kind}</span>
                    <h3>{group.title}</h3>
                    <span
                      className={`prompt-group__count${done === group.prompts.length ? " is-done" : ""}`}
                    >
                      {done}/{group.prompts.length}
                    </span>
                  </header>
                  <div className="sheet-prompts">
                    {group.prompts.map((prompt) => (
                      <PromptRow
                        category={group.kind}
                        key={prompt.key}
                        onChange={(next) =>
                          setRows((current) => ({
                            ...current,
                            [prompt.key]: next,
                          }))
                        }
                        prompt={prompt}
                        state={rows[prompt.key]!}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </SheetSection>

          <SheetSection index={sectionIndex(5)} title="Researcher notes">
            <ObservationForm />
          </SheetSection>
        </div>
      )}
    </AppShell>
  );
}

function ObservationForm() {
  const fetcher = useFetcher<{ saved?: boolean }>();
  const [kinds, setKinds] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState("");
  const saved = fetcher.state === "idle" && fetcher.data?.saved === true;

  // Clear only after the save succeeds, so a failed save keeps the text.
  useEffect(() => {
    if (!saved) return;
    setKinds(new Set());
    setDetail("");
  }, [saved, fetcher.data]);

  return (
    <fetcher.Form className="observation-form" method="post">
      <input name="intent" type="hidden" value="observation" />
      <div className="observation-chips">
        {observationOptions.map(([id, label]) => (
          <label
            className={`option-chip${kinds.has(id) ? " is-on" : ""}`}
            key={id}
          >
            <input
              checked={kinds.has(id)}
              name="kind"
              onChange={() =>
                setKinds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              type="checkbox"
              value={id}
            />
            {label}
          </label>
        ))}
      </div>
      <textarea
        name="detail"
        onChange={(event) => setDetail(event.target.value)}
        placeholder="What you heard or noticed that the recording won't show"
        rows={3}
        value={detail}
      />
      <button
        className="console-button"
        disabled={!detail.trim() || fetcher.state !== "idle"}
        type="submit"
      >
        {fetcher.state !== "idle" ? "Saving…" : "Save note"}
      </button>
      {saved && !detail ? (
        <span className="observation-form__saved" role="status">
          Note saved
        </span>
      ) : null}
    </fetcher.Form>
  );
}

function OutcomePanel({
  status,
}: {
  status: "completed" | "no_answer" | "declined";
}) {
  return (
    <section className={`outcome-panel outcome-panel--${status}`}>
      <p className="eyebrow">
        {status === "completed"
          ? "Call completed"
          : status === "no_answer"
            ? "Marked unanswered"
            : "Marked do not contact"}
      </p>
      <h2>
        {status === "completed"
          ? "Saved for evidence review"
          : status === "no_answer"
            ? "The customer did not answer"
            : "This customer will not be called again"}
      </h2>
      <p>
        {status === "completed"
          ? "Prompt notes and tags are saved with the interview."
          : status === "no_answer"
            ? "The call is recorded as unanswered and this order leaves the queue."
            : "Any other open orders for this customer were removed from the queue."}
      </p>
      <Link className="console-button console-button--go" to="/queue">
        Return to queue
      </Link>
    </section>
  );
}
