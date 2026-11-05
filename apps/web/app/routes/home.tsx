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
    "Holler's talks with the customers who matter most, right when context is richest, and turns those conversations into evidence-backed answers.",
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
  return (
    <SitePage current="home">
      <SiteSection className="site-home-hero">
        <p className="site-kicker">
          Human-led customer research for DTC brands
        </p>
        <h1>
          <span>Conversations that build relationships.</span>
          <em>Insights that build businesses.</em>
        </h1>
        <p className="site-home-hero__lede">
          Holler's researchers uncover the why behind your customers' decisions,
          turning every conversation into actionable insights and a searchable
          library of customer intelligence.
        </p>
        <div className="site-actions">
          <a
            className="site-btn site-btn--primary"
            href="https://calendar.app.google/mrp9eD6VrhFgm7Hz9"
            target="_blank"
            rel="noopener noreferrer"
          >
            Holler at us <span aria-hidden="true">↗</span>
          </a>
          <a className="site-btn site-btn--secondary" href="/sample-report">
            See a sample <span aria-hidden="true">→</span>
          </a>
        </div>

        <div className="site-moment" aria-label="Example research moment">
          <div className="site-moment__card">
            <div className="site-moment__heading">
              <span className="site-moment__dot" aria-hidden="true" />
              <span>Hollering</span>
              <span>05:38 elapsed</span>
            </div>
            <ol>
              <li>
                <time>12:04:14</time>
                <strong>Order placed</strong>
                <span>First order · last click: Google</span>
              </li>
              <li>
                <time>12:04:32</time>
                <strong>Qualified for interview</strong>
                <span>First-time purchaser · research SKU match </span>
              </li>
              <li>
                <time>12:09:52</time>
                <strong>"Walked into your store a couple of weeks ago"</strong>
                <span>Self-reported discovery · brick and mortar</span>
              </li>
            </ol>
          </div>
        </div>
      </SiteSection>

      <SiteSection>
        <figure className="site-feature">
          <p className="site-kicker">Our operating principle</p>
          <blockquote>
            Customers should leave every conversation feeling more connected to
            your brand.
          </blockquote>
          <figcaption>Human-to-human. Always.</figcaption>
        </figure>
      </SiteSection>

      <SiteSection id="what-you-get">
        <div className="site-head">
          <p className="site-kicker">What you get with Holler</p>
          <h2>Answers, from the people who matter most.</h2>
          <p>
            Not another dashboard. Not a transcript dump. Holler gives your team
            an evidence-backed answer to the questions you need answered.
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
