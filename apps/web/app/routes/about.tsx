import {
  MarketingFooter,
  MarketingHeader,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "About Holler | Human customer research",
    "Holler gives DTC ecommerce brands high-quality first-party customer research without requiring them to build an internal research function.",
  );
}

const principles = [
  {
    title: "Talk at the moment that matters",
    copy: "Customer memory is richest close to the decision. Research should be timed around real actions, not scheduled weeks after them.",
  },
  {
    title: "Use humans for human conversations",
    copy: "AI can support researchers and analysis. It does not replace the empathy, judgment, or brand care required in the interview itself.",
  },
  {
    title: "Show the evidence",
    copy: "A conclusion should be traceable to the cohort, conversation, and supporting evidence. Sample size and limitations should be clear.",
  },
  {
    title: "Deliver decisions, not dashboard theater",
    copy: "The work is valuable when a marketing or product team can use it. Reports prioritize answers, recommendations, and the next useful test.",
  },
];

export default function About() {
  return (
    <main className="holler-preview preview-subpage" id="top">
      <MarketingHeader current="about" />

      <section className="preview-subpage-hero preview-about-hero">
        <p className="preview-kicker">About Holler</p>
        <h1>Customer research should feel human because it is.</h1>
        <p>
          Holler gives DTC ecommerce brands high-quality first-party customer
          research without requiring them to build a research function from
          scratch.
        </p>
      </section>

      <section className="preview-about-thesis">
        <p className="preview-kicker">What we believe</p>
        <blockquote>
          The people behind the order can explain what no attribution model,
          survey box, or conversion chart can see.
        </blockquote>
        <p>
          Holler connects observed commerce behavior with open human
          conversation. That combination helps brands understand not only what
          customers did, but what motivated the decision and what to do next.
        </p>
      </section>

      <section className="preview-about-story">
        <div>
          <p className="preview-kicker">Why Holler exists</p>
          <h2>
            DTC teams have more customer data than ever and too few chances to
            ask why.
          </h2>
        </div>
        <div className="preview-about-story-copy">
          <p>
            Commerce tools are excellent at showing what customers did. The
            missing layer is often a direct, thoughtful conversation with the
            people behind the order. Building that research capability inside
            every brand is slow and expensive, so Holler makes it available as a
            service.
          </p>
          <div>
            <article>
              <p className="preview-kicker">Who conducts the interviews</p>
              <h3>Trained human researchers</h3>
              <p>
                Holler researchers listen, follow useful threads, and protect
                the customer relationship throughout every conversation.
              </p>
            </article>
            <article>
              <p className="preview-kicker">Experience behind the work</p>
              <h3>Thousands of customer conversations</h3>
              <p>
                Our research experience spans thousands of customer
                conversations across software startups, including work that
                informed products and features responsible for millions in
                incremental gross margin.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="preview-principles">
        <div>
          <p className="preview-kicker">Our principles</p>
          <h2>How we approach the work.</h2>
        </div>
        <ol>
          {principles.map((principle, index) => (
            <li key={principle.title}>
              <span>0{index + 1}</span>
              <h3>{principle.title}</h3>
              <p>{principle.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="preview-subpage-cta">
        <p className="preview-kicker">Built for DTC teams</p>
        <h2>Get closer to the people building your brand with you.</h2>
        <a href="/contact">
          Talk with Holler <span aria-hidden="true">→</span>
        </a>
      </section>

      <MarketingFooter />
    </main>
  );
}
