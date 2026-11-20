// Content for the "Who It's For" pages. Every industry page follows the same
// shape so the three things Holler does stay obvious: it analyzes the data to
// find where the why is missing, automatically qualifies the customers behind
// the pattern, and runs the research with them.

export type Moment = {
  name: string;
  /** When Holler qualifies and calls the customer. */
  trigger: string;
  /** The change in the data that makes this moment worth researching. */
  signal: string;
  /** 01 Analysis: the cuts Holler checks first. */
  look: readonly string[];
  /** 02 Qualification: who gets the call. */
  qualify: string;
  /** 03 Research: what the researcher asks. */
  ask: readonly string[];
  /** Metrics the answer helps move. */
  moves: readonly string[];
};

export type Industry = {
  slug: string;
  name: string;
  /** Lowercase plural used in running copy, e.g. "apparel brands". */
  audience: string;
  summary: string;
  title: string;
  lede: string;
  triggers: readonly string[];
  moments: readonly Moment[];
  closing: string;
};

export const pillars = [
  {
    number: "01",
    label: "Analysis",
    title: "We find where the why is missing.",
    copy: "We read your data to find the cohort that changed, then size every theme against what they did.",
  },
  {
    number: "02",
    label: "Automatic qualification",
    title: "We reach them the moment they act.",
    copy: "Matching customers are qualified automatically, with their history in hand.",
  },
  {
    number: "03",
    label: "Research",
    title: "We ask, human to human.",
    copy: "A trained researcher calls while it's fresh. You get the report, recordings, and quotes.",
  },
] as const;

const firstOrder = {
  name: "First-time buyers",
  trigger: "Seconds after the first order",
  signal:
    "New customer cohorts change, in absolute size, growth rate, AOV, or something else.",
  qualify: "First-order customers from the source or product driving it.",
  moves: ["CVR", "CAC", "New-customer AOV"],
} as const;

const secondOrder = {
  name: "Second-order buyers",
  trigger: "After the second order",
  signal: "Time to second order shifts.",
  qualify: "Second-order customers, split by first product.",
} as const;

const cancelled = {
  name: "Cancelled subscribers",
  trigger: "After cancellation",
  moves: ["Churn", "Save rate", "LTV"],
} as const;

