/**
 * Sends a stream of fictional, correctly signed Shopify `orders/create`
 * webhooks to a local Holler server. The server cannot distinguish them from
 * real deliveries, so this exercises HMAC validation, ingestion, dedupe, and
 * (with the worker running) qualification without a tunnel or Shopify.
 *
 *   npm run shopify:fake-orders -- --count 20 --interval 3s --install
 *
 * Reads SHOPIFY_API_SECRET (and DATABASE_URL for --install) from the shell,
 * falling back to .env.local. All customers, phones, and products are fictional.
 */
import { createHmac, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

if (!process.env.SHOPIFY_API_SECRET && existsSync(".env.local"))
  process.loadEnvFile(".env.local");

const { values: args } = parseArgs({
  options: {
    shop: {
      type: "string",
      default: "hollers-test-store-version-zero.myshopify.com",
    },
    url: { type: "string", default: "http://localhost:5173/webhooks" },
    count: { type: "string", default: "10" },
    interval: { type: "string", default: "2s" },
    "api-version": { type: "string", default: "2026-10" },
    install: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.info(`Options:
  --shop <domain>        default ${args.shop}
  --url <webhook url>    default ${args.url}
  --count <n>            orders to send (default 10)
  --interval <ms|Ns>     delay between orders (default 2s)
  --install              record the app install for --shop in DATABASE_URL first
                         (needed if the shop never completed OAuth locally)`);
  process.exit(0);
}

const secret = process.env.SHOPIFY_API_SECRET;
if (!secret) {
  console.error("SHOPIFY_API_SECRET is required (shell env or .env.local).");
  process.exit(1);
}

const count = Number(args.count);
const intervalMs = parseDuration(args.interval);

const products = [
  {
    id: 910000000001,
    variant: 920000000001,
    sku: "KIT-TRAVEL",
    title: "Travel kit",
    price: "42.00",
  },
  {
    id: 910000000002,
    variant: 920000000002,
    sku: "SERUM-DEW",
    title: "Cloud dew serum",
    price: "28.50",
  },
  {
    id: 910000000003,
    variant: 920000000003,
    sku: "TEE-HARBOR",
    title: "Harbor tee",
    price: "34.00",
  },
  {
    id: 910000000004,
    variant: 920000000004,
    sku: "SOCK-TRAIL",
    title: "Trail socks",
    price: "12.00",
  },
];

const attributions = [
  "/products/travel-kit?utm_source=meta&utm_medium=paid_social&utm_campaign=fall-launch",
  "/collections/all?utm_source=google&utm_medium=cpc&utm_campaign=brand",
  "/products/cloud-dew-serum?utm_source=tiktok&utm_medium=paid_social&utm_campaign=creator-dew",
  "/?utm_source=klaviyo&utm_medium=email&utm_campaign=welcome",
  "/products/harbor-tee",
  null,
];

type Scenario =
  | "new_customer"
  | "returning"
  | "guest"
  | "pre_install_customer"
  | "redelivery";

/** Weighted so most orders can qualify while every edge case still appears. */
function pickScenario(hasReturning: boolean, hasSent: boolean): Scenario {
  const roll = Math.random();
  if (roll < 0.45) return "new_customer";
  if (roll < 0.7) return hasReturning ? "returning" : "new_customer";
  if (roll < 0.8) return "guest";
  if (roll < 0.92) return "pre_install_customer";
  return hasSent ? "redelivery" : "new_customer";
}

// Per-run ID bases so repeated runs never collide with earlier fake orders.
const runBase = Date.now() % 1_000_000_000;
let orderSequence = 0;
let customerSequence = 0;
const knownCustomers: { id: number; createdAt: string }[] = [];
let lastDelivery: { body: string; webhookId: string } | undefined;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function customerFor(scenario: Scenario, now: Date) {
  if (scenario === "guest") return null;
  if (scenario === "returning") return pick(knownCustomers);
  customerSequence += 1;
  const customer = {
    id: 700000000000 + runBase * 100 + customerSequence,
    createdAt:
      scenario === "pre_install_customer"
        ? "2025-03-01T12:00:00.000Z"
        : // Checkout creates the customer with the order; any earlier time
          // could precede a just-recorded install and read as partial history.
          now.toISOString(),
  };
  if (scenario === "new_customer") knownCustomers.push(customer);
  return customer;
}

function buildOrder(scenario: Scenario, now: Date) {
  orderSequence += 1;
  const orderId = 800000000000 + runBase * 100 + orderSequence;
  const customer = customerFor(scenario, now);
  const lines = Array.from(
    { length: 1 + Math.floor(Math.random() * 2) },
    (_, index) => ({
      product: pick(products),
      quantity: 1 + Math.floor(Math.random() * 2),
      lineId: orderId * 10 + index,
    }),
  );
  const total = lines
    .reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0)
    .toFixed(2);
  const landing = pick(attributions);
  const createdAt = now.toISOString();
  return {
    id: orderId,
    admin_graphql_api_id: `gid://shopify/Order/${orderId}`,
    name: `#FAKE${orderSequence}`,
    created_at: createdAt,
    updated_at: createdAt,
    cancelled_at: null,
    test: true,
    financial_status: "paid",
    fulfillment_status: null,
    currency: "USD",
    total_price: total,
    // Fields Holler must drop; present so the allowlist is exercised.
    email: `fake-${orderSequence}@example.invalid`,
    note: "Synthetic order from fake-shopify-orders",
    landing_site: landing,
    referring_site: landing?.includes("utm_source=meta")
      ? "https://l.instagram.com/"
      : null,
    customer: customer && {
      id: customer.id,
      admin_graphql_api_id: `gid://shopify/Customer/${customer.id}`,
      email: `fake-customer-${customer.id}@example.invalid`,
      phone: `+120255501${String(customer.id % 100).padStart(2, "0")}`,
      first_name: "Synthetic",
      last_name: "Shopper",
      created_at: customer.createdAt,
    },
    line_items: lines.map(({ product, quantity, lineId }) => ({
      id: lineId,
      admin_graphql_api_id: `gid://shopify/LineItem/${lineId}`,
      product_id: product.id,
      variant_id: product.variant,
      sku: product.sku,
      title: product.title,
      quantity,
      price: product.price,
    })),
  };
}

async function send(body: string, webhookId: string, triggeredAt: Date) {
  const response = await fetch(args.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": "orders/create",
      "X-Shopify-Shop-Domain": args.shop,
      "X-Shopify-API-Version": args["api-version"],
      "X-Shopify-Webhook-Id": webhookId,
      "X-Shopify-Event-Id": randomUUID(),
      "X-Shopify-Triggered-At": triggeredAt.toISOString(),
      "X-Shopify-Hmac-Sha256": createHmac("sha256", secret!)
        .update(body, "utf8")
        .digest("base64"),
    },
    body,
  });
  return response.status;
}

