import {
  SiteHero,
  SitePage,
  marketingContactHref,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Contact Holler",
    "Get in touch with Holler founder Wyatt Amaral.",
  );
}

export default function Contact() {
  return (
    <SitePage current="contact" className="site-contact-page">
      <SiteHero
        kicker="Contact Holler"
        title="Want to get in touch?"
        lede="Reach out directly to our founder, Wyatt."
        actions={
          <>
            <a
              className="site-btn site-btn--primary"
              href="https://calendar.app.google/mrp9eD6VrhFgm7Hz9"
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a meeting <span aria-hidden="true">↗</span>
            </a>
            <a
              className="site-btn site-btn--secondary"
              href={marketingContactHref}
            >
              Send an email <span aria-hidden="true">↗</span>
            </a>
          </>
        }
      />
    </SitePage>
  );
}
