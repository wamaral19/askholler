import { useFetcher } from "react-router";

import type { CallSheetOrder, CallSheetPrompt } from "../lib/operations-types";

/** Shared by the live call sheet and the completed-call review. */
export type RowState = Pick<CallSheetPrompt, "covered" | "selected" | "note">;

const statusLabel = (value: string | null) =>
  value ? value.replaceAll("_", " ") : "—";

export const dateLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export interface PromptGroup {
  readonly key: string;
  readonly scope: CallSheetPrompt["scope"];
  readonly kind: string;
  readonly title: string;
  readonly prompts: readonly CallSheetPrompt[];
}

/** Order questions, then one group per item, then marketing. */
export function promptGroups(
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

export function SheetSection({
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

export function ProfileCell({
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

export function OrderBlock({
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

export function PromptRow({
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
