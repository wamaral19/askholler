import {
  SiteCta,
  SiteHero,
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";
import { IndustryIcon } from "../components/industry-icons";
import { industries } from "../components/marketing-industries";
import { PillarGrid } from "../components/marketing-industry-blocks";

export function meta() {
  return marketingMeta(
    "Who Holler Is For | Holler",
    "Holler analyzes your data, automatically qualifies the customers behind the change, and calls them to find out why. For apps, wellness and beauty, apparel, supplements, food and beverage, and ecommerce brands.",
    "/for",
  );
}

export default function WhoItsFor() {
  return (
    <SitePage current="who-its-for">
      <SiteHero
        kicker="Who Holler is for"
        title="Your numbers moved. Know why."
        lede="Holler finds the customers behind the change and asks them."
      />

      <SiteSection aria-label="What Holler does">
        <PillarGrid />
      </SiteSection>

      <SiteSection aria-labelledby="industries">
        <div className="site-head">
          <p className="site-kicker">By industry</p>
          <h2 id="industries">Pick your industry.</h2>
        </div>
        <ul className="site-industry-grid">
          {industries.map((industry) => (
            <li key={industry.slug}>
              <a href={`/for/${industry.slug}`}>
                <span className="site-industry-grid__name">
                  <IndustryIcon slug={industry.slug} />
                  {industry.name}
                </span>
                <h3>{industry.title}</h3>
                <p>{industry.summary}</p>
                <span className="site-industry-grid__link">
                  See sample studies <span aria-hidden="true">→</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </SiteSection>

      <SiteCta
        kicker="Not on the list?"
        title="If the right customers can answer it, Holler can research it."
        href="/contact"
        label={
          <>
            Bring us your question <span aria-hidden="true">→</span>
          </>
        }
      />
    </SitePage>
  );
}
