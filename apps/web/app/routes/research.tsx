import {
  SiteCta,
  SiteHero,
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Customer Research | Holler",
    "Customer research directed by your questions, with every conversation tagged and queryable.",
  );
}

export default function Research() {
  return (
    <SitePage current="what-we-produce">
      <SiteHero
        centered
        kicker="Customer research"
        title="Your questions, answered by your customers."
        lede="You tell us what you need to know. We talk to the right customers and deliver a report you can query."
        actions={
          <>
            <a className="site-btn site-btn--primary" href="/sample-report">
              See a sample report <span aria-hidden="true">→</span>
            </a>
            <a className="site-btn site-btn--secondary" href="/contact">
              Talk with Holler
            </a>
          </>
        }
      />

      <SiteSection>
        <ol className="site-columns site-columns--2">
          <li>
            <span className="site-number">01</span>
            <h3>Directed by you</h3>
            <p>
              You set the questions. Every call and every finding is built to
              answer them.
            </p>
          </li>
          <li>
            <span className="site-number">02</span>
            <h3>Fully queryable</h3>
            <p>
              Every conversation is tagged by product, cohort, purchase moment,
              and theme. Filter to any slice and hear the customers behind it.
            </p>
          </li>
        </ol>
      </SiteSection>

      <SiteCta
        kicker="See it first"
        title="Explore a finished Holler report."
        href="/sample-report"
        label={
          <>
            See a sample report <span aria-hidden="true">→</span>
          </>
        }
      />
    </SitePage>
  );
}
