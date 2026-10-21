import { useState } from "react";
import {
  MarketingFooter,
  MarketingHeader,
  marketingContactHref,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Contact Holler",
    "Email Holler to discuss a customer research question for your DTC ecommerce brand.",
  );
}

export default function Contact() {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText("wyatt@withholler.com");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="holler-preview preview-contact-page" id="top">
      <MarketingHeader />

      <section className="preview-contact-hero">
        <p className="preview-kicker">Contact Holler</p>
        <h1>Start with the question you cannot answer today.</h1>
        <p>
          Tell us a little about your brand, the decision in front of you, and
          which customers you want to understand. We’ll reply directly.
        </p>
        <div className="preview-contact-actions">
          <a href={marketingContactHref}>
            wyatt@withholler.com <span aria-hidden="true">↗</span>
          </a>
          <button type="button" onClick={copyEmail}>
            {copied ? "Copied" : "Copy email"}
          </button>
          <span className="preview-copy-status" aria-live="polite">
            {copied ? "Email address copied" : ""}
          </span>
        </div>
      </section>

      <aside className="preview-contact-prompt">
        <p>Helpful context to include</p>
        <ul>
          <li>The question or hypothesis you want to investigate</li>
          <li>The customer group you think can answer it</li>
          <li>Any decision or timeline connected to the research</li>
        </ul>
      </aside>

      <MarketingFooter />
    </main>
  );
}
