import type { ObservedAttributionV1 } from "@holler/domain";

/**
 * Deterministic synthetic order history for a sales demo. The same seed and
 * catalog always produce the same customers and orders, so a rehearsal and the
 * live demo show the same numbers. One "hero" product is built to have an
 * outsized repeat purchase rate with a regular reorder cycle; the rest of the
 * catalog repeats at ordinary rates.
 */

export type DemoChannel =
  "meta" | "google" | "tiktok" | "email" | "sms" | "direct" | "unknown";

export interface DemoOrderLine {
  readonly productIndex: number;
  readonly quantity: number;
}

export interface DemoOrder {
  readonly orderedAt: Date;
  readonly lines: readonly DemoOrderLine[];
  readonly channel: DemoChannel;
  readonly refunded: boolean;
}

export interface DemoCustomer {
  /** Stable within a dataset; used to derive Shopify customer IDs. */
  readonly index: number;
  readonly orders: readonly DemoOrder[];
}

export interface DemoDatasetInput {
  readonly seed: string;
  readonly productCount: number;
  readonly heroIndex: number;
  readonly targetOrders: number;
  readonly now: Date;
}

export const DEMO_HISTORY_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ORDERS_PER_CUSTOMER = 6;
/** Hero buyers reorder on a replenishment cycle around this many days. */
export const HERO_REORDER_DAYS = 28;

/** mulberry32 over a 32-bit FNV-1a hash of the seed. */
export function seededRandom(seed: string): () => number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T>(
  random: () => number,
  entries: readonly (readonly [T, number])[],
): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries.at(-1)![0];
}

const FIRST_ORDER_CHANNELS = [
  ["meta", 32],
  ["google", 18],
  ["tiktok", 8],
  ["email", 5],
  ["direct", 22],
  ["unknown", 15],
] as const satisfies readonly (readonly [DemoChannel, number])[];

const REPEAT_ORDER_CHANNELS = [
  ["email", 34],
  ["direct", 30],
  ["meta", 14],
  ["google", 10],
  ["sms", 7],
  ["unknown", 5],
] as const satisfies readonly (readonly [DemoChannel, number])[];

export function pickChannel(
  random: () => number,
  repeat: boolean,
): DemoChannel {
  return weighted(
    random,
    repeat ? REPEAT_ORDER_CHANNELS : FIRST_ORDER_CHANNELS,
  );
}

function quantity(random: () => number): number {
  const roll = random();
  return roll < 0.8 ? 1 : roll < 0.97 ? 2 : 3;
}

/** Popularity falls off with storefront rank (best sellers first). */
export function popularityWeights(productCount: number): number[] {
  return Array.from(
    { length: productCount },
    (_, rank) => 1 / (rank + 1) ** 0.7,
  );
}

export function generateDemoDataset(input: DemoDatasetInput): DemoCustomer[] {
  const random = seededRandom(input.seed);
  const weights = popularityWeights(input.productCount);
  const popular = weights.map((weight, index) => [index, weight] as const);
  // Ordinary products repeat at 14–24%; the hero at roughly half.
  const baseRepeat = weights.map(() => 0.14 + random() * 0.1);
  const windowStart = input.now.getTime() - DEMO_HISTORY_DAYS * DAY_MS;
  const latestFirstOrder = input.now.getTime() - 2 * 60 * 60 * 1000;

  const pickLines = (heroBias: number): DemoOrderLine[] => {
    const lines: DemoOrderLine[] = [];
    const first =
      random() < heroBias ? input.heroIndex : weighted(random, popular);
    lines.push({ productIndex: first, quantity: quantity(random) });
    if (random() < 0.28) {
      const second = weighted(random, popular);
      if (second !== first)
        lines.push({ productIndex: second, quantity: quantity(random) });
    }
    return lines;
  };

  const customers: DemoCustomer[] = [];
  let orderCount = 0;
  while (orderCount < input.targetOrders) {
    const orders: DemoOrder[] = [];
    let at = windowStart + random() * (latestFirstOrder - windowStart);
    const firstLines = pickLines(0);
    const heroBuyer = firstLines.some(
      (line) => line.productIndex === input.heroIndex,
    );
    orders.push({
      orderedAt: new Date(at),
      lines: firstLines,
      channel: pickChannel(random, false),
      refunded: random() < 0.03,
    });
    let repeatChance = heroBuyer
      ? 0.5
      : Math.max(...firstLines.map((line) => baseRepeat[line.productIndex]!));
    while (orders.length < MAX_ORDERS_PER_CUSTOMER && random() < repeatChance) {
      const gapDays = heroBuyer
        ? Math.max(
            10,
            HERO_REORDER_DAYS + (random() + random() + random() - 1.5) * 12,
          )
        : 12 - Math.log(1 - random()) * 40;
      at += gapDays * DAY_MS;
      if (at >= input.now.getTime()) break;
      orders.push({
        orderedAt: new Date(at),
        lines: pickLines(heroBuyer ? 0.78 : 0.05),
        channel: pickChannel(random, true),
        refunded: random() < 0.02,
      });
      repeatChance = heroBuyer ? 0.45 : 0.22;
    }
    customers.push({ index: customers.length + 1, orders });
    orderCount += orders.length;
  }
  return customers;
}

