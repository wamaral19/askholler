import {
  MarketingFooter,
  MarketingHeader,
  marketingContactHref,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Pricing | Holler",
    "Monthly customer research subscriptions and standalone Research Runs for DTC ecommerce brands.",
  );
}

const shared = [
  "Human-led customer interviews",
  "Executive summary and evidence-backed findings",
  "Tagged conversations and authorized transcripts or recordings",
  "Recommended actions and marketing experiments",
] as const;

export default function Pricing() {
  return (
    <main className="holler-preview preview-subpage preview-pricing-page">
      <MarketingHeader current="pricing" />

      <section className="preview-subpage-hero pricing-hero">
        <p className="preview-kicker">Pricing</p>
        <h1>Customer research sized to the question.</h1>
        <p>
          Start with ongoing coverage or commission a focused Research Run.
          Final scope and timing depend on order volume and the customer cohort
          you want to investigate.
        </p>
      </section>

      <section aria-label="Plans" className="pricing-grid">
        <article className="pricing-card is-featured">
          <p className="preview-kicker">Ongoing research</p>
          <h2>Monthly subscription</h2>
          <p className="pricing-card__price">
            <span>From</span> $1,000 <small>/ month</small>
          </p>
          <p>
            Continuous customer learning for teams with evolving marketing,
            attribution, positioning, and product questions.
          </p>
          <ul>
            <li>25 completed interviews each month</li>
            <li>Up to two hours of consented recorded research</li>
            <li>Monthly evidence-backed report</li>
            <li>Quarterly long-form synthesis</li>
            {shared.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <a className="button button-primary" href={marketingContactHref}>
            Discuss a subscription
          </a>
        </article>

        <article className="pricing-card">
          <p className="preview-kicker">Focused engagement</p>
          <h2>Standalone Research Run</h2>
          <p className="pricing-card__price">
            <span>From</span> $3,500
          </p>
          <p>
            A one-time investigation built around a specific Research Angle,
            customer segment, or business decision.
          </p>
          <ul>
            <li>At least 50 completed interviews</li>
            <li>At least three hours of consented recorded research</li>
            <li>One focused Research Angle report</li>
            <li>Larger samples receive custom volume pricing</li>
            {shared.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <a className="button" href={marketingContactHref}>
            Scope a Research Run
          </a>
        </article>
      </section>

      <section className="pricing-note">
        <h2>How billing works</h2>
        <p>
          Shopify merchants review and approve every charge through Shopify.
          Nothing is charged when the app is installed, and recurring plans can
          be cancelled from Holler’s Billing page. Prices above are starting
          prices; any custom scope and charge are shown before approval.
        </p>
      </section>

      <MarketingFooter />
    </main>
  );
}
