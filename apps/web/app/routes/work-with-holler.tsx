import {
  MarketingFooter,
  MarketingHeader,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Work With Holler | Research Runs and ongoing research",
    "Work with Holler on a focused Research Run or build an ongoing customer research rhythm for your DTC brand.",
  );
}

const sharedDeliverables = [
  "A clearly defined research question and qualified customer cohort",
  "Completed human interviews tied to the relevant commerce context",
  "Analysis that states the sample, cohort differences, and limitations",
  "An executive-ready report with recommended actions and experiments",
  "Tagged conversations and links to authorized supporting evidence",
];

const exampleBars = [
  { label: "Shopify attributed to Google", value: 54, tone: "observed" },
  { label: "Customers who named Google", value: 21, tone: "stated" },
  { label: "Customers who named word of mouth", value: 36, tone: "human" },
];

export default function WorkWithHoller() {
  return (
    <main className="holler-preview preview-subpage" id="top">
      <MarketingHeader current="work-with-holler" />

      <section className="preview-subpage-hero preview-work-hero">
        <p className="preview-kicker">How to work with Holler</p>
        <h1>One urgent question or an ongoing research rhythm.</h1>
        <p>
          Choose a focused Research Run when a decision cannot wait. Work with
          Holler on an ongoing basis when customer questions are a constant part
          of how your team grows.
        </p>
      </section>

      <section className="preview-engagements">
        <article>
          <p className="preview-kicker">Focused engagement</p>
          <h2>Standalone Research Run</h2>
          <p>
            Built around a specific question, hypothesis, launch, or decision.
            We define the right cohort, complete the interviews, analyze the
            evidence, and deliver one clear research report.
          </p>
          <h3>Best when you need to</h3>
          <ul>
            <li>Audit attribution before changing channel spend</li>
            <li>Understand why a campaign or product is outperforming</li>
            <li>
              Investigate repeat purchase, churn, or a new customer segment
            </li>
            <li>Bring customer evidence into an upcoming decision</li>
          </ul>
        </article>

        <article>
          <p className="preview-kicker">Ongoing partnership</p>
          <h2>Recurring customer research</h2>
          <p>
            A continuing research program for teams that always have another
            customer question. Holler learns the brand over time, investigates
            new Research Angles, and compounds what each round teaches us.
          </p>
          <h3>Best when you want to</h3>
          <ul>
            <li>Keep customer understanding current as the brand changes</li>
            <li>Maintain regular coverage across acquisition and retention</li>
            <li>Compare new findings with prior customer conversations</li>
            <li>
              Give marketing and product teams a dependable research function
            </li>
          </ul>
        </article>
      </section>

      <section className="preview-comparison">
        <div>
          <p className="preview-kicker">Choose the right engagement</p>
          <h2>Two ways to put customer evidence to work.</h2>
        </div>
        <div
          className="preview-comparison-table"
          role="table"
          aria-label="Compare Holler engagements"
        >
          <div className="preview-comparison-row is-heading" role="row">
            <span role="columnheader">What to expect</span>
            <span role="columnheader">Research Run</span>
            <span role="columnheader">Ongoing Research</span>
          </div>
          <div className="preview-comparison-row" role="row">
            <strong role="rowheader">Best for</strong>
            <span role="cell">
              One important question or near-term decision
            </span>
            <span role="cell">A steady pipeline of customer questions</span>
          </div>
          <div className="preview-comparison-row" role="row">
            <strong role="rowheader">Research direction</strong>
            <span role="cell">
              One defined Research Angle and customer cohort
            </span>
            <span role="cell">
              New Research Angles shaped as priorities change
            </span>
          </div>
          <div className="preview-comparison-row" role="row">
            <strong role="rowheader">Deliverable</strong>
            <span role="cell">A focused evidence-backed research report</span>
            <span role="cell">Regular findings that compound over time</span>
          </div>
          <div className="preview-comparison-row" role="row">
            <strong role="rowheader">Relationship</strong>
            <span role="cell">A defined project from question to answer</span>
            <span role="cell">An embedded extension of your team</span>
          </div>
        </div>
      </section>

      <section className="preview-onboarding">
        <div>
          <p className="preview-kicker">Getting started</p>
          <h2>From Shopify connection to useful evidence.</h2>
          <p>
            We keep setup focused on the question your team needs to answer.
          </p>
        </div>
        <ol>
          <li>
            <span>01</span>
            <h3>Connect Shopify</h3>
            <p>
              Give Holler permission to use the order and customer context
              needed for the research.
            </p>
          </li>
          <li>
            <span>02</span>
            <h3>Shape the Research Angle</h3>
            <p>
              We define the question, the qualified cohort, and the moment when
              the conversation should happen.
            </p>
          </li>
          <li>
            <span>03</span>
            <h3>Get the evidence</h3>
            <p>
              Human researchers begin conversations, analyze the patterns, and
              deliver a report your team can use.
            </p>
          </li>
        </ol>
      </section>

      <section className="preview-evidence preview-work-evidence">
        <div className="preview-evidence-copy">
          <p className="preview-kicker">The deliverable</p>
          <h2>A point of view, with the receipts.</h2>
          <p>
            Holler combines cohort analysis with what customers actually said.
            Findings state the sample and limitations, distinguish observed data
            from self-reported answers, and link back to the evidence.
          </p>
          <ul>
            <li>Executive summary and key learnings</li>
            <li>Visualized patterns and cohort differences</li>
            <li>Recommended actions and marketing experiments</li>
            <li>
              Tagged conversations, transcripts, and authorized recordings
            </li>
          </ul>
        </div>

        <figure className="preview-finding-card">
          <div className="preview-finding-meta">
            <span>Example finding</span>
            <span>n = 42 interviews</span>
          </div>
          <h3>Google appears to be capturing more demand than it creates.</h3>
          <ul>
            {exampleBars.map((bar) => (
              <li key={bar.label}>
                <div>
                  <span>{bar.label}</span>
                  <strong>{bar.value}%</strong>
                </div>
                <span className="preview-finding-track">
                  <span
                    className={`is-${bar.tone}`}
                    style={{ width: `${bar.value}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <blockquote>
            “I searched the name after my friend sent me the product.”
          </blockquote>
          <figcaption>Illustrative finding. Not a customer claim.</figcaption>
        </figure>
      </section>

      <section className="preview-included">
        <div>
          <p className="preview-kicker">Included either way</p>
          <h2>The same standard of human research and evidence.</h2>
        </div>
        <ol>
          {sharedDeliverables.map((item, index) => (
            <li key={item}>
              <span>0{index + 1}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="preview-subpage-cta">
        <p className="preview-kicker">No pricing page</p>
        <h2>Tell us the question. We’ll recommend the right engagement.</h2>
        <a href="/contact">
          Talk with Holler <span aria-hidden="true">→</span>
        </a>
      </section>

      <MarketingFooter />
    </main>
  );
}
