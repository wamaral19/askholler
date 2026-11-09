/**
 * Picks which Shopify app's credentials a local script uses, so the scripts
 * can target either app without editing .env.local:
 *
 *   dev     Holler Dev (shopify.app.dev.toml): SHOPIFY_API_KEY, SHOPIFY_API_SECRET
 *   custom  Holler Custom Test (shopify.app.custom.toml):
 *           SHOPIFY_CUSTOM_API_KEY, SHOPIFY_CUSTOM_API_SECRET
 *
 * Values come from the shell, falling back to .env.local. The selected pair is
 * copied into SHOPIFY_API_KEY and SHOPIFY_API_SECRET, which is what the server
 * code reads. The server itself needs none of this: `shopify app dev --config
 * <name>` sets those two variables for whichever app it runs.
 */
import { existsSync } from "node:fs";

export const SHOPIFY_APPS = ["dev", "custom"] as const;
export type ShopifyAppName = (typeof SHOPIFY_APPS)[number];

export function selectShopifyAppCredentials(app: string): ShopifyAppName {
  if (!SHOPIFY_APPS.includes(app as ShopifyAppName)) {
    console.error(`--app must be one of: ${SHOPIFY_APPS.join(", ")}.`);
    process.exit(1);
  }
  // Never overwrites variables already set in the shell.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  if (app === "custom") {
    const key = process.env.SHOPIFY_CUSTOM_API_KEY;
    const secret = process.env.SHOPIFY_CUSTOM_API_SECRET;
    if (!key || !secret) {
      console.error(
        "--app custom needs SHOPIFY_CUSTOM_API_KEY and SHOPIFY_CUSTOM_API_SECRET (shell env or .env.local).",
      );
      process.exit(1);
    }
    process.env.SHOPIFY_API_KEY = key;
    process.env.SHOPIFY_API_SECRET = secret;
  }
  return app as ShopifyAppName;
}
