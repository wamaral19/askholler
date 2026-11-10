import {
  SiteCta,
  SiteHero,
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Ad Content | Holler",
    "Holler records real customer conversations and turns the strongest consented moments into living testimonials for paid social.",
  );
}

const format = [
  {
    title: "Start with the right customer",
    copy: "Holler uses purchase history, product, timing, and behavior to find customers with a real story to tell.",
    note: "Context makes the question better.",
  },
  {
    title: "Have a conversation, not an audition",
    copy: "A human researcher knows the context but follows the customer’s lead. There is no testimonial script to perform.",
    note: "Natural delivery beats a rehearsed answer.",
  },
  {
    title: "Find the moment that makes it real",
    copy: "The detail, reaction, or phrase that would disappear in a text review becomes the center of the creative.",
    note: "The story becomes the hook.",
  },
  {
    title: "Shape it for paid social",
    copy: "With the customer’s explicit permission, the strongest moments are edited into vertical content for Meta, TikTok, and YouTube.",
    note: "Commercial use requires explicit permission.",
  },
] as const;

export default function AdContent() {
  return (
    <SitePage current="what-we-produce">
      <SiteHero
        kicker="Ad content from real customer conversations"
        title="A testimonial people can hear, feel, and believe."
        lede="Text reviews make claims. Holler creates living testimonials: real customers, speaking in their own voice, naturally explaining what made your product worth buying."
        actions={
          <a
            className="site-btn site-btn--primary"
            href="https://calendar.app.google/mrp9eD6VrhFgm7Hz9"
            target="_blank"
            rel="noopener noreferrer"
          >
            Book time with us <span aria-hidden="true">↗</span>
          </a>
        }
      />

      <SiteSection className="site-split site-split--center">
        <div>
          <p className="site-kicker">Stop the scroll with something real</p>
          <h2>Your customer is more credible than your copy.</h2>
        </div>
        <div className="site-split__body">
          <p>
            Audiences recognize the rhythms of an ad: the polished hook, the
            memorized talking points, the endorsement that lands a little too
            cleanly. Holler captures a different kind of proof.
          </p>
          <p>
            A researcher creates the space for a customer to remember, react,
            and explain. Their voice, specificity, and natural delivery make the
            value of your product tangible in a way a quotation card cannot.
          </p>
        </div>
      </SiteSection>

      <SiteSection aria-label="The living testimonial format">
        <div className="site-head">
          <p className="site-kicker">The living testimonial format</p>
          <h2>From a timely call to performance-ready creative.</h2>
          <p>
            Each clip starts with a real customer, useful purchase context, and
            a researcher who knows how to uncover the story without scripting
            the answer.
          </p>
        </div>
        <ol className="site-steps">
          {format.map((step, index) => (
            <li key={step.title}>
              <span className="site-number">0{index + 1}</span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.copy}</p>
              </div>
              <aside className="site-tile">{step.note}</aside>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteSection>
        <div className="site-head">
          <p className="site-kicker">Built to perform and build affinity</p>
          <h2>The ad is useful. The conversation matters too.</h2>
        </div>
        <ol className="site-columns site-columns--3">
          <li>
            <span className="site-number">01</span>
            <h3>Authenticity you can hear</h3>
            <p>
              Real cadence, real detail, and real emotion make the customer’s
              experience believable.
            </p>
          </li>
          <li>
            <span className="site-number">02</span>
            <h3>A repeatable source of creative</h3>
            <p>
              Reach different customer cohorts and purchase moments to uncover
              distinct stories and hooks.
            </p>
          </li>
          <li>
            <span className="site-number">03</span>
            <h3>A better brand interaction</h3>
            <p>
              Customers are heard by a person who is curious about their
              experience, not pushed through a content shoot.
            </p>
          </li>
        </ol>
      </SiteSection>

      <SiteCta
        kicker="Talk with us"
        title="Turn real customer conversations into ad creative people trust."
        body="Tell us what you want to learn and the creative you need. We’ll find the right customers and start the conversations."
        href="https://calendar.app.google/mrp9eD6VrhFgm7Hz9"
        label={
          <>
            Talk with us <span aria-hidden="true">↗</span>
          </>
        }
      />
    </SitePage>
  );
}
