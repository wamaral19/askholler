import { useEffect, useState } from "react";
import { redirect, type LoaderFunctionArgs } from "react-router";

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.searchParams.has("shop") || url.searchParams.has("host")) {
    return redirect(`/app${url.search}`);
  }
  return null;
}

export function meta() {
  return [
    { title: "Holler — Hear what your customers think" },
    {
      name: "description",
      content:
        "Holler has human, 1:1 conversations with your customers at exactly the moments you want to hear from them.",
    },
  ];
}

const contactHref = "mailto:wyatt@withholler.com?subject=Holler%20inquiry";

// Illustrative only; all names and quotes are synthetic.
const moment = [
  { time: "12:04:48", label: "Order placed", detail: "First order · $86" },
  {
    time: "12:05:31",
    label: "Holler researcher calls",
    detail: "On behalf of your brand",
  },
  {
    time: "12:09:52",
    label: "“I talked with a friend then searched Google.”",
    detail: "Discovery: word of mouth · Shopify: Google Ads",
  },
];

const steps = [
  {
    title: "Pick the moments",
    description:
      "Choose the events you care about, like a first order, a repeat purchase, or a delivery, and the customers you want to hear from.",
  },
  {
    title: "A real person calls",
    description:
      "A trained Holler researcher reaches out within minutes, on behalf of your brand, using a script you approve.",
  },
  {
    title: "Get the evidence",
    description:
      "Conversations are recorded, transcribed, and tagged, so every finding links back to what customers actually said.",
  },
];

const useCases = [
  {
    number: "01",
    title: "Attribution Audit",
    description: "First-party research to audit your attribution.",
    points: ["Verify ad-spend incrementality by attributed channel."],
  },
  {
    number: "02",
    title: "Product Feedback",
    description: "Learn why customers chose you over the alternatives.",
    points: [
      "Understand which product benefits and tradeoffs made the difference.",
    ],
  },
  {
    number: "03",
    title: "Customer Segmentation",
    description:
      "Understand what makes first-time purchasers buy versus repeat customers.",
    points: [
      "See whether new-category buyers are buying the brand or the product.",
      "Find growth opportunities in what customers want but cannot get.",
    ],
  },
];

const deliverables = [
  {
    name: "Earshot",
    cadence: "Weekly",
    description:
      "Every reviewed conversation as a filterable, spreadsheet-ready dataset, with transcripts and recordings a click away.",
  },
  {
    name: "Disco",
    cadence: "Monthly",
    description:
      "A decision document: what changed, why it changed, what customers said, and what your team should test next.",
  },
];

const exampleBars = [
  { label: "Shopify attributed to Meta", value: 47, tone: "observed" },
  { label: "Customers who named Meta", value: 19, tone: "stated" },
  { label: "Customers who named a creator", value: 31, tone: "stated" },
];

export default function Home() {
  const [headerScrolled, setHeaderScrolled] = useState(false);

  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 12);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  return (
    <main className="simple-landing" id="top">
      <header
        className={`simple-header${headerScrolled ? " is-scrolled" : ""}`}
      >
        <div className="simple-header-inner">
          <a className="simple-brand" href="#top" aria-label="Holler home">
            <img src="/brand/holler-wordmark-primary.png" alt="Holler" />
          </a>

          <nav className="simple-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#use-cases">Use cases</a>
            <a href="#deliverables">What you get</a>
          </nav>

          <a className="simple-header-cta" href={contactHref}>
            Talk to us
          </a>
        </div>
      </header>

      <section className="simple-hero">
        <p className="simple-eyebrow">Customer research for Shopify brands</p>
        <h1>
          <span>Hear what your customers think,</span>
          <span>right when it matters.</span>
        </h1>
        <p className="simple-hero-lede">
          Holler has human, 1:1 conversations with your customers at exactly the
          moments you want to hear from them.
        </p>
        <div className="simple-hero-actions">
          <a className="simple-button" href={contactHref}>
            Talk to us
          </a>
          <a className="simple-button simple-button-quiet" href="#how-it-works">
            See how it works
          </a>
        </div>

        <ol className="simple-moment" aria-label="Example research moment">
          {moment.map((step) => (
            <li key={step.time}>
              <span className="simple-moment-time">{step.time}</span>
              <strong>{step.label}</strong>
              <span className="simple-moment-detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="simple-steps" id="how-it-works">
        <div className="simple-section-heading">
          <p>How it works</p>
          <h2>Research that starts the moment your customer acts.</h2>
        </div>
        <ol className="simple-step-grid">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="simple-step-number">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="simple-use-cases" id="use-cases">
        <div className="simple-section-heading">
          <p>Use cases</p>
          <h2>Hear the why behind the action.</h2>
        </div>
        <div className="simple-use-case-grid">
          {useCases.map((useCase) => (
            <article
              className="simple-use-case"
              id={useCase.title.toLowerCase().replaceAll(" ", "-")}
              key={useCase.title}
            >
              <span className="simple-use-case-number">{useCase.number}</span>
              <h3>{useCase.title}</h3>
              <p>{useCase.description}</p>
              <ul>
                {useCase.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="simple-deliverables" id="deliverables">
        <div className="simple-deliverables-copy">
          <div className="simple-section-heading">
            <p>What you get</p>
            <h2>Findings you can act on, with the receipts.</h2>
          </div>
          <dl className="simple-deliverable-list">
            {deliverables.map((deliverable) => (
              <div key={deliverable.name}>
                <dt>
                  {deliverable.name}
                  <span>{deliverable.cadence}</span>
                </dt>
                <dd>{deliverable.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <figure className="simple-finding">
          <p className="simple-finding-label">Example finding</p>
          <h3>Meta appears over-attributed for first purchases.</h3>
          <ul>
            {exampleBars.map((bar) => (
              <li key={bar.label}>
                <span className="simple-finding-row">
                  <span>{bar.label}</span>
                  <span>{bar.value}%</span>
                </span>
                <span className="simple-finding-track">
                  <span
                    className={`simple-finding-bar is-${bar.tone}`}
                    style={{ width: `${bar.value}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <blockquote>
            “I saw her use it on a trip and ordered it that night.”
          </blockquote>
          <figcaption>
            Illustrative. Every Disco states its cohort, sample size, and
            caveats.
          </figcaption>
        </figure>
      </section>

      <section className="simple-contact" id="contact">
        <img src="/brand/holler-logo-primary.png" alt="" aria-hidden="true" />
        <h2>Want to hear what your customers are thinking?</h2>
        <p>
          Plans are shaped around your research moments and interview volume.
        </p>
        <a href={contactHref}>
          wyatt@withholler.com <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className="simple-footer">
        <span>© {new Date().getFullYear()} Holler</span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
