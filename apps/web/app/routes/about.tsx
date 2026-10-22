import {
  MarketingFooter,
  MarketingHeader,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "About Holler | Human customer research",
    "Holler brings human customer research to DTC brands and finds the why behind customer actions.",
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
        <h1>
          Your customers are human.
          <br />
          Your research should be human too.
        </h1>
        <p>
          Holler talks to your customers and gets the why behind the action, all
          while making customers even bigger fans of your brand.
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
            There are a million tools that tell you what happened. The numbers
            do not tell you why, and you cannot always trust the numbers. We
            build your research capability to get you the answers you need.
          </p>
          <article>
            <p className="preview-kicker">Who conducts the interviews</p>
            <h3>Trained human researchers</h3>
            <p>
              Holler&apos;s team has conducted thousands of interviews, yielding
              insights leading to millions in incremental gross margin.
            </p>
          </article>
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
        <h2>Chat with the team that wants to chat with your customers.</h2>
        <a href="/contact">
          Chat with Holler <span aria-hidden="true">→</span>
        </a>
      </section>

      <MarketingFooter />
    </main>
  );
}
