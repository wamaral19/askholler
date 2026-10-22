/** A product shown in a sales demo, from the prospect's public storefront. */
export interface DemoProduct {
  /** Numeric Shopify product ID, or a generated one for non-Shopify sites. */
  readonly productId: string;
  readonly variantId: string;
  readonly handle: string;
  readonly title: string;
  /** Matches the dashboard SKU filter: letters, digits, `.`, `_`, `-`. */
  readonly sku: string;
  /** Decimal string, e.g. "28.00". */
  readonly price: string;
  readonly variantTitle: string | null;
  readonly imageUrl: string | null;
}

/** What the operator confirmed on the demo console before starting. */
export interface DemoConfig {
  readonly website: string;
  readonly companyName: string;
  readonly products: readonly DemoProduct[];
  /** Index into products of the product with the outsized repeat rate. */
  readonly heroIndex: number;
  readonly historicalOrders: number;
  readonly liveMinutes: number;
  readonly liveIntervalSeconds: number;
}

export const DEMO_LIMITS = {
  maxProducts: 15,
  minProducts: 3,
  minHistoricalOrders: 200,
  maxHistoricalOrders: 10_000,
  maxLiveMinutes: 120,
  minLiveIntervalSeconds: 5,
} as const;

const SKU_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

/** A dashboard-filterable SKU from a storefront SKU or product handle. */
export function demoSku(
  raw: string | null | undefined,
  handle: string,
): string {
  const candidate = (raw ?? "").trim();
  if (SKU_PATTERN.test(candidate)) return candidate;
  const fromHandle = (candidate || handle)
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return fromHandle || "SKU";
}

/** Rejects configs the seeder cannot honor; returns readable problems. */
export function validateDemoConfig(config: DemoConfig): string[] {
  const problems: string[] = [];
  if (!config.companyName.trim()) problems.push("Enter a company name.");
  if (
    config.products.length < DEMO_LIMITS.minProducts ||
    config.products.length > DEMO_LIMITS.maxProducts
  )
    problems.push(
      `Choose between ${DEMO_LIMITS.minProducts} and ${DEMO_LIMITS.maxProducts} products.`,
    );
  if (!config.products[config.heroIndex])
    problems.push("Pick the product with the high repeat rate.");
  const skus = new Set<string>();
  for (const product of config.products) {
    if (!product.title.trim()) problems.push("Every product needs a name.");
    if (!SKU_PATTERN.test(product.sku))
      problems.push(`SKU "${product.sku}" may use only letters, digits, . _ -`);
    if (skus.has(product.sku))
      problems.push(`SKU "${product.sku}" is repeated.`);
    skus.add(product.sku);
    if (
      !/^\d{1,6}(\.\d{1,2})?$/.test(product.price) ||
      Number(product.price) <= 0
    )
      problems.push(`"${product.title}" needs a price like 28.00.`);
  }
  if (
    !Number.isInteger(config.historicalOrders) ||
    config.historicalOrders < DEMO_LIMITS.minHistoricalOrders ||
    config.historicalOrders > DEMO_LIMITS.maxHistoricalOrders
  )
    problems.push(
      `Historical orders must be ${DEMO_LIMITS.minHistoricalOrders}–${DEMO_LIMITS.maxHistoricalOrders}.`,
    );
  if (
    !Number.isInteger(config.liveMinutes) ||
    config.liveMinutes < 1 ||
    config.liveMinutes > DEMO_LIMITS.maxLiveMinutes
  )
    problems.push(`Live minutes must be 1–${DEMO_LIMITS.maxLiveMinutes}.`);
  if (
    !Number.isInteger(config.liveIntervalSeconds) ||
    config.liveIntervalSeconds < DEMO_LIMITS.minLiveIntervalSeconds ||
    config.liveIntervalSeconds > 600
  )
    problems.push(
      `Seconds between live orders must be ${DEMO_LIMITS.minLiveIntervalSeconds}–600.`,
    );
  return [...new Set(problems)];
}
