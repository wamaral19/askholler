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
    "Holler turns customer conversations into actionable insights and a searchable, tagged research library for DTC brands.",
  );
}

export default function Research() {
  return (
    <SitePage current="what-we-produce">
      <SiteHero
        kicker="Customer research from every conversation"
        title="The content works now. The customer understanding compounds."
        lede="Holler turns the conversations behind your creative into evidence-backed insights and a searchable record of what customers think, feel, remember, and need."
        actions={
          <>
            <a className="site-btn site-btn--primary" href="/sample-report">
              See a sample report <span aria-hidden="true">→</span>
            </a>
            <a className="site-btn site-btn--secondary" href="/use-cases">
              Explore research questions
            </a>
          </>
        }
      />

      <SiteSection>
        <div className="site-head">
          <p className="site-kicker">Actionable insights</p>
          <h2>Understand why the customer bought—not only that they bought.</h2>
          <p>
            Calls reveal the motivations, objections, language, competitive
            context, and product experiences that dashboards cannot capture.
            Holler identifies the patterns and ties every finding back to the
            conversations behind it.
          </p>
        </div>
        <ol className="site-columns site-columns--3">
          <li>
            <span className="site-number">01</span>
            <h3>Better positioning</h3>
            <p>
              Hear the words customers naturally use for the problem, the
              product, and the payoff.
            </p>
          </li>
          <li>
            <span className="site-number">02</span>
            <h3>Smarter marketing decisions</h3>
            <p>
              Compare what platforms observed with how customers remember
              discovering and choosing the brand.
            </p>
          </li>
          <li>
            <span className="site-number">03</span>
            <h3>Clear next actions</h3>
            <p>
              Translate recurring themes into campaign, product, and
              customer-experience experiments.
            </p>
          </li>
        </ol>
      </SiteSection>

      <SiteSection id="library" className="site-split site-split--center">
        <div>
          <p className="site-kicker">The research library</p>
          <h2>Every conversation makes the next question easier to answer.</h2>
        </div>
        <div className="site-split__body">
          <p>
            Conversations are transcribed, tagged, and organized around the
            customer and commerce context that made them useful. Search across
            products, cohorts, purchase moments, themes, and customer language.
          </p>
          <p>
            Instead of beginning every campaign with a blank page, your team can
            return to a growing database of customer evidence and find the
            voices behind the pattern.
          </p>
        </div>
      </SiteSection>

      <SiteSection>
        <figure className="site-feature">
          <p className="site-kicker">The relationship between the two</p>
          <blockquote>
            Ad content gives you an immediate asset. Research makes every asset,
            campaign, and customer decision after it more informed.
          </blockquote>
          <figcaption>
            One conversation. Two distinct forms of value.
          </figcaption>
        </figure>
      </SiteSection>

      <SiteCta
        kicker="Bring us the question"
        title="What do you want to understand about your customers?"
        href="/contact"
        label={
          <>
            Talk with Holler <span aria-hidden="true">→</span>
          </>
        }
      />
    </SitePage>
  );
}