export interface RepeatRateRow {
  readonly productIndex: number;
  readonly customers: number;
  readonly repeatCustomers: number;
  readonly rate: number;
}

/** Share of customers whose first order included each product who ordered again. */
export function repeatRateByFirstProduct(
  customers: readonly DemoCustomer[],
  productCount: number,
): RepeatRateRow[] {
  const totals = Array.from({ length: productCount }, () => ({
    all: 0,
    repeat: 0,
  }));
  for (const customer of customers) {
    const first = customer.orders[0];
    if (!first) continue;
    for (const index of new Set(first.lines.map((line) => line.productIndex))) {
      totals[index]!.all += 1;
      if (customer.orders.length > 1) totals[index]!.repeat += 1;
    }
  }
  return totals.map((total, productIndex) => ({
    productIndex,
    customers: total.all,
    repeatCustomers: total.repeat,
    rate: total.all ? total.repeat / total.all : 0,
  }));
}

/** Observed attribution as Holler's Shopify ingestion would record it. */
export function observedAttributionFor(
  channel: DemoChannel,
  orderedAt: Date,
  landingPath: string,
): ObservedAttributionV1 {
  const utm = (source: string, medium: string, campaign: string) => ({
    source,
    medium,
    campaign,
    content: null,
    term: null,
  });
  const base = {
    schemaVersion: 1 as const,
    observedAt: orderedAt.toISOString(),
    landingPath,
  };
  switch (channel) {
    case "meta":
      return {
        ...base,
        readiness: "ready",
        source: "meta",
        channel: "paid_social",
        campaign: "prospecting-always-on",
        referringDomain: "l.instagram.com",
        utm: utm("meta", "paid_social", "prospecting-always-on"),
      };
    case "google":
      return {
        ...base,
        readiness: "ready",
        source: "google",
        channel: "cpc",
        campaign: "brand-search",
        referringDomain: "www.google.com",
        utm: utm("google", "cpc", "brand-search"),
      };
    case "tiktok":
      return {
        ...base,
        readiness: "ready",
        source: "tiktok",
        channel: "paid_social",
        campaign: "creator-spark",
        referringDomain: null,
        utm: utm("tiktok", "paid_social", "creator-spark"),
      };
    case "email":
      return {
        ...base,
        readiness: "ready",
        source: "klaviyo",
        channel: "email",
        campaign: "replenishment-flow",
        referringDomain: null,
        utm: utm("klaviyo", "email", "replenishment-flow"),
      };
    case "sms":
      return {
        ...base,
        readiness: "ready",
        source: "postscript",
        channel: "sms",
        campaign: "restock-alert",
        referringDomain: null,
        utm: utm("postscript", "sms", "restock-alert"),
      };
    case "direct":
      return {
        ...base,
        readiness: "ready",
        source: "direct",
        channel: "direct",
        campaign: null,
        referringDomain: null,
        utm: null,
      };
    case "unknown":
      return {
        ...base,
        readiness: "unavailable",
        source: null,
        channel: null,
        campaign: null,
        referringDomain: null,
        landingPath: null,
        utm: null,
      };
  }
}
