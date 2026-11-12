// Content shared by the Use Cases page and the site navigation.
export const useCases = [
  {
    slug: "attribution",
    number: "01",
    label: "Attribution and discovery",
    question: "Where are customers really learning about your brand?",
    description:
      "Compare platform attribution with the journey customers remember. Learn which channels introduce the brand, which ones drive the download, sign-up, or purchase, and where word of mouth or creators are being missed.",
    examples: [
      "Customers attributed to paid search or social",
      "Customers who found you through a marketplace or app store",
      "New regional or channel growth",
    ],
  },
  {
    slug: "creative",
    number: "02",
    label: "Creative and positioning",
    question: "What message made your product worth trying?",
    description:
      "Hear the words customers use for the problem, the benefit, and the reason they took the leap. Understand what they remember from an ad and what your current positioning leaves out.",
    examples: [
      "Creative that outperforms the brand norm",
      "Claims and benefits customers repeat back",
      "Objections your onboarding or landing pages do not resolve",
    ],
  },
  {
    slug: "retention",
    number: "03",
    label: "Retention and churn",
    question: "Why do customers stay, come back, or walk away?",
    description:
      "Talk with customers right after they renew, return, hit a milestone, or cancel. Separate genuine loyalty and need from the reminder, discount, or nudge that happened to be in the way, and hear the real reason people leave.",
    examples: [
      "Customers who just cancelled or downgraded",
      "Repeat customers and long-time subscribers",
      "Users who abandoned before converting",
    ],
  },
  {
    slug: "product",
    number: "04",
    label: "Product experience",
    question: "What do customers notice that your dashboards cannot show?",
    description:
      "Reach customers right after first use, a key milestone, or a support moment to surface expectation gaps, small irritants, standout moments, and unmet needs before they show up in lagging metrics.",
    examples: [
      "Expectation compared with first use",
      "Onboarding, feature, and service feedback",
      "Reasons customers choose you over an alternative",
    ],
  },
  {
    slug: "segments",
    number: "05",
    label: "Segments and customer change",
    question: "How are your customers changing as the brand grows?",
    description:
      "Compare the motivations and language of meaningful customer cohorts. See where a single persona hides important differences between new, returning, high-value, and expanding customers.",
    examples: [
      "New compared with long-time customers",
      "High-value and fast-growing cohorts",
      "Customers adopting a new product or feature",
    ],
  },
] as const;
