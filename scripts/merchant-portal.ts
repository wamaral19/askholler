/**
 * Operator administration for merchant portal sign-in (/portal). A merchant's
 * people sign in with Google; their Workspace email domain is the gate. There
 * is no UI for the pilot; every change takes effect on the next request.
 *
 *   npm run merchant-portal -- list
 *   npm run merchant-portal -- add <merchantId | store.myshopify.com> acme.com
 *   npm run merchant-portal -- remove acme.com
 *
 * Reads DATABASE_URL from the shell, falling back to .env.local. `remove`
 * also ends every open session the domain admitted.
 */
import { existsSync } from "node:fs";

import { createDatabase } from "@holler/db";

import { MerchantPortalDirectory } from "../apps/web/app/lib/merchant-portal-auth.server";
import { shopifyMerchantId } from "../apps/web/app/lib/shopify-ingestion.server";

if (!process.env.DATABASE_URL && existsSync(".env.local"))
  process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const [command, first, second] = process.argv.slice(2);
const { db, pool } = createDatabase(process.env.DATABASE_URL);
const directory = new MerchantPortalDirectory(db);

/** Accepts the merchant's UUID or its .myshopify.com address. */
function merchantIdFrom(value: string): string {
  return value.toLowerCase().endsWith(".myshopify.com")
    ? shopifyMerchantId(value)
    : value;
}

try {
  switch (command) {
    case "list":
      for (const row of await directory.listDomains())
        console.info(
          `${row.domain}  ${row.status}  ${row.merchantName} (${row.merchantId})`,
        );
      break;
    case "add":
      if (!first || !second)
        throw new Error(
          "Usage: npm run merchant-portal -- add <merchantId | store.myshopify.com> <domain>",
        );
      console.info(
        `Anyone signed in to Google Workspace at ${await directory.addDomain(
          merchantIdFrom(first),
          second,
        )} can now open /portal.`,
      );
      break;
    case "remove":
      if (!first)
        throw new Error("Usage: npm run merchant-portal -- remove <domain>");
      await directory.removeDomain(first);
      console.info("Removed; open sessions ended.");
      break;
    default:
      throw new Error("Usage: npm run merchant-portal -- list|add|remove ...");
  }
} finally {
  await pool.end();
}
