import {
  chargeKindLabels,
  chargeStatusLabels,
  type MerchantCharge,
} from "../lib/merchant-charges";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** The engagements Holler sells, shown on both merchant billing pages. */
export function PlanGrid() {
  return (
    <section aria-label="Available engagements" className="merchant-plan-grid">
      <article className="shopify-app__card">
        <p className="eyebrow">Monthly subscription</p>
        <h2>From $2,500 / month</h2>
        <p>
          25 completed interviews, up to two hours of consented recorded
          research, a monthly report, and a quarterly long-form synthesis.
        </p>
      </article>
      <article className="shopify-app__card">
        <p className="eyebrow">Standalone Research Run</p>
        <h2>From $5,000</h2>
        <p>
          At least 50 completed interviews, at least three hours of consented
          recorded research, and one evidence-backed report.
        </p>
      </article>
    </section>
  );
}

export function ChargeSummary({
  charge,
}: {
  charge: MerchantCharge & { amount: string };
}) {
  return (
    <div>
      <h3>{charge.description}</h3>
      <p className="merchant-run__meta">
        {chargeKindLabels[charge.kind]} · <strong>{charge.amount}</strong> ·{" "}
        {chargeStatusLabels[charge.status]}
        {charge.decidedAt
          ? ` ${dateFormat.format(new Date(charge.decidedAt))}`
          : ` · added ${dateFormat.format(new Date(charge.createdAt))}`}
      </p>
    </div>
  );
}
