import {
  MarketingFooter,
  MarketingHeader,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "DTC Research Use Cases | Holler",
    "See how DTC ecommerce teams use Holler to understand attribution, creative resonance, retention, customer segments, and product experience.",
  );
}

const useCases = [
  {
    slug: "attribution",
    number: "01",
    label: "Attribution and discovery",
    question: "Where are customers really learning about your brand?",
    description:
      "Compare Shopify or platform attribution with the journey customers remember. Learn which channels introduce the brand, which ones close the order, and where word of mouth or creators are being missed.",
    examples: [
      "Customers attributed to Google or Meta",
      "Amazon purchasers who later buy direct",
      "New regional or channel growth",
    ],
  },
  {
    slug: "creative",
    number: "02",
    label: "Creative and positioning",
    question: "What message made the product feel worth buying?",
    description:
      "Hear the words customers use for the problem, benefit, and purchase justification. Understand what they remember from an ad and what your current positioning leaves out.",
    examples: [
      "Creative that outperforms the brand norm",
      "Claims and benefits customers repeat back",
      "Objections that product pages do not resolve",
    ],
  },
  {
    slug: "retention",
    number: "03",
    label: "Retention and repeat purchase",
    question: "Why did they come back, and would they have returned anyway?",
    description:
      "Talk with repeat customers while the reorder is fresh. Separate genuine loyalty and product need from the email, discount, or retargeting touchpoint that happened to capture the order.",
    examples: [
      "First to second order conversion",
      "New category purchases from repeat customers",
      "Discount dependence and replenishment triggers",
    ],
  },
  {
    slug: "product",
    number: "04",
    label: "Product experience",
    question: "What do customers notice that returns data cannot show?",
    description:
      "Reach customers around delivery or repeat purchase to surface expectation gaps, small irritants, standout moments, and unmet needs before they become visible in lagging metrics.",
    examples: [
      "Expectation compared with first use",
      "Product, fit, packaging, and delivery feedback",
      "Reasons one SKU wins over an alternative",
    ],
  },
  {
    slug: "segments",
    number: "05",
    label: "Segments and customer change",
    question: "How are your customers changing as the brand grows?",
    description:
      "Compare the motivations and language of meaningful customer cohorts. See where a single persona hides important differences between first-time, repeat, high-value, or category-expanding buyers.",
    examples: [
      "First-time compared with repeat customers",
      "High AOV and growing-order cohorts",
      "Customers entering a new product category",
    ],
  },
];

export default function UseCases() {
  return (
    <main className="holler-preview preview-subpage" id="top">
      <MarketingHeader current="use-cases" />

      <section className="preview-subpage-hero">
        <p className="preview-kicker">Use cases for DTC ecommerce</p>
        <h1>Answer the question behind the metric.</h1>
        <p>
          Your commerce stack shows what happened. Holler talks with the exact
          customers behind the pattern so your team can understand why it
          happened and decide what to do next.
        </p>
      </section>

      <nav className="preview-use-case-index" aria-label="Use case categories">
        <p>Explore the questions</p>
        <div>
          {useCases.map((useCase) => (
            <a href={`#${useCase.slug}`} key={useCase.slug}>
              <span>{useCase.number}</span>
              {useCase.label}
            </a>
          ))}
        </div>
      </nav>

      <section className="preview-use-case-list">
        {useCases.map((useCase) => (
          <article id={useCase.slug} key={useCase.number}>
            <div className="preview-use-case-heading">
              <span>{useCase.number}</span>
              <p>{useCase.label}</p>
            </div>
            <div className="preview-use-case-copy">
              <h2>{useCase.question}</h2>
              <p>{useCase.description}</p>
            </div>
            <ul>
              {useCase.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="preview-subpage-cta">
        <p className="preview-kicker">Have a different question?</p>
        <h2>If the right customers can answer it, Holler can research it.</h2>
        <a href="/contact">
          Bring us your question <span aria-hidden="true">→</span>
        </a>
      </section>

      <MarketingFooter />
    </main>
  );
}
