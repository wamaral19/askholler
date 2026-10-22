import type { ScriptPrompt } from "@holler/domain";

/**
 * The research angle, interview script, and sample report findings a sales
 * demo shows. Everything is derived from the prospect's company name and
 * catalog so each demo reads as theirs.
 */

/** Product category the angle's cohort keys on; assigned to the hero product. */
export const HERO_CATEGORY = {
  namespace: "merchant",
  key: "demo-hero",
} as const;

export interface DemoAngleInput {
  readonly companyName: string;
  readonly heroTitle: string;
  /** Other catalog products, best sellers first. */
  readonly otherTitles: readonly string[];
}

export interface DemoAngle {
  readonly name: string;
  readonly objective: string;
  readonly question: string;
  readonly cohortExpression: unknown;
  readonly prompts: readonly ScriptPrompt[];
}

export function buildDemoAngle(input: DemoAngleInput): DemoAngle {
  const { companyName: company, heroTitle: hero } = input;
  const others = input.otherTitles.slice(0, 2);
  const catalogExamples =
    others.length === 2
      ? `like the ${others[0]} or the ${others[1]}`
      : others.length === 1
        ? `like the ${others[0]}`
        : "in the rest of the catalog";
  return {
    name: `Why ${hero} buyers come back`,
    question: `Why does ${hero} have a higher repeat purchase rate than the rest of the ${company} catalog?`,
    objective: `Talk to customers who previously bought ${hero} while they are placing a repeat order, to learn why they came back, what they liked about their first purchase, how they found ${company}, and what triggered today's order.`,
    cohortExpression: {
      all: [
        {
          predicate: "customer.order_sequence",
          version: 1,
          config: { operator: "at_least", value: 2 },
        },
        {
          predicate: "customer.prior_orders_contain_current_category",
          version: 1,
          config: {
            namespace: HERO_CATEGORY.namespace,
            categoryKey: HERO_CATEGORY.key,
          },
        },
      ],
    },
    prompts: [
      {
        id: "opening",
        title: "Introduce and get consent",
        prompt: `Hi, this is [your name] calling from ${company}. I saw you just placed another order with us, so thank you! We're talking with a few customers this week about what brings them back. Do you have five minutes? With your permission I'd like to record so I can focus on our conversation.`,
      },
      {
        id: "why-buy-more",
        title: "Why buy more from us",
        prompt: `What made you want to buy more from ${company}?`,
      },
      {
        id: "first-purchase",
        title: "What they liked the first time",
        prompt: `Think back to your first ${hero}. What did you like about it? Anything that surprised you, good or bad?`,
      },
      {
        id: "discovery",
        title: "Where they first heard of us",
        prompt: `Where did you hear about ${company} originally? Do you remember what convinced you to try it?`,
        scope: "marketing",
      },
      {
        id: "planned-or-impulse",
        title: "Planned or impulse",
        prompt:
          "Were you thinking about buying this for a while, or was this more of an impulse buy for you?",
      },
      {
        id: "trigger",
        title: "What triggered today",
        prompt:
          "Did something trigger the purchase today? For example an email or text, running low, a promotion, or someone mentioning it.",
        scope: "marketing",
      },
      {
        id: "rest-of-catalog",
        title: "The rest of the catalog",
        prompt: `Have you tried anything else from ${company}, ${catalogExamples}? What would make you try something new from us?`,
      },
      {
        id: "close",
        title: "Close",
        prompt: `That's everything I had. Is there anything you wish ${company} knew? Thanks so much for your time.`,
      },
    ],
  };
}

export interface SampleFindingRow {
  readonly label: string;
  readonly count: number;
  readonly quote: string;
}

export interface SampleFinding {
  readonly promptId: string;
  readonly question: string;
  readonly rows: readonly SampleFindingRow[];
}

export interface SampleFindings {
  /** Illustrative interviews the sample report summarizes. */
  readonly interviews: number;
  readonly findings: readonly SampleFinding[];
  readonly actions: readonly string[];
}

/** Illustrative interview results; labeled as sample data wherever shown. */
export function buildSampleFindings(input: DemoAngleInput): SampleFindings {
  const { companyName: company, heroTitle: hero } = input;
  const finding = (
    promptId: string,
    question: string,
    rows: [string, number, string][],
  ): SampleFinding => ({
    promptId,
    question,
    rows: rows.map(([label, count, quote]) => ({ label, count, quote })),
  });
  return {
    interviews: 24,
    findings: [
      finding("why-buy-more", "Why did you want to buy more from us?", [
        [
          "It worked, so no reason to switch",
          10,
          `Honestly, the ${hero} just works. I didn't want to gamble on something else.`,
        ],
        [
          "Ran out and restocked",
          7,
          `I was down to the last of my ${hero}, so it was an easy reorder.`,
        ],
        [
          `Trust ${company} now`,
          4,
          `After the first order I trust ${company}. I don't need to research it again.`,
        ],
        [
          "Buying one as a gift",
          3,
          `This one's for my sister. I've been talking about mine since I got it.`,
        ],
      ]),
      finding(
        "first-purchase",
        "What did you like about your initial purchase?",
        [
          [
            "Better quality than expected",
            9,
            "It was better made than I expected for the price.",
          ],
          [
            "Became part of a daily routine",
            7,
            "It fit right into my routine. I used it every single day.",
          ],
          [
            "Delivery and unboxing",
            4,
            "It showed up fast and the packaging felt really considered.",
          ],
          [
            "Value for money",
            4,
            "It felt like real value compared with what I'd been buying.",
          ],
        ],
      ),
      finding("discovery", "Where did you hear about us originally?", [
        [
          "A friend or family member",
          8,
          `My roommate had the ${hero} and wouldn't stop talking about it.`,
        ],
        [
          "A creator or influencer",
          7,
          "I saw someone I follow use it in a video and it looked legit.",
        ],
        [
          "Instagram or Facebook ad",
          5,
          "I think it was an Instagram ad, and then I looked at the reviews.",
        ],
        [
          "Searching on Google",
          3,
          "I was searching for something like it and you came up.",
        ],
        [
          "Doesn't remember",
          1,
          "Honestly, I don't remember. It's been a while.",
        ],
      ]),
      finding(
        "planned-or-impulse",
        "Were you thinking about this for a while, or was it an impulse buy?",
        [
          [
            "Planned: had been meaning to reorder",
            14,
            "I'd been meaning to reorder for a couple of weeks.",
          ],
          ["Impulse", 6, "Total impulse. I saw the email and just bought it."],
          [
            "Somewhere in between",
            4,
            "I knew I'd get it eventually. The sale made it today.",
          ],
        ],
      ),
      finding("trigger", "Did something trigger the purchase today?", [
        ["Running low", 9, "I noticed I was almost out."],
        [
          "An email or text reminder",
          7,
          `The reminder from ${company} showed up right when I needed it.`,
        ],
        ["A promotion", 4, "There was a discount, so I stocked up."],
        ["Nothing specific", 4, "Nothing really. It was just time."],
      ]),
    ],
    actions: [
      `Time a replenishment reminder to the ${hero} reorder cycle. "Running low" and "a reminder" together triggered two in three repeat orders.`,
      `Give ${hero} buyers a referral offer. A third first heard about ${company} from someone they know, a source that Shopify attribution can't see.`,
      `Lead first-order creative with ${hero}. It is the product most likely to turn a first order into a second.`,
    ],
  };
}
