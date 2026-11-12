import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { redirect, type LoaderFunctionArgs } from "react-router";
import {
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.searchParams.has("shop") || url.searchParams.has("host")) {
    return redirect(`/app${url.search}`);
  }
  return null;
}

export function meta() {
  return marketingMeta(
    "Holler | Living customer testimonials and customer research",
    "Holler turns timely conversations with real customers into authentic ad content, actionable insights, and a searchable research library.",
  );
}

const outputs = [
  {
    number: "01",
    kicker: "Value now",
    title: "Ad content from real customer interactions",
    description:
      "We talk with real customers, who deliver real, unprompted testimonials. The best moments create authentic ad content that hits harder than text based testimonials or paid UGC.",
    href: "/ad-content",
    link: "Explore ad content",
  },
  {
    number: "02",
    kicker: "Better decisions",
    title: "Insights your team can act on",
    description:
      "We distill a large sample of conversations into actionable reports.",
    href: "/research",
    link: "Explore customer research",
  },
  {
    number: "03",
    kicker: "Value that compounds",
    title: "A searchable library of customer truth",
    description:
      "Every conversation is transcribed and tagged, building queryable research database of qualitative insights from real individuals interacting with your brand.",
    href: "/research#library",
    link: "See how the library grows",
  },
] as const;

// Rotating word in the timeline heading. "action" holds longer, then each
// specific moment flashes by before the wheel returns to the top.
const actionWords = [
  "action",
  "download",
  "cart abandonment",
  "purchase",
  "delivery",
  "milestone",
  "churn",
] as const;
const FIRST_WORD_MS = 2000;
const OTHER_WORD_MS = 1000;
const ROLL_MS = 300;

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function ActionWheel() {
  // The first word is repeated at the end so the last roll lands on it
  // seamlessly before snapping back to index 0 without a transition.
  const items = [...actionWords, actionWords[0]];
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [widths, setWidths] = useState<number[] | null>(null);
  const itemRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useIsomorphicLayoutEffect(() => {
    const measure = () =>
      setWidths(itemRefs.current.map((el) => el?.offsetWidth ?? 0));
    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (index === items.length - 1) {
      // Landed on the duplicate "action": snap back to the real first item.
      const timer = window.setTimeout(() => {
        setAnimate(false);
        setIndex(0);
      }, ROLL_MS);
      return () => window.clearTimeout(timer);
    }
    const delay = index === 0 ? FIRST_WORD_MS : OTHER_WORD_MS;
    const timer = window.setTimeout(() => {
      setAnimate(true);
      setIndex((current) => current + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [index, items.length]);

  return (
    <span
      className="site-action-wheel"
      style={{
        width: widths ? `${widths[index]}px` : undefined,
        transition: animate ? undefined : "none",
      }}
    >
      <span
        className="site-action-wheel__track"
        style={{
          transform: `translateY(-${index * 1.18}em)`,
          transition: animate ? undefined : "none",
        }}
      >
        {items.map((word, i) => (
          <span
            key={`${word}-${i}`}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
          >
            {word}
          </span>
        ))}
      </span>
    </span>
  );
}

export default function Home() {
  return (
    <SitePage current="home">
      <SiteSection className="site-home-hero">
        <p className="site-kicker">
          Customer conversations for consumer brands
        </p>
        <h1>
          <span>Get the answers.</span>
          <span>Capture your next great ad.</span>
          <em>Holler at your customers.</em>
        </h1>
        <div className="site-actions">
          <a
            className="site-btn site-btn--primary"
            href="https://calendar.app.google/mrp9eD6VrhFgm7Hz9"
            target="_blank"
            rel="noopener noreferrer"
          >
            Holler at us <span aria-hidden="true">↗</span>
          </a>
          <a className="site-btn site-btn--secondary" href="#what-we-produce">
            See what we produce
          </a>
        </div>
      </SiteSection>

      <SiteSection id="what-we-produce">
        <div className="site-output-grid">
          {outputs.map((output) => (
            <article className="site-output" key={output.number}>
              <div className="site-output__meta">
                <span className="site-number">{output.number}</span>
                <span>{output.kicker}</span>
              </div>
              <h3>{output.title}</h3>
              <p>{output.description}</p>
              <a href={output.href}>
                {output.link} <span aria-hidden="true">→</span>
              </a>
            </article>
          ))}
        </div>
      </SiteSection>

      <SiteSection className="site-home-workflows">
        <div className="site-head">
          <p className="site-kicker">How Holler works</p>
          <h2 aria-label="From action to context and insight.">
            <span aria-hidden="true">
              From <ActionWheel /> <span className="site-action-wheel-break" />
              to insight.
            </span>
          </h2>
        </div>

        <div className="site-journey-wrap">
          <div className="site-journey__legend" aria-label="Timeline legend">
            <span className="is-brand">Brand POV</span>
            <span className="is-customer">Customer POV</span>
          </div>
          <ol className="site-journey" aria-label="Holler timeline">
            <li className="is-brand">
              <div className="site-journey__meta">
                <span>Brand POV</span>
              </div>
              <h3>Create study</h3>
              <p>
                Define the who, when, and what by setting the customer segment,
                moment for research, and questions that you want answered.
              </p>
            </li>
            <li className="is-customer">
              <div className="site-journey__meta">
                <span>Customer POV</span>
              </div>
              <h3>Customer action</h3>
              <p>The action is fresh and context is richest.</p>
            </li>
            <li className="is-neutral">
              <div className="site-journey__meta">
                <time>Immediately</time>
              </div>
              <h3>Automatically qualified</h3>
              <p>
                Holler&apos;s system automatically qualifies customers that
                match the criteria, using their history to deliver context rich
                research questions.
              </p>
            </li>
            <li className="is-customer">
              <div className="site-journey__meta">
                <time>Seconds later</time>
                <span>Customer POV</span>
              </div>
              <h3>Receive call</h3>
              <p>
                A Holler researcher calls the customer to understand the why
                behind the action, and makes sure they leave with a positive
                impression of the brand.
              </p>
            </li>
            <li className="is-customer">
              <div className="site-journey__meta">
                <time>On the call</time>
                <span>Customer POV</span>
              </div>
              <h3>A real conversation</h3>
              <p>
                The customer shares their story, answers questions for the
                brand, and leaves feeling heard.
              </p>
            </li>
            <li className="is-brand">
              <div className="site-journey__meta">
                <span>Brand POV</span>
              </div>
              <h3>Content delivered</h3>
              <p>
                The best clips from research are turned into social content.
              </p>
            </li>
            <li className="is-brand">
              <div className="site-journey__meta">
                <span>Brand POV</span>
              </div>
              <h3>Report delivery</h3>
              <p>
                Research is distilled into an actionable report and a
                searchable, tagged research database.
              </p>
            </li>
          </ol>
        </div>
      </SiteSection>

      <SiteSection>
        <figure className="site-feature">
          <p className="site-kicker">Our operating principle</p>
          <blockquote>
            Customers leave every conversation feeling more connected to your
            brand.
          </blockquote>
          <figcaption>Human-to-human. Always.</figcaption>
        </figure>
        <div className="site-feature-action">
          <a className="site-btn site-btn--primary" href="/contact">
            Talk with Holler <span aria-hidden="true">→</span>
          </a>
        </div>
      </SiteSection>
    </SitePage>
  );
}