function parseDuration(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid --interval: ${value}`);
  return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
}

if (args.install) {
  if (!process.env.DATABASE_URL) {
    console.error("--install needs DATABASE_URL.");
    process.exit(1);
  }
  const { createDatabase } = await import("@holler/db");
  const { recordShopifyInstall } =
    await import("../apps/web/app/lib/shopify-ingestion.server");
  const { db, pool } = createDatabase(process.env.DATABASE_URL);
  const merchantId = await recordShopifyInstall(db, args.shop);
  await pool.end();
  console.info(`Recorded install for ${args.shop} (merchant ${merchantId}).`);
}

console.info(
  `Sending ${count} fake orders/create webhooks to ${args.url} for ${args.shop}\n`,
);
const tally = new Map<string, number>();
for (let index = 0; index < count; index += 1) {
  const now = new Date();
  const scenario = pickScenario(
    knownCustomers.length > 0,
    lastDelivery !== undefined,
  );
  let status: number;
  let label: string;
  if (scenario === "redelivery" && lastDelivery) {
    status = await send(lastDelivery.body, lastDelivery.webhookId, now);
    label = `redelivery of webhook ${lastDelivery.webhookId.slice(0, 8)}`;
  } else {
    const order = buildOrder(scenario, now);
    const body = JSON.stringify(order);
    const webhookId = randomUUID();
    status = await send(body, webhookId, now);
    lastDelivery = { body, webhookId };
    label = `${order.name} $${order.total_price}${order.customer ? ` customer ${order.customer.id}` : ""}`;
  }
  tally.set(scenario, (tally.get(scenario) ?? 0) + 1);
  console.info(
    `${String(index + 1).padStart(3)}  ${status}  ${scenario.padEnd(21)} ${label}`,
  );
  if (status === 401) {
    console.error(
      "\nHMAC rejected: the server's SHOPIFY_API_SECRET differs from this script's.",
    );
    process.exit(1);
  }
  if (index < count - 1)
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
console.info(
  `\nSent ${count}: ${[...tally].map(([key, value]) => `${key}=${value}`).join(", ")}`,
);
