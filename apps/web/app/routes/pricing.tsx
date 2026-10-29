import {
  SiteHero,
  SitePage,
  SiteSection,
  marketingContactHref,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Pricing | Holler",
    "Monthly customer research subscriptions and standalone Research Runs for DTC ecommerce brands.",
  );
}

const plans = [
  {
    kicker: "Ongoing research",
    name: "Monthly subscription",
    price: "$1,000",
    period: "/ month",
    summary:
      "Continuous customer learning for teams with evolving marketing, attribution, positioning, and product questions.",
    includes: [
      "25 completed interviews each month",
      "Up to two hours of consented recorded research",
      "Monthly evidence-backed report",
      "Quarterly long-form synthesis",
    ],
    cta: "Discuss a subscription",
    featured: true,
  },
  {
    kicker: "Focused engagement",
    name: "Standalone Research Run",
    price: "$3,500",
    period: undefined,
    summary:
      "A one-time investigation built around a specific Research Angle, customer segment, or business decision.",
    includes: [
      "At least 50 completed interviews",
      "At least three hours of consented recorded research",
      "One focused Research Angle report",
      "Larger samples receive custom volume pricing",
    ],
    cta: "Scope a Research Run",
    featured: false,
  },
];

const shared = [
  "Human-led customer interviews",
  "Executive summary and evidence-backed findings",
  "Tagged conversations and authorized transcripts or recordings",
  "Recommended actions and marketing experiments",
] as const;

export default function Pricing() {
  return (
    <SitePage current="pricing">
      <SiteHero
        kicker="Pricing"
        title="Customer research sized to the question."
        lede="Start with ongoing coverage or commission a focused Research Run. Final scope and timing depend on order volume and the customer cohort you want to investigate."
      />

      <SiteSection aria-label="Plans">
        <div className="site-plans">
          {plans.map((plan) => (
            <article
              className={`site-plan${plan.featured ? " is-featured" : ""}`}
              key={plan.name}
            >
              <div className="site-plan__tile">
                <p className="site-kicker">{plan.kicker}</p>
                <h2>{plan.name}</h2>
                <p className="site-plan__price">
                  <span>From</span> <strong>{plan.price}</strong>
                  {plan.period ? <span> {plan.period}</span> : null}
                </p>
              </div>
              <a
                className="site-btn site-btn--primary site-btn--block"
                href={marketingContactHref}
              >
                {plan.cta}
              </a>
              <p className="site-plan__summary">{plan.summary}</p>
              <ul className="site-list">
                {plan.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="site-plans__shared">
          <p className="site-list-label">Included in both plans</p>
          <ul className="site-list site-list--grid">
            {shared.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </SiteSection>

      <SiteSection className="site-split">
        <h2>How billing works</h2>
        <p>
          Shopify merchants review and approve every charge through Shopify.
          Nothing is charged when the app is installed, and recurring plans can
          be cancelled from Holler’s Billing page. Prices above are starting
          prices; any custom scope and charge are shown before approval.
        </p>
      </SiteSection>
    </SitePage>
  );
}
