/**
 * Live moments qualify new orders into the queue; paused and completed moments
 * stop qualifying (completed can be reopened, so it behaves like paused).
 * Persisted as research_moments.status "active" | "paused" | "completed" |
 * "draft".
 */
export type MomentStatus = "live" | "draft" | "paused" | "completed";

export interface ResearchMomentSummary {
  readonly id: string;
  readonly name: string;
  readonly objective: string;
  readonly status: MomentStatus;
  readonly trigger: string;
  readonly cohortSummary: string;
  readonly weeklyTarget: number;
  readonly fieldCount: number;
  readonly scriptVersion: string;
  /** Interviews completed since the start of the merchant's week. */
  readonly completedThisWeek: number;
}

export const researchMoments: readonly ResearchMomentSummary[] = [
  {
    id: "moment-category-transition",
    name: "Second-order category transition",
    objective: "Learn why repeat customers move into a new product category.",
    status: "live",
    trigger: "Order completed",
    cohortSummary:
      "The customer's second order, their first order had no Bottoms, and this order includes Bottoms.",
    weeklyTarget: 12,
    fieldCount: 7,
    scriptVersion: "Repeat purchase v3",
    completedThisWeek: 8,
  },
  {
    id: "moment-attribution-audit",
    name: "First-purchase attribution audit",
    objective: "Compare Shopify attribution with customer-reported discovery.",
    status: "live",
    trigger: "Order completed",
    cohortSummary:
      "The customer's first order, and they came from paid social or paid search.",
    weeklyTarget: 10,
    fieldCount: 6,
    scriptVersion: "Attribution core v2",
    completedThisWeek: 4,
  },
  {
    id: "moment-moisturizer-texture",
    name: "Moisturizer texture study",
    objective: "Understand texture expectations and application experience.",
    status: "paused",
    trigger: "Order completed",
    cohortSummary: "This order includes Moisturizer.",
    weeklyTarget: 8,
    fieldCount: 9,
    scriptVersion: "Product experience v1",
    completedThisWeek: 3,
  },
  {
    id: "moment-outerwear-fit",
    name: "Outerwear fit check",
    objective: "Hear how first-time outerwear buyers chose their size.",
    status: "draft",
    trigger: "Order completed",
    cohortSummary: "This order includes Outerwear.",
    weeklyTarget: 6,
    fieldCount: 5,
    scriptVersion: "Product experience v1",
    completedThisWeek: 0,
  },
  {
    id: "moment-holiday-gifting",
    name: "Holiday gifting",
    objective: "Learn who holiday orders were bought for and why.",
    status: "completed",
    trigger: "Order completed",
    cohortSummary: "Orders placed between Nov 15 and Dec 24.",
    weeklyTarget: 15,
    fieldCount: 6,
    scriptVersion: "Attribution core v2",
    completedThisWeek: 0,
  },
];

export const categoryOptions = [
  { key: "bottoms", label: "Bottoms" },
  { key: "tops", label: "Tops" },
  { key: "outerwear", label: "Outerwear" },
  { key: "moisturizer", label: "Moisturizer" },
  { key: "socks", label: "Socks" },
] as const;

export type FieldSource =
  "platform_default" | "merchant_default" | "research_run";

export interface PrototypeResearchField {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly source: FieldSource;
  readonly required: boolean;
  readonly valueType: "single_select" | "long_text" | "rating_scale";
  readonly options?: readonly string[];
}

