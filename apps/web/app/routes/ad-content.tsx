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
    "Real customer conversations, edited into vertical testimonials for paid social.",
  );
}

const bookingHref = "https://calendar.app.google/mrp9eD6VrhFgm7Hz9";

const steps = [
  {
    title: "Pick the right customers",
    copy: "Purchase history and timing point us to people with a real story.",
  },
  {
    title: "Have a real conversation",
    copy: "A researcher follows the customer’s lead. No script.",
  },
  {
    title: "Cut it for paid social",
    copy: "With explicit permission, the best moments become vertical clips for Meta, TikTok, and YouTube.",
  },
] as const;

export default function AdContent() {
  return (
    <SitePage current="what-we-produce">
      <SiteHero
        kicker="Ad content"
        title="Real customers, in their own words, ready for paid social."
        lede="Unscripted testimonials cut from real customer conversations."
        actions={
          <a
            className="site-btn site-btn--primary"
            href={bookingHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Book time with us <span aria-hidden="true">↗</span>
          </a>
        }
      />

      <SiteSection aria-label="How it works">
        <ol className="site-columns site-columns--3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="site-number">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteCta
        kicker="Talk with us"
        title="Get ad creative people trust."
        href={bookingHref}
        label={
          <>
            Book time with us <span aria-hidden="true">↗</span>
          </>
        }
      />
    </SitePage>
  );
}