export const industries: readonly Industry[] = [
  {
    slug: "apps",
    name: "Apps",
    audience: "apps",
    summary: "Trials, paid conversion, retention, campaigns.",
    title: "Know the why behind the tap.",
    lede: "Dashboards show what users did. Holler asks them why.",
    triggers: [
      "User growth rate moves with no clear cause",
      "Trial-to-paid conversion rate drops for a cohort",
      "Retention bends after a release",
      "A campaign's installs behave differently",
    ],
    moments: [
      {
        name: "New paid users",
        trigger: "After the first payment",
        signal: "Paid growth or plan mix shifts.",
        look: ["Paid growth by source", "ROAS by ad", "Plan mix"],
        qualify: "New subscribers from the source or plan driving the change.",
        ask: [
          "What job did you hire us to do?",
          "If you quit in three weeks, why?",
        ],
        moves: ["LTV", "Paid CVR", "CAC"],
      },
      {
        name: "Trial drop-offs",
        trigger: "After an unpaid trial ends",
        signal: "Trial-to-paid falls for a cohort.",
        look: [
          "Conversion by source and device",
          "Time to first value",
          "Paywall exposure",
        ],
        qualify: "Trial users who saw the paywall and didn't pay.",
        ask: ["When did you decide not to pay?", "What will you use instead?"],
        moves: ["Trial-to-paid", "Activation", "CAC payback"],
      },
      {
        name: "Fading users",
        trigger: "When usage drops below normal",
        signal: "D7 and D30 slip while acquisition holds.",
        look: [
          "D7 and D30 by cohort",
          "Feature frequency",
          "Time since key action",
        ],
        qualify: "Users below their own usage baseline, before they cancel.",
        ask: [
          "What usually makes you open the app?",
          "What are you using instead?",
        ],
        moves: ["Retention", "Churn", "LTV"],
      },
      {
        name: "Campaign installs",
        trigger: "Days after install",
        signal: "A campaign's installs activate differently.",
        look: [
          "Creative and audience",
          "Install-to-activation",
          "D7 retention",
        ],
        qualify: "Campaign installs, compared with baseline-channel users.",
        ask: [
          "Which promise caught your attention?",
          "What other ads do you remember?",
        ],
        moves: ["Install CVR", "Activation", "ROAS"],
      },
    ],
    closing: "Your dashboard shows the tap. Holler tells you why.",
  },
  {
    slug: "wellness-beauty",
    name: "Wellness & Beauty",
    audience: "wellness and beauty brands",
    summary: "First purchases, routines, replenishment.",
    title: "Know whether you earned a place in the routine.",
    lede: "Holler hears the goal, expectation, and result behind every reorder.",
    triggers: [
      "New-customer mix shifts",
      "Repeat rate moves for a cohort",
      "A hero product stalls",
      "Reorders come late, or not at all",
    ],
    moments: [
      {
        ...firstOrder,
        look: ["Acquisition source", "First SKU", "Discount rate"],
        ask: ["What problem were you solving?", "Why us, and why now?"],
      },
      {
        ...secondOrder,
        look: ["Time to second order", "First and second SKU", "Discounts"],
        ask: [
          "What result made you buy again?",
          "How does it fit your routine?",
        ],
        moves: ["Repeat rate", "LTV"],
      },
      {
        name: "Missed reorders",
        trigger: "When the reorder date passes",
        signal: "Customers who should've run out haven't returned.",
        look: [
          "Days since purchase vs. expected use",
          "Past reorder timing",
          "SKU repeat rate",
        ],
        qualify: "Customers past their expected reorder window.",
        ask: ["Did you finish it?", "What interrupted the routine?"],
        moves: ["Reorder rate", "Recovered revenue"],
      },
      {
        name: "Category expanders",
        trigger: "After the first cross-category order",
        signal: "Customers try a new category, or don't.",
        look: ["Purchase sequence", "Cross-category pairs", "Discovery path"],
        qualify: "Customers adding a category for the first time.",
        ask: ["What led you to the new category?", "Why trust us with it?"],
        moves: ["Cross-category rate", "AOV", "LTV"],
      },
    ],
    closing: "Hear the need, expectation, and result behind every routine.",
  },
  {
    slug: "apparel",
    name: "Apparel",
    audience: "apparel brands",
    summary: "Returns, fit, first orders, promotions.",
    title: "Know why your brand. Why that style. Why that color.",
    lede: "Hollering confirms why marketing won the purchase and why product will earn the next order, or why they needed to send it back.",
    triggers: [
      "Ad campaigns rip and you don't know why",
      "Returns rise for a SKU, size, or color",
      "New cohorts only buy on discount",
    ],
    moments: [
      {
        ...firstOrder,
        look: ["Acquisition source", "First SKU", "Discount rate"],
        ask: [
          "What occasion started the search?",
          "What gave you confidence in the fit?",
        ],
      },
      {
        name: "Stuck in category",
        trigger: "After a repeat order in the same category",
        signal:
          "One category doesn't lead to trying styles in any other category.",
        look: [
          "Repeats by category",
          "Repeat purchase cross category penetration",
          "Time between orders",
        ],
        qualify:
          "Repeat buyer, same category, never purchased outside that category.",
        ask: [
          "What brands or products do you buy for the other category?",
          "What is it you love the product in your repeat category?",
        ],
        moves: ["Repeat rate", "Return rate", "LTV"],
      },
      {
        name: "Returners",
        trigger: "When a return starts",
        signal: "Returns climb for a product, size, or color.",
        look: [
          "Return rate by SKU, size, color",
          "Return reason and timing",
          "Product page version",
        ],
        qualify:
          "Customers returning the item, compared with those who kept it.",
        ask: ["What did you expect?", "What was different in person?"],
        moves: ["Return rate", "Margin", "Return cost"],
      },
      {
        name: "Promo-driven buyers",
        trigger: "After a discounted order",
        signal: "Discounts drive volume while margin slips.",
        look: [
          "Discount usage by cohort",
          "Full-price conversion",
          "Margin by offer",
        ],
        qualify: "Promo-only buyers, compared with full-price buyers.",
        ask: [
          "Which offers change your decision?",
          "What would make it worth full price?",
        ],
        moves: ["Gross margin", "Full-price CVR"],
      },
    ],
    closing: "Find the fit, value, and expectation behind every return.",
  },
  {
    slug: "supplements",
    name: "Supplements",
    audience: "supplement brands",
    summary: "Outcomes, reorders, subscriptions, stacks.",
    title: "Know what they hoped would change, and whether it did.",
    lede: "Holler hears the outcome customers wanted, and whether they got it.",
    triggers: [
      "Reorder timing gets unpredictable",
      "Subscriptions churn early",
      "Customers switch products",
      "A new SKU or claim launches",
    ],
    moments: [
      {
        ...firstOrder,
        look: [
          "First SKU and benefit",
          "Acquisition source",
          "Subscribe vs. one-time",
        ],
        ask: ["What outcome are you hoping for?", "What made us credible?"],
      },
      {
        ...secondOrder,
        look: [
          "Time to second order",
          "Usage window",
          "Subscription conversion",
        ],
        ask: [
          "What early result drove the reorder?",
          "When did you notice it?",
        ],
        moves: ["Repeat rate", "Subscription CVR", "LTV"],
      },
      {
        ...cancelled,
        signal: "Churn rises or clusters at one tenure.",
        look: ["Tenure at cancellation", "Skips and cadence", "Excess supply"],
        qualify: "New cancellations, grouped by tenure and product.",
        ask: [
          "Was it results, price, or too much product?",
          "What would have kept it useful?",
        ],
      },
      {
        name: "Stack builders",
        trigger: "After a multi-product order",
        signal: "Some customers build routines across products.",
        look: ["Multi-SKU orders", "Product sequence", "Bundle attach rate"],
        qualify: "Customers combining products toward one goal.",
        ask: [
          "Which goal connects these products?",
          "What would you add next?",
        ],
        moves: ["AOV", "Cross-sell rate", "LTV"],
      },
    ],
    closing: "Connect the promised outcome to the behavior that follows.",
  },
  {
    slug: "food-beverage",
    name: "Food & Beverage",
    audience: "food and beverage brands",
    summary: "First tastes, habits, flavors, subscriptions.",
    title: "Know what turned a first taste into a habit.",
    lede: "Holler hears the flavor, occasion, and routine behind every reorder.",
    triggers: [
      "Repeat rate shifts for a cohort",
      "A new flavor launches",
      "Subscriptions skip or stall",
    ],
    moments: [
      {
        ...firstOrder,
        look: ["First flavor", "Acquisition source", "Geography"],
        ask: [
          "What craving or occasion started it?",
          "Why us over a familiar option?",
        ],
      },
      {
        ...secondOrder,
        look: ["Time to second order", "Repeated SKU", "Order size"],
        ask: [
          "What made you order again?",
          "Which product became the default?",
        ],
        moves: ["Repeat rate", "Purchase frequency", "LTV"],
      },
      {
        name: "Flavor explorers",
        trigger: "After a new-flavor order",
        signal: "Variety grows baskets. Which flavor is next?",
        look: [
          "Flavors purchased",
          "Flavor sequence",
          "Repeat by first flavor",
        ],
        qualify: "Customers who just tried a new flavor.",
        ask: [
          "What makes you try a new flavor?",
          "What should we recommend next?",
        ],
        moves: ["Flavor attach rate", "AOV"],
      },
      {
        ...cancelled,
        signal: "Subscriptions skip, slow, or cancel.",
        look: ["Tenure and skips", "Flavor mix", "Excess supply"],
        qualify: "New cancellations and repeat skippers.",
        ask: [
          "Did you have too much product?",
          "Did variety or price play a part?",
        ],
      },
    ],
    closing: "Hear the occasion and preference behind every order.",
  },
  {
    slug: "ecommerce",
    name: "Ecommerce",
    audience: "ecommerce brands",
    summary: "Any brand whose orders moved without a reason.",
    title: "Know why they bought, came back, or disappeared.",
    lede: "Holler gets the reason from the people behind the orders.",
    triggers: [
      "Revenue moves with no clear cause",
      "Cohorts behave differently",
      "A product loses repeat demand",
      "Customers stop coming back",
    ],
    moments: [
      {
        ...firstOrder,
        look: ["Source and campaign", "Landing page", "First SKU"],
        ask: ["What triggered the purchase?", "What else did you consider?"],
      },
      {
        name: "Repeat buyers",
        trigger: "After a repeat order",
        signal: "Purchase frequency shifts.",
        look: ["Time to second order", "Frequency", "Repeat SKU"],
        qualify: "Repeat buyers, split by first purchase.",
        ask: [
          "What earned another order?",
          "What would make you buy more often?",
        ],
        moves: ["Repeat rate", "Frequency", "LTV"],
      },
      {
        name: "Product drop-offs",
        trigger: "When they reorder without it",
        signal: "Customers still buy, but not that product.",
        look: [
          "Reorders that skip the product",
          "Replacement product",
          "Reviews and support",
        ],
        qualify: "Active customers who dropped one product.",
        ask: ["Why did you stop buying it?", "What replaced it?"],
        moves: ["Product repeat rate", "Product revenue"],
      },
      {
        name: "Lapsed buyers",
        trigger: "When the reorder date passes",
        signal: "Customers miss their usual cadence.",
        look: [
          "Days past expected reorder",
          "Past cadence",
          "Last order and support contact",
        ],
        qualify: "Customers past their own reorder cadence.",
        ask: ["What ended the buying cycle?", "What would bring you back?"],
        moves: ["Reactivation", "Recovered revenue"],
      },
    ],
    closing:
      "See the behavior in your data. Hear the reason from your customers.",
  },
];

export function findIndustry(slug: string | undefined) {
  return industries.find((industry) => industry.slug === slug);
}