export const researchFields: readonly PrototypeResearchField[] = [
  {
    id: "discovery-source",
    label: "Discovery source",
    prompt: "Where did you first hear about the brand?",
    source: "platform_default",
    required: true,
    valueType: "single_select",
    options: ["Creator", "Word of mouth", "Meta", "Google", "Other"],
  },
  {
    id: "purchase-trigger",
    label: "Purchase trigger",
    prompt: "What prompted you to place this order today?",
    source: "platform_default",
    required: true,
    valueType: "single_select",
    options: ["Email", "SMS", "Paid ad", "Planned purchase", "Other"],
  },
  {
    id: "marketing-influence",
    label: "Marketing influence",
    prompt: "Which marketing, if any, influenced your decision?",
    source: "platform_default",
    required: true,
    valueType: "long_text",
  },
  {
    id: "brand-language",
    label: "Customer language",
    prompt: "What words would you use to describe what you wanted?",
    source: "merchant_default",
    required: false,
    valueType: "long_text",
  },
  {
    id: "fit-confidence",
    label: "Fit confidence",
    prompt: "How confident were you about fit before purchasing?",
    source: "merchant_default",
    required: false,
    valueType: "rating_scale",
  },
  {
    id: "category-transition",
    label: "Reason for entering Bottoms",
    prompt: "What made this the right time to try Bottoms?",
    source: "research_run",
    required: true,
    valueType: "long_text",
  },
  {
    id: "first-order-gap",
    label: "Why not on first order?",
    prompt: "What kept you from choosing Bottoms on your first order?",
    source: "research_run",
    required: false,
    valueType: "long_text",
  },
];

export interface QueueAssignment {
  readonly id: string;
  readonly customerName: string;
  readonly maskedPhone: string;
  readonly syntheticPhone: string;
  readonly merchant: string;
  readonly momentId: string;
  readonly moment: string;
  readonly eventAgeMinutes: number;
  readonly orderSequence: number;
  readonly orderNumber: string | null;
  readonly shopifyCustomerId: string | null;
  readonly orderTotal: string;
  readonly products: readonly string[];
  readonly observedAttribution: string;
  readonly priority: "urgent" | "standard";
}

export const queueAssignments: readonly QueueAssignment[] = [
  {
    id: "assignment-001",
    customerName: "Synthetic Avery",
    maskedPhone: "+1 ••• ••• 0123",
    syntheticPhone: "+1 202 555 0123",
    merchant: "Northstar Outfitters — synthetic",
    momentId: "moment-category-transition",
    moment: "Second-order category transition",
    eventAgeMinutes: 3,
    orderSequence: 2,
    orderNumber: "#1042",
    shopifyCustomerId: "900000000101",
    orderTotal: "$128.00",
    products: ["Everyday Trouser", "Ribbed Sock"],
    observedAttribution: "Meta / paid social",
    priority: "urgent",
  },
  {
    id: "assignment-002",
    customerName: "Synthetic Morgan",
    maskedPhone: "+1 ••• ••• 0148",
    syntheticPhone: "+1 202 555 0148",
    merchant: "Northstar Outfitters — synthetic",
    momentId: "moment-attribution-audit",
    moment: "First-purchase attribution audit",
    eventAgeMinutes: 11,
    orderSequence: 1,
    orderNumber: "#1043",
    shopifyCustomerId: "900000000102",
    orderTotal: "$84.00",
    products: ["Transit Overshirt"],
    observedAttribution: "Google / brand search",
    priority: "standard",
  },
  {
    id: "assignment-003",
    customerName: "Synthetic Jordan",
    maskedPhone: "+1 ••• ••• 0162",
    syntheticPhone: "+1 202 555 0162",
    merchant: "Morrow Skin — synthetic",
    momentId: "moment-moisturizer-texture",
    moment: "Moisturizer texture study",
    eventAgeMinutes: 24,
    orderSequence: 3,
    orderNumber: "#2187",
    shopifyCustomerId: "900000000103",
    orderTotal: "$62.00",
    products: ["Barrier Moisturizer"],
    observedAttribution: "Direct / unknown",
    priority: "standard",
  },
];

export const pinnedScript = [
  {
    id: "intro",
    title: "Permission and context",
    prompt:
      "Hi, this is a researcher calling on behalf of Northstar Outfitters. Is now an okay time for a short five-minute conversation about your recent order?",
  },
  {
    id: "discovery",
    title: "Discovery",
    prompt: "Thinking back, where did you first hear about Northstar?",
  },
  {
    id: "trigger",
    title: "Purchase trigger",
    prompt: "What happened today that prompted you to complete this order?",
  },
  {
    id: "transition",
    title: "Category transition",
    prompt:
      "Your first order did not include Bottoms, while this one did. What changed for you?",
  },
] as const;
