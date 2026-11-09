/**
 * Imports a merchant's order history from Shopify admin CSV exports.
 *
 *   npm run shopify:import-orders-csv -- --shop <store>.myshopify.com \
 *     --orders orders_export.csv --customers customers_export.csv \
 *     [--full-history] [--dry-run]
 *
 * --customers links orders to Shopify customer IDs by email, which repeat
 * purchase and cohort analysis need. Without it every order is imported
 * without a customer. --full-history says the export holds every order up to
 * the moment the store's webhooks began, so customer histories are complete.
 * --dry-run parses and reports without writing.
 *
 * Reads DATABASE_URL from the shell, falling back to .env.local. Prints counts
 * only. The export files hold customer PII: delete them once imported.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { mapShopifyCustomersCsv, mapShopifyOrdersCsv } from "@holler/shopify";

if (!process.env.DATABASE_URL && existsSync(".env.local"))
  process.loadEnvFile(".env.local");

const { values: args } = parseArgs({
  options: {
    shop: { type: "string" },
    orders: { type: "string" },
    customers: { type: "string" },
    "full-history": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help || !args.shop || !args.orders) {
  console.info(
    "Usage: npm run shopify:import-orders-csv -- --shop <store>.myshopify.com --orders <orders.csv> [--customers <customers.csv>] [--full-history] [--dry-run]",
  );
  process.exit(args.help ? 0 : 1);
}
const shop = args.shop.trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
  console.error("--shop must be the store's .myshopify.com domain.");
  process.exit(1);
}

const customerIds = args.customers
  ? mapShopifyCustomersCsv(readFileSync(args.customers, "utf8"))
  : new Map<string, string>();
const parsed = mapShopifyOrdersCsv(
  readFileSync(args.orders, "utf8"),
  customerIds,
);
const dates = parsed.orders.map((order) => order.createdAt).sort();

console.info(`Orders parsed: ${parsed.orders.length}`);
if (dates.length) console.info(`Created: ${dates[0]} to ${dates.at(-1)}`);
for (const [reason, count] of Object.entries(parsed.skipped))
  console.info(`Skipped (${reason}): ${count}`);
if (args.customers) {
  console.info(`Customers in export: ${customerIds.size}`);
  console.info(
    `Orders whose email matched no customer: ${parsed.unmatchedCustomerOrders}`,
  );
} else
  console.warn(
    "No --customers export: orders are imported without customers, so repeat-purchase analysis is unavailable for them.",
  );
console.info(`Orders without an email: ${parsed.ordersWithoutEmail}`);

if (args["dry-run"]) process.exit(0);
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (shell env or .env.local).");
  process.exit(1);
}

const { createDatabase } = await import("@holler/db");
const { importShopifyHistoricalOrders } =
  await import("../apps/web/app/lib/shopify-csv-import.server");
const { db, pool } = createDatabase(process.env.DATABASE_URL);
try {
  const result = await importShopifyHistoricalOrders(db, shop, parsed.orders, {
    fullHistory: args["full-history"],
  });
  console.info(`\nMerchant: ${result.merchantId}`);
  console.info(`Orders inserted: ${result.ordersInserted}`);
  console.info(`Orders already held: ${result.ordersAlreadyPresent}`);
  console.info(`Line items inserted: ${result.lineItemsInserted}`);
  console.info(`Customers linked: ${result.customersLinked}`);
  console.info(
    args["full-history"]
      ? "Customer histories marked complete."
      : "Customer histories left partial (no --full-history).",
  );
} finally {
  await pool.end();
}
