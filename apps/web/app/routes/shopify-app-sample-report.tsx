import {
  MarketingFooter,
  MarketingHeader,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Sample customer research report | Holler",
    "A clearly labeled, synthetic example of a Holler customer research report.",
  );
}

const findings = [
  {
    title: "Paid social is capturing more demand than it creates",
    detail:
      "Shopify attributed 12 of 25 sampled first purchases to paid social. Only five customers described paid social as where they first discovered the brand.",
    action:
      "Test creator-led discovery creative separately from retargeting and branded conversion campaigns.",
  },
  {
    title:
      "Email is a repeat-purchase reminder, not the original discovery source",
    detail:
      "Eight of 11 repeat buyers said an email reminded them to return; none described email as their original introduction to the brand.",
    action:
      "Keep lifecycle email focused on useful replenishment reminders and measure it separately from acquisition.",
  },
  {
    title: "Customers lead with portability",
    detail:
      "Nine interviewed buyers used convenience or portability language without being prompted, while the current product message leads with durability.",
    action:
      "Run a landing-page and paid-creative test that leads with portability use cases.",
  },
] as const;

export default function ShopifySampleReport() {
  return (
    <main className="holler-preview preview-subpage">
      <MarketingHeader />
      <article className="sample-report">
        <header className="shopify-app__header">
          <p className="eyebrow">Sample data · illustrative only</p>
          <h1>September customer research</h1>
          <p>
            This example shows the structure of a Holler report. Every number,
            customer statement, and product name below is fictional.
          </p>
        </header>

        <section className="shopify-app__card sample-report__summary">
          <div>
            <span>25</span>
            <p>completed interviews</p>
          </div>
          <div>
            <span>2h 14m</span>
            <p>consented recorded research</p>
          </div>
          <div>
            <span>3</span>
            <p>recommended tests</p>
          </div>
        </section>

        <section className="sheet-section">
          <header className="sheet-section__header">
            <div>
              <p className="eyebrow">Executive summary</p>
              <h2>What the fictional sample suggests</h2>
            </div>
          </header>
          <ol className="sample-findings">
            {findings.map((finding, index) => (
              <li className="shopify-app__card" key={finding.title}>
                <span className="sample-findings__number">0{index + 1}</span>
                <div>
                  <h3>{finding.title}</h3>
                  <p>{finding.detail}</p>
                  <p>
                    <strong>Recommended test:</strong> {finding.action}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="shopify-app__card sample-report__method">
          <h2>Method and limitations</h2>
          <p>
            Illustrative cohort: 25 fictional customers who ordered during one
            month. Interview findings describe only that sample. Commerce
            metrics and interview-sample metrics use separate denominators;
            neither is a causal attribution claim.
          </p>
        </section>
      </article>
      <MarketingFooter />
    </main>
  );
}
