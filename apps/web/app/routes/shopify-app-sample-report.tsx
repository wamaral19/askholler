import { SitePage, marketingMeta } from "../components/marketing-shell";

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
    signals: ["12 of 25 Shopify-attributed", "5 of 25 customer-stated"],
  },
  {
    title:
      "Email is a repeat-purchase reminder, not the original discovery source",
    detail:
      "Eight of 11 repeat buyers said an email reminded them to return; none described email as their original introduction to the brand.",
    action:
      "Keep lifecycle email focused on useful replenishment reminders and measure it separately from acquisition.",
    signals: ["8 of 11 prompted a return", "0 cited original discovery"],
  },
  {
    title: "Customers lead with portability",
    detail:
      "Nine interviewed buyers used convenience or portability language without being prompted, while the current product message leads with durability.",
    action:
      "Run a landing-page and paid-creative test that leads with portability use cases.",
    signals: ["9 unprompted mentions", "Message leads with durability"],
  },
] as const;

export default function ShopifySampleReport() {
  return (
    <SitePage>
      {/* The report keeps its own editorial styles from styles.css. */}
      <div className="holler-preview sample-report-page">
        <article className="sample-report">
          <header className="sample-report__hero">
            <div className="sample-report__meta">
              <p className="preview-kicker">Holler research report</p>
              <span>September · Sample 01</span>
            </div>
            <h1>September customer research</h1>
            <div className="sample-report__intro">
              <p>
                A concise view of what customers said, how it compares with
                observed commerce data, and what the team should test next.
              </p>
              <p className="sample-report__disclaimer">
                <strong>Illustrative sample</strong>
                Every number, customer statement, and product name below is
                fictional.
              </p>
            </div>
          </header>

          <section
            className="sample-report__summary"
            aria-label="Research at a glance"
          >
            <div>
              <small>01</small>
              <span>25</span>
              <p>completed interviews</p>
            </div>
            <div>
              <small>02</small>
              <span>2h 14m</span>
              <p>consented recorded research</p>
            </div>
            <div>
              <small>03</small>
              <span>3</span>
              <p>recommended tests</p>
            </div>
          </section>

          <section className="sample-report__findings">
            <header className="sample-report__section-heading">
              <p className="preview-kicker">Executive summary</p>
              <div>
                <h2>What the sample suggests</h2>
                <p>
                  Three patterns worth acting on, each tied to the evidence that
                  supports it.
                </p>
              </div>
            </header>
            <ol className="sample-findings">
              {findings.map((finding, index) => (
                <li key={finding.title}>
                  <span className="sample-findings__number">0{index + 1}</span>
                  <div className="sample-findings__content">
                    <h3>{finding.title}</h3>
                    <p className="sample-findings__detail">{finding.detail}</p>
                    <ul
                      className="sample-findings__signals"
                      aria-label="Evidence"
                    >
                      {finding.signals.map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="sample-findings__action">
                    <span>Recommended test</span>
                    <p>{finding.action}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="sample-report__method">
            <p className="preview-kicker">Read the evidence carefully</p>
            <div>
              <h2>Method and limitations</h2>
              <p>
                Illustrative cohort: 25 fictional customers who ordered during
                one month. Interview findings describe only that sample.
                Commerce metrics and interview-sample metrics use separate
                denominators; neither is a causal attribution claim.
              </p>
            </div>
          </section>
        </article>
      </div>
    </SitePage>
  );
}
