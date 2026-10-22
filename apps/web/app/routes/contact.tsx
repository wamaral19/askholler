import {
  MarketingFooter,
  MarketingHeader,
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
    <main className="holler-preview preview-contact-page" id="top">
      <MarketingHeader />

      <section className="preview-contact-hero">
        <p className="preview-kicker">Contact Holler</p>
        <h1>Want to get in touch?</h1>
        <p>Reach out directly to our founder, Wyatt.</p>
        <a className="preview-contact-email" href={marketingContactHref}>
          wyatt@withholler.com <span aria-hidden="true">↗</span>
        </a>
      </section>

      <MarketingFooter />
    </main>
  );
}
