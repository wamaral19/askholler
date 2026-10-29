import { redirect, type LoaderFunctionArgs } from "react-router";
import {
  SiteCta,
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.searchParams.has("shop") || url.searchParams.has("host")) {
    return redirect(`/app${url.search}`);
  }
  return null;
}

export function meta() {
  return marketingMeta(
    "Holler | Human customer research for DTC brands",
    "Holler talks with the customers who matter most, right when context is richest, and turns those conversations into evidence-backed answers.",
  );
}

const valuePillars = [
  {
    number: "01",
    title: "Answers to the questions that matter",
    description:
      "Bring us the question your dashboard cannot answer. We turn customer conversations into a clear point of view your team can use.",
  },
  {
    number: "02",
    title: "The right customers, not a generic panel",
    description:
      "Holler speaks with qualified people from your own customer base: a precise cohort shaped by purchase history, product, source, or behavior.",
  },
  {
    number: "03",
    title: "Research that builds brand equity",
    description:
      "Every interview is human. Our researchers’ first job is to leave the customer feeling better about your brand. Gathering information comes second.",
  },
];

const methodology = [
  "Human researchers conduct every customer interview.",
  "Customers are selected using relevant commerce behavior.",
  "Conversations happen while the decision is still fresh.",
  "Every finding states its sample size and limitations.",
  "Recommendations link back to the supporting evidence.",
];

export default function Home() {
  return (
    <SitePage current="home">
      <SiteSection className="site-home-hero">
        <p className="site-kicker">Human customer research for DTC brands</p>
        <h1>
          <span>Hear what your customers think,</span>
          <em>right when it matters.</em>
        </h1>
        <p className="site-home-hero__lede">
          Holler has humans, not AI, talk with your customers to deliver
          actionable insights from the people who matter most to your brand:
          your customers.
        </p>
        <div className="site-actions">
          <a className="site-btn site-btn--primary" href="/contact">
            Start a conversation <span aria-hidden="true">↗</span>
          </a>
          <a className="site-btn site-btn--secondary" href="/how-it-works">
            See how we work <span aria-hidden="true">→</span>
          </a>
        </div>

        <div className="site-moment" aria-label="Example research moment">
          <div className="site-moment__card">
            <div className="site-moment__heading">
              <span className="site-moment__dot" aria-hidden="true" />
              <span>One research moment</span>
              <span>05:38 elapsed</span>
            </div>
            <ol>
              <li>
                <time>12:04:14</time>
                <strong>Order placed</strong>
                <span>First order · attributed to Google</span>
              </li>
              <li>
                <time>12:04:32</time>
                <strong>Qualified for interview</strong>
                <span>First-time purchaser · research angle matched</span>
              </li>
              <li>
                <time>12:09:52</time>
                <strong>“A friend sent me the product.”</strong>
                <span>Self-reported discovery · word of mouth</span>
              </li>
            </ol>
          </div>
        </div>
      </SiteSection>

      <SiteSection id="what-you-get">
        <div className="site-head">
          <p className="site-kicker">What you get with Holler</p>
          <h2>Answers, from the people who matter most.</h2>
          <p>
            Not another dashboard. Not a transcript dump. Holler gives your team
            an evidence-backed answer to an important business question.
          </p>
        </div>
        <ol className="site-columns site-columns--3">
          {valuePillars.map((pillar) => (
            <li key={pillar.number}>
              <span className="site-number">{pillar.number}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.description}</p>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteSection>
        <figure className="site-feature">
          <p className="site-kicker">Our operating principle</p>
          <blockquote>
            Every customer walks away from the conversation feeling better about
            the brand than they did going in.
          </blockquote>
          <figcaption>Human-to-human. Always.</figcaption>
        </figure>
      </SiteSection>

      <SiteSection className="site-split">
        <div>
          <p className="site-kicker">Research you can inspect</p>
          <h2>Built to earn trust, not hide behind a dashboard.</h2>
          <p className="site-split__lede">
            Holler makes the path from customer conversation to business
            recommendation clear. Your team can see who we spoke with, what we
            heard, and how strongly the evidence supports the conclusion.
          </p>
        </div>
        <ol className="site-numbered">
          {methodology.map((item, index) => (
            <li key={item}>
              <span className="site-number">0{index + 1}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteCta
        kicker="Talk with Holler"
        title="What do you want to understand about your customers?"
        body="Bring us one important question or build an ongoing research rhythm. We’ll help shape the right approach without a pricing page."
        href="/contact"
        label={
          <>
            wyatt@withholler.com <span aria-hidden="true">↗</span>
          </>
        }
      />
    </SitePage>
  );
}
