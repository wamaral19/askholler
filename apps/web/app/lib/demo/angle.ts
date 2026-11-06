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

/** Products adjacent to the hero that the study is trying to understand. */
export const OPPORTUNITY_CATEGORY = {
  namespace: "merchant",
  key: "demo-opportunity",
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
  const opportunity = input.otherTitles[0] ?? "another product";
  return {
    name: `${hero}: loyalty & cross-sell opportunity`,
    question: `What contributes to repeat purchasing among ${hero} owners, and what explains whether they consider other ${company} products?`,
    objective: `Interview repeat ${company} customers who have kept ${hero} but have never bought from the adjacent product category. Reconstruct real purchase and use episodes, compare one-time and repeat ${hero} buyers, and understand cross-sell awareness and friction without presuming a cause.`,
    cohortExpression: {
      all: [
        {
          predicate: "customer.order_sequence",
          version: 1,
          config: { operator: "at_least", value: 2 },
        },
        {
          predicate: "customer.distinct_orders_with_product",
          version: 1,
          config: {
            operator: "at_least",
            value: 1,
            productTitle: hero,
          },
        },
        {
          predicate: "customer.distinct_orders_with_category",
          version: 1,
          config: {
            operator: "at_least",
            value: 1,
            namespace: HERO_CATEGORY.namespace,
            categoryKey: HERO_CATEGORY.key,
          },
        },
        {
          predicate: "customer.distinct_orders_with_category",
          version: 1,
          config: {
            operator: "equals",
            value: 0,
            namespace: OPPORTUNITY_CATEGORY.namespace,
            categoryKey: OPPORTUNITY_CATEGORY.key,
          },
        },
      ],
    },
    prompts: [
      {
        id: "opening",
        title: "Introduce and get consent",
        prompt: `Hi, this is [your name], calling on behalf of ${company}. Thanks for your recent order. We're talking with a few customers about how they shop for and use our products. This isn't a sales call and there are no right answers. Do you have about eight minutes? With your permission, may I record the conversation so I can focus on what you say?`,
        delivery: {
          requirement: "core",
          interviewerNote:
            "If recording is declined, offer to continue without recording and follow local consent requirements.",
        },
      },
      {
        id: "rpt-001",
        title: "Latest repeat purchase",
        prompt: `Take me back to your most recent ${company} order. Walk me through what led up to it.`,
        probes: [
          "When did buying again first cross your mind?",
          "What happened between then and placing the order?",
        ],
        delivery: {
          requirement: "core",
          conditionKey: "all_qualified",
          conditionLabel: "the participant qualifies for the study",
          interviewerNote:
            "Anchor in the most recent completed order. Do not suggest promotional or marketing triggers.",
        },
      },
      {
        id: "use-001",
        title: "Last actual use",
        prompt: `Take me through the last time you used your ${hero}. Start with what was happening before you reached for it.`,
        probes: [
          "Where were you and what were you doing?",
          "Why did you reach for this product on that occasion?",
        ],
        delivery: {
          requirement: "core",
          conditionKey: "all_qualified",
          conditionLabel: "the participant qualifies for the study",
          interviewerNote:
            "Explore actual context and experience through open probes; do not offer a benefit as an answer.",
        },
      },
      {
        id: "rpt-002",
        title: "First-to-second order",
        prompt: `Walk me through what happened between receiving your first ${hero} and deciding to order another one.`,
        probes: [
          "What experiences with the first one stand out?",
          "When did getting another first become relevant?",
        ],
        delivery: {
          requirement: "branch",
          conditionKey: "hero_on_at_least_two_distinct_orders",
          conditionLabel: `${hero} appears on at least two distinct kept orders`,
          interviewerNote:
            "Reconstruct progression from the first experience to the repeat purchase.",
          branchGroup: "hero_order_count",
        },
      },
      {
        id: "rpt-008",
        title: "Habit versus special need",
        prompt: `Thinking about your last two ${company} orders, how were the situations around them different?`,
        probes: [
          "What were you trying to accomplish on each occasion?",
          "How did that shape what you ordered?",
        ],
        delivery: {
          requirement: "branch",
          conditionKey: "hero_on_one_distinct_order_only",
          conditionLabel: `${hero} appears on exactly one kept order`,
          interviewerNote:
            "Use when repeat-customer status comes from another product, not a second hero-product order.",
          branchGroup: "hero_order_count",
        },
      },
      {
        id: "rpt-003",
        title: "Repeat product choice",
        prompt: `On that most recent ${hero} order, how did you land on ${hero} again?`,
        probes: [
          "What else did you consider for that order?",
          "What about getting this product again fit the occasion?",
        ],
        delivery: {
          requirement: "optional",
          conditionKey: "hero_repeat_reason_not_already_covered",
          conditionLabel: `${hero} appears on at least two orders and the reason for choosing it again has not emerged`,
          interviewerNote: "Skip if the specific reason is already clear.",
        },
      },
      {
        id: "xsl-001",
        title: "Other-product browsing",
        prompt: `Tell me about the last time you looked at another product from ${company}, apart from ${hero}.`,
        probes: [
          "What brought that other product to your attention?",
          "What did you end up doing?",
        ],
        delivery: {
          requirement: "core",
          conditionKey: "all_qualified",
          conditionLabel: "the participant qualifies for the study",
          interviewerNote:
            "If there was no browsing episode, establish unaided awareness before neutrally clarifying awareness of the adjacent category.",
          probeBranches: [
            {
              conditionKey: "has_browsed_opportunity_category",
              conditionLabel: `they have browsed ${opportunity}`,
              probe: `Tell me about the last time you looked at ${opportunity}. What were you looking for, and what did you end up doing?`,
            },
            {
              conditionKey: "has_not_browsed_opportunity_category",
              conditionLabel: `they have not browsed ${opportunity}`,
              probe: `Before this conversation, what did you know about ${opportunity}?`,
            },
            {
              conditionKey: "decided_against_opportunity_product",
              conditionLabel: `they mention deciding against ${opportunity}`,
              probe: "Walk me through how you reached that decision.",
            },
          ],
        },
      },
      {
        id: "sel-001",
        title: "Chosen product context",
        prompt:
          "Thinking about the last similar product you purchased elsewhere, walk me through how you landed on that specific item rather than another.",
        probes: [
          "What other item did you look at most closely?",
          "What tipped the decision, if anything?",
        ],
        delivery: {
          requirement: "conditional",
          conditionKey: "remembers_recent_outside_category_purchase",
          conditionLabel:
            "they remember a recent purchase in the adjacent category outside the brand",
          interviewerNote:
            "Apply this to the most recent real purchase; do not presume they compared the brand.",
        },
      },
      {
        id: "xsl-003",
        title: "Stayed with familiar",
        prompt:
          "Think of that order when you chose something familiar over trying something new. What led to that?",
        probes: [
          "What was attractive about the unfamiliar option?",
          "What made you settle on the familiar one?",
        ],
        delivery: {
          requirement: "conditional",
          conditionKey: "describes_familiar_over_new_choice",
          conditionLabel: "they describe a specific familiar-versus-new choice",
          interviewerNote:
            "Ask only when a specific choice occurred. Do not manufacture a tradeoff.",
        },
      },
      {
        id: "gen-005",
        title: "Open close",
        prompt:
          "Before we wrap up, is there anything about your experience we haven't covered that you think is important?",
        probes: [
          "Was there a moment we did not get to?",
          "Anything you would want the team to understand?",
        ],
        delivery: {
          requirement: "close",
          conditionKey: "all_qualified",
          conditionLabel: "the interview is ready to close",
          interviewerNote:
            "Close with thanks. Do not turn the interview into a sales pitch.",
        },
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
