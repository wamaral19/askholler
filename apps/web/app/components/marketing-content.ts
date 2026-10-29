// Content shared by the Use Cases page and the site navigation.
export const useCases = [
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
] as const;
