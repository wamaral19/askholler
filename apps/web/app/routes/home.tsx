import { useEffect, useState } from "react";
import { redirect, type LoaderFunctionArgs } from "react-router";
import {
  MarketingFooter,
  MarketingHeader,
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

export default function Home() {
  const [headerScrolled, setHeaderScrolled] = useState(false);

  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 48);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  return (
    <main className="holler-preview" id="top">
      <MarketingHeader scrolled={headerScrolled} />

      <section className="preview-hero">
        <p className="preview-kicker">Human customer research for DTC brands</p>
        <h1>
          <span>
            <span>Hear what your</span> <span>customers think,</span>
          </span>
          <em>right when it matters.</em>
        </h1>
        <p className="preview-hero-lede">
          Holler has humans, not AI, talk with your customers to deliver
          actionable insights from the people who matter most to your brand:
          your customers.
        </p>
        <div className="preview-hero-actions">
          <a className="preview-button preview-button-primary" href="/contact">
            Start a conversation <span aria-hidden="true">↗</span>
          </a>
          <a className="preview-text-link" href="/how-it-works">
            See how we work <span aria-hidden="true">→</span>
          </a>
        </div>

        <div
          className="preview-live-example"
          aria-label="Example research moment"
        >
          <div className="preview-live-heading">
            <span className="preview-live-dot" aria-hidden="true" />
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
      </section>

      <section className="preview-value" id="what-you-get">
        <div className="preview-section-intro">
          <p className="preview-kicker">What you get with Holler</p>
          <h2>Answers, from the people who matter most.</h2>
          <p>
            Not another dashboard. Not a transcript dump. Holler gives your team
            an evidence-backed answer to an important business question.
          </p>
        </div>

        <div className="preview-value-grid">
          {valuePillars.map((pillar) => (
            <article key={pillar.number}>
              <span>{pillar.number}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.description}</p>
            </article>
          ))}
        </div>

        <aside className="preview-human-note">
          <p>Our operating principle</p>
          <blockquote>
            Every customer walks away from the conversation feeling better about
            the brand than they did going in.
          </blockquote>
          <span>Human-to-human. Always.</span>
        </aside>
      </section>

      <section className="preview-methodology">
        <div className="preview-methodology-intro">
          <p className="preview-kicker">Research you can inspect</p>
          <h2>Built to earn trust, not hide behind a dashboard.</h2>
          <p>
            Holler makes the path from customer conversation to business
            recommendation clear. Your team can see who we spoke with, what we
            heard, and how strongly the evidence supports the conclusion.
          </p>
        </div>
        <ol>
          <li>
            <span>01</span>
            <p>Human researchers conduct every customer interview.</p>
          </li>
          <li>
            <span>02</span>
            <p>Customers are selected using relevant commerce behavior.</p>
          </li>
          <li>
            <span>03</span>
            <p>Conversations happen while the decision is still fresh.</p>
          </li>
          <li>
            <span>04</span>
            <p>Every finding states its sample size and limitations.</p>
          </li>
          <li>
            <span>05</span>
            <p>Recommendations link back to the supporting evidence.</p>
          </li>
        </ol>
      </section>

      <section className="preview-contact" id="contact">
        <p className="preview-kicker">Talk with Holler</p>
        <h2>What do you want to understand about your customers?</h2>
        <p>
          Bring us one important question or build an ongoing research rhythm.
          We’ll help shape the right approach without a pricing page.
        </p>
        <a href="/contact">
          wyatt@withholler.com <span aria-hidden="true">↗</span>
        </a>
      </section>

      <MarketingFooter />
    </main>
  );
}
