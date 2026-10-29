import {
  SiteCta,
  SiteHero,
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";
import { useCases } from "../components/marketing-content";

export function meta() {
  return marketingMeta(
    "DTC Research Use Cases | Holler",
    "See how DTC ecommerce teams use Holler to understand attribution, creative resonance, retention, customer segments, and product experience.",
  );
}

export default function UseCases() {
  return (
    <SitePage current="use-cases">
      <SiteHero
        kicker="Use cases for DTC ecommerce"
        title="Answer the question behind the metric."
        lede="Your commerce stack shows what happened. Holler talks with the exact customers behind the pattern so your team can understand why it happened and decide what to do next."
      />

      <SiteSection className="site-tabs-section">
        <nav className="site-tabs" aria-label="Use case categories">
          <p className="site-kicker">Explore the questions</p>
          {[useCases.slice(0, 3), useCases.slice(3)].map((row) => (
            <div key={row[0]?.slug}>
              {row.map((useCase) => (
                <a href={`#${useCase.slug}`} key={useCase.slug}>
                  <span>{useCase.number}</span>
                  {useCase.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </SiteSection>

      <SiteSection>
        <div className="site-rows">
          {useCases.map((useCase) => (
            <article id={useCase.slug} key={useCase.slug}>
              <div className="site-rows__label">
                <span className="site-number">{useCase.number}</span>
                <p>{useCase.label}</p>
              </div>
              <div className="site-rows__copy">
                <h2>{useCase.question}</h2>
                <p>{useCase.description}</p>
              </div>
              <ul className="site-tile site-list">
                {useCase.examples.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </SiteSection>

      <SiteCta
        kicker="Have a different question?"
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
