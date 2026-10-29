import {
  SiteCta,
  SiteHero,
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Work With Holler | Research Runs and ongoing research",
    "Work with Holler on a focused Research Run or build an ongoing customer research rhythm for your DTC brand.",
  );
}

const engagements = [
  {
    kicker: "Focused engagement",
    title: "Standalone Research Run",
    copy: "Built around a specific question, hypothesis, launch, or decision. We define the right cohort, complete the interviews, analyze the evidence, and deliver one clear research report.",
    bestWhen: "Best when you need to",
    items: [
      "Audit attribution before changing channel spend",
      "Understand why a campaign or product is outperforming",
      "Investigate repeat purchase, churn, or a new customer segment",
      "Bring customer evidence into an upcoming decision",
    ],
  },
  {
    kicker: "Ongoing partnership",
    title: "Recurring customer research",
    copy: "A continuing research program for teams that always have another customer question. Holler learns the brand over time, investigates new Research Angles, and compounds what each round teaches us.",
    bestWhen: "Best when you want to",
    items: [
      "Keep customer understanding current as the brand changes",
      "Maintain regular coverage across acquisition and retention",
      "Compare new findings with prior customer conversations",
      "Give marketing and product teams a dependable research function",
    ],
  },
];

const comparison = [
  {
    label: "Best for",
    run: "One important question or near-term decision",
    ongoing: "A steady pipeline of customer questions",
  },
  {
    label: "Research direction",
    run: "One defined Research Angle and customer cohort",
    ongoing: "New Research Angles shaped as priorities change",
  },
  {
    label: "Deliverable",
    run: "A focused evidence-backed research report",
    ongoing: "Regular findings that compound over time",
  },
  {
    label: "Relationship",
    run: "A defined project from question to answer",
    ongoing: "An embedded extension of your team",
  },
];

const onboarding = [
  {
    title: "Connect Shopify",
    copy: "Give Holler permission to use the order and customer context needed for the research.",
  },
  {
    title: "Shape the Research Angle",
    copy: "We define the question, the qualified cohort, and the moment when the conversation should happen.",
  },
  {
    title: "Get the evidence",
    copy: "Human researchers begin conversations, analyze the patterns, and deliver a report your team can use.",
  },
];

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
    <SitePage current="work-with-holler">
      <SiteHero
        kicker="How to work with Holler"
        title="One urgent question or an ongoing research rhythm."
        lede="Choose a focused Research Run when a decision cannot wait. Work with Holler on an ongoing basis when customer questions are a constant part of how your team grows."
      />

      <SiteSection aria-label="Engagements">
        <div className="site-plans">
          {engagements.map((engagement) => (
            <article className="site-plan" key={engagement.title}>
              <div className="site-plan__tile">
                <p className="site-kicker">{engagement.kicker}</p>
                <h2>{engagement.title}</h2>
              </div>
              <p className="site-plan__summary">{engagement.copy}</p>
              <h3 className="site-list-label">{engagement.bestWhen}</h3>
              <ul className="site-list">
                {engagement.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </SiteSection>

      <SiteSection>
        <div className="site-head">
          <p className="site-kicker">Choose the right engagement</p>
          <h2>Two ways to put customer evidence to work.</h2>
        </div>
        <div className="site-table-wrap">
          <table className="site-table">
            <caption className="site-visually-hidden">
              Compare Holler engagements
            </caption>
            <thead>
              <tr>
                <th scope="col">What to expect</th>
                <th scope="col">Research Run</th>
                <th scope="col">Ongoing Research</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.run}</td>
                  <td>{row.ongoing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SiteSection>

      <SiteSection>
        <div className="site-head">
          <p className="site-kicker">Getting started</p>
          <h2>From Shopify connection to useful evidence.</h2>
          <p>
            We keep setup focused on the question your team needs to answer.
          </p>
        </div>
        <ol className="site-columns site-columns--3">
          {onboarding.map((step, index) => (
            <li key={step.title}>
              <span className="site-number">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteSection className="site-split site-split--center">
        <div className="site-split__body">
          <p className="site-kicker">The deliverable</p>
          <h2>A point of view, with the receipts.</h2>
          <p>
            Holler combines cohort analysis with what customers actually said.
            Findings state the sample and limitations, distinguish observed data
            from self-reported answers, and link back to the evidence.
          </p>
          <ul className="site-list">
            <li>Executive summary and key learnings</li>
            <li>Visualized patterns and cohort differences</li>
            <li>Recommended actions and marketing experiments</li>
            <li>
              Tagged conversations, transcripts, and authorized recordings
            </li>
          </ul>
        </div>

        <figure className="site-finding">
          <div className="site-finding__meta">
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
                <span className="site-finding__track">
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
      </SiteSection>

      <SiteSection>
        <div className="site-head">
          <p className="site-kicker">Included either way</p>
          <h2>The same standard of human research and evidence.</h2>
        </div>
        <ol className="site-columns site-columns--5">
          {sharedDeliverables.map((item, index) => (
            <li key={item}>
              <span className="site-number">0{index + 1}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteCta
        kicker="Choose an engagement"
        title="Start recurring research or investigate one focused question."
        href="/pricing"
        label={
          <>
            See pricing <span aria-hidden="true">→</span>
          </>
        }
      />
    </SitePage>
  );
}
