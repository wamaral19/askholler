import {
  SiteCta,
  SiteHero,
  SitePage,
  SiteSection,
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
    <SitePage current="about">
      <SiteHero
        kicker="About Holler"
        title={
          <>
            Your customers are human.
            <br />
            Your research should be human too.
          </>
        }
        lede="Holler talks to your customers and gets the why behind the action, all while making customers even bigger fans of your brand."
      />

      <SiteSection className="site-split">
        <div>
          <p className="site-kicker">Why Holler exists</p>
          <h2>
            DTC teams have more customer data than ever and too few chances to
            ask why.
          </h2>
        </div>
        <div className="site-split__body">
          <p>
            There are a million tools that tell you what happened. The numbers
            do not tell you why, and you cannot always trust the numbers. We
            build your research capability to get you the answers you need.
          </p>
          <article className="site-tile site-tile--padded">
            <p className="site-kicker">Who conducts the interviews</p>
            <h3>Trained human researchers</h3>
            <p>
              Holler&apos;s team has conducted thousands of interviews, yielding
              insights leading to millions in incremental gross margin.
            </p>
          </article>
        </div>
      </SiteSection>

      <SiteSection>
        <div className="site-head">
          <p className="site-kicker">Our principles</p>
          <h2>How we approach the work.</h2>
        </div>
        <ol className="site-columns site-columns--4">
          {principles.map((principle, index) => (
            <li key={principle.title}>
              <span className="site-number">0{index + 1}</span>
              <h3>{principle.title}</h3>
              <p>{principle.copy}</p>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteCta
        kicker="Built for DTC teams"
        title="Chat with the team that wants to chat with your customers."
        href="/contact"
        label={
          <>
            Chat with Holler <span aria-hidden="true">→</span>
          </>
        }
      />
    </SitePage>
  );
}
