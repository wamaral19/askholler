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
import type { CallSheetOrder, CallSheetPrompt } from "../lib/operations-types";
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

type RowState = Pick<CallSheetPrompt, "covered" | "selected" | "note">;

const observationOptions = [
  ["hesitation", "Hesitation"],
  ["excitement", "Excitement"],
  ["reluctance", "Reluctance"],
  ["confusion", "Confusion"],
  ["strong_conviction", "Strong conviction"],
  ["follow_up_needed", "Follow up"],
] as const;

const statusLabel = (value: string | null) =>
  value ? value.replaceAll("_", " ") : "—";

const dateLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

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

interface PromptGroup {
  readonly key: string;
  readonly scope: CallSheetPrompt["scope"];
  readonly kind: string;
  readonly title: string;
  readonly prompts: readonly CallSheetPrompt[];
}

/** Order questions, then one group per item, then marketing. */
function promptGroups(
  prompts: readonly CallSheetPrompt[],
  currentOrder: CallSheetOrder | null,
): PromptGroup[] {
  const lines = currentOrder?.lines ?? [];
  const itemPrompts = prompts.filter((prompt) => prompt.scope === "item");
  const itemGroups: PromptGroup[] = [
    ...lines.map((line) => ({
      key: `item:${line.id}`,
      scope: "item" as const,
      kind: "Item",
      title: [line.product, line.variant].filter(Boolean).join(" · "),
      prompts: itemPrompts.filter((prompt) => prompt.lineId === line.id),
    })),
    {
      key: "item:any",
      scope: "item" as const,
      kind: "Items",
      title: "About the items",
      prompts: itemPrompts.filter(
        (prompt) =>
          prompt.lineId === null ||
          !lines.some((line) => line.id === prompt.lineId),
      ),
    },
  ];
  return [
    {
      key: "order",
      scope: "order" as const,
      kind: "Order",
      title: "About this order",
      prompts: prompts.filter((prompt) => prompt.scope === "order"),
    },
    ...itemGroups,
    {
      key: "marketing",
      scope: "marketing" as const,
      kind: "Marketing",
      title: "How they found and chose the brand",
      prompts: prompts.filter((prompt) => prompt.scope === "marketing"),
    },
  ].filter((group) => group.prompts.length > 0);
}

function SheetSection({
  index,
  title,
  meta,
  className,
  children,
}: {
  index: string;
  title: string;
  meta?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={className ? `sheet-section ${className}` : "sheet-section"}
    >
      <header className="sheet-section__header">
        <span className="sheet-section__index">{index}</span>
        <h2>{title}</h2>
        {meta ? <span className="sheet-section__meta">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

function ProfileCell({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="profile-cell">
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

function OrderBlock({
  order,
  tone,
}: {
  order: CallSheetOrder;
  tone: "odd" | "even" | "current";
}) {
  return (
    <article className={`order-block order-block--${tone}`}>
      <header className="order-block__header">
        <strong>
          {tone === "current" ? "Current · " : ""}
          {order.orderNumber ?? "Order"}
        </strong>
        <span>{dateLabel(order.orderedAt)}</span>
        <span>{order.total}</span>
        {order.discountTotal ? (
          <span>−{order.discountTotal} discount</span>
        ) : null}
        <span className="order-block__status">
          {statusLabel(order.financialStatus)}
        </span>
        <span className="order-block__status">
          {order.fulfillmentStatus
            ? statusLabel(order.fulfillmentStatus)
            : "unfulfilled"}
        </span>
        <span className="order-block__source">
          <span className="order-block__source-label">Attribution source</span>
          <strong>{order.attribution}</strong>
        </span>
      </header>
      <div className="order-lines" role="table">
        <div className="order-line order-line--head" role="row">
          <span role="columnheader">Product</span>
          <span role="columnheader">Category</span>
          <span role="columnheader">Size</span>
          <span role="columnheader">Qty</span>
          <span role="columnheader">Price</span>
          <span role="columnheader">Discount</span>
          <span role="columnheader">Total</span>
          <span role="columnheader">Return</span>
        </div>
        {order.lines.map((line) => (
          <div className="order-line" key={line.id} role="row">
            <span role="cell" className="order-line__product">
              {line.product}
            </span>
            <span role="cell">{line.categories.join(", ") || "—"}</span>
            <span role="cell">{line.variant ?? "—"}</span>
            <span role="cell">{line.quantity}</span>
            <span role="cell">{line.unitPrice}</span>
            <span role="cell">{line.discount ? `−${line.discount}` : "—"}</span>
            <span role="cell">{line.lineTotal}</span>
            <span role="cell">
              <span className={`return-pill return-pill--${line.returnStatus}`}>
                {line.returnStatus === "kept"
                  ? "Kept"
                  : line.returnStatus === "returned"
                    ? "Returned"
                    : `${line.refundedQuantity} of ${line.quantity} returned`}
              </span>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function PromptRow({
  prompt,
  state,
  category,
  onChange,
}: {
  prompt: CallSheetPrompt;
  state: RowState;
  category: string;
  onChange: (next: RowState) => void;
}) {
  const fetcher = useFetcher();
  const failed =
    fetcher.state === "idle" &&
    fetcher.data !== undefined &&
    !(fetcher.data as { saved?: boolean }).saved;

  function save(next: RowState) {
    onChange(next);
    const form = new FormData();
    form.set("intent", "progress");
    form.set("promptKey", prompt.key);
    form.set("covered", String(next.covered));
    form.set("note", next.note);
    for (const option of next.selected) form.append("selected", option);
    fetcher.submit(form, { method: "post" });
  }

  return (
    <article
      className={`sheet-prompt ${state.covered ? "is-covered" : "is-open"}`}
      data-saving={fetcher.state !== "idle" || undefined}
    >
      <header className="sheet-prompt__head">
        <span className="sheet-prompt__label">
          {category} · {prompt.title}
          {prompt.required ? " · required" : ""}
        </span>
        <button
          aria-pressed={state.covered}
          className="sheet-prompt__done"
          onClick={() => save({ ...state, covered: !state.covered })}
          type="button"
        >
          <span aria-hidden="true" className="sheet-prompt__box">
            {state.covered ? "✓" : ""}
          </span>
          {state.covered ? "Done" : "Complete"}
        </button>
      </header>
      <p className="sheet-prompt__text">{prompt.prompt}</p>
      {prompt.options.length ? (
        <div className="sheet-prompt__options">
          {prompt.options.map((option) => {
            const on = state.selected.includes(option);
            return (
              <button
                aria-pressed={on}
                className={`option-chip${on ? " is-on" : ""}`}
                key={option}
                onClick={() =>
                  save({
                    ...state,
                    selected: on
                      ? state.selected.filter((item) => item !== option)
                      : [...state.selected, option],
                  })
                }
                type="button"
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : null}
      <textarea
        aria-label={`Notes for ${prompt.title}`}
        className="sheet-prompt__note"
        defaultValue={state.note}
        onBlur={(event) => {
          if (event.currentTarget.value.trim() !== state.note)
            save({ ...state, note: event.currentTarget.value.trim() });
        }}
        placeholder="Notes"
        rows={1}
      />
      {failed ? (
        <span className="sheet-prompt__error" role="alert">
          Not saved — try again
        </span>
      ) : null}
    </article>
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
