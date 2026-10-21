import {
  MarketingFooter,
  MarketingHeader,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "How We Work | Holler",
    "See how Holler turns an important DTC research question into human customer conversations, analysis, and an evidence-backed report.",
  );
}

const steps = [
  {
    title: "Start with the question",
    description:
      "Tell us what your team needs to understand. It might be where Amazon purchasers first learned about your product, why a SKU earns unusually high repeat orders, or what customers remember from a new ad.",
    note: "A focused question keeps the work tied to a decision your team needs to make.",
  },
  {
    title: "Define the customers who can answer it",
    description:
      "Holler uses your commerce data to build a qualified cohort. Purchase history, product, order sequence, geography, and observed attribution can all help us reach the right customers.",
    note: "We forecast the available sample before interviews begin.",
  },
  {
    title: "Talk when context is fresh",
    description:
      "A trained human researcher speaks with qualified customers at a meaningful point in their journey, such as immediately after checkout, around delivery, or after a repeat purchase.",
    note: "The conversation comes first. Researchers listen, follow the customer’s lead, and protect the brand experience.",
  },
  {
    title: "Analyze the patterns",
    description:
      "We review what customers said, measure the size of each theme, compare the cohort with the rest of the sample, and keep observed commerce data separate from self-reported answers.",
    note: "Every finding states the sample, relevant limitations, and supporting evidence.",
  },
  {
    title: "Deliver the answer with the evidence",
    description:
      "Holler packages the findings into a research report with an executive summary, visualized patterns, recommended tests, tagged conversations, and links to authorized recordings and transcripts.",
    note: "Your team gets synthesis it can act on, plus the raw evidence needed to trust it.",
  },
];

export default function HowItWorks() {
  return (
    <main className="holler-preview preview-how-page" id="top">
      <MarketingHeader current="how-it-works" />

      <section className="preview-how-hero">
        <p className="preview-kicker">How We Work</p>
        <h1>From an important question to evidence your team can use.</h1>
        <p>
          Holler combines precise customer cohorts, timely human conversations,
          and careful analysis. The result is a clear answer tied directly to
          what your customers said and what they did.
        </p>
      </section>

      <section
        className="preview-how-steps"
        aria-label="Holler research process"
      >
        <ol>
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="preview-how-number">0{index + 1}</span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.description}</p>
              </div>
              <aside>{step.note}</aside>
            </li>
          ))}
        </ol>
      </section>

      <section className="preview-how-principle">
        <p className="preview-kicker">One principle guides every interview</p>
        <blockquote>
          Every customer walks away from the conversation feeling better about
          the brand than they did going in.
        </blockquote>
        <p>That is why Holler uses humans, not AI interviewers.</p>
      </section>

      <section className="preview-contact" id="contact">
        <p className="preview-kicker">Bring us the question</p>
        <h2>What do you want to understand about your customers?</h2>
        <a href="/contact">
          wyatt@withholler.com <span aria-hidden="true">↗</span>
        </a>
      </section>

      <MarketingFooter />
    </main>
  );
}
