export type MomentStatus = "active" | "draft" | "paused";

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
  readonly qualifiedThisWeek: number;
}

export const researchMoments: readonly ResearchMomentSummary[] = [
  {
    id: "moment-category-transition",
    name: "Second-order category transition",
    objective: "Learn why repeat customers move into a new product category.",
    status: "active",
    trigger: "Order completed",
    cohortSummary:
      "Order #2 · first order excluded Bottoms · current order contains Bottoms",
    weeklyTarget: 12,
    fieldCount: 7,
    scriptVersion: "Repeat purchase v3",
    qualifiedThisWeek: 8,
  },
  {
    id: "moment-attribution-audit",
    name: "First-purchase attribution audit",
    objective: "Compare Shopify attribution with customer-reported discovery.",
    status: "active",
    trigger: "Order completed",
    cohortSummary: "Order #1 · observed source is paid social or paid search",
    weeklyTarget: 10,
    fieldCount: 6,
    scriptVersion: "Attribution core v2",
    qualifiedThisWeek: 6,
  },
  {
    id: "moment-moisturizer-texture",
    name: "Moisturizer texture study",
    objective: "Understand texture expectations and application experience.",
    status: "draft",
    trigger: "Order completed",
    cohortSummary: "Current order contains Moisturizer",
    weeklyTarget: 8,
    fieldCount: 9,
    scriptVersion: "Product experience v1",
    qualifiedThisWeek: 0,
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
  readonly moment: string;
  readonly eventAgeMinutes: number;
  readonly orderSequence: number;
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
    moment: "Second-order category transition",
    eventAgeMinutes: 3,
    orderSequence: 2,
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
    moment: "First-purchase attribution audit",
    eventAgeMinutes: 11,
    orderSequence: 1,
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
    moment: "Moisturizer texture study",
    eventAgeMinutes: 24,
    orderSequence: 3,
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
