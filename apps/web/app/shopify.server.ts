import "@shopify/shopify-app-react-router/adapters/node";

import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";

type ShopifyApp = ReturnType<typeof createShopifyApp>;

let cachedShopifyApp: ShopifyApp | undefined;

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing ${name}. Run this surface through \`shopify app dev\` and provide DATABASE_URL.`,
    );
  }

  return value;
}

function createShopifyApp() {
  const databaseUrl = requireEnvironment("DATABASE_URL");
  const apiKey = requireEnvironment("SHOPIFY_API_KEY");
  const apiSecretKey = requireEnvironment("SHOPIFY_API_SECRET");
  const appUrl = requireEnvironment("SHOPIFY_APP_URL");
  const scopes = (
    process.env.SHOPIFY_SCOPES ?? "read_orders,read_products,read_customers"
  )
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return shopifyApp({
    apiKey,
    apiSecretKey,
    apiVersion: ApiVersion.October26,
    appUrl,
    distribution: AppDistribution.AppStore,
    scopes,
    sessionStorage: new PostgreSQLSessionStorage(databaseUrl),
    future: {
      expiringOfflineAccessTokens: true,
    },
  });
}

/**
 * Shopify is initialized on first Shopify request rather than at module load.
 * This keeps internal operations routes, tests, and builds independent from
 * Shopify credentials while making the Shopify surfaces fail closed.
 */
export function getShopifyApp(): ShopifyApp {
  cachedShopifyApp ??= createShopifyApp();
  return cachedShopifyApp;
}

export function addShopifyDocumentResponseHeaders(
  request: Request,
  headers: Headers,
): void {
  const url = new URL(request.url);
  const isShopifySurface =
    url.pathname === "/app" ||
    url.pathname.startsWith("/app/") ||
    url.pathname.startsWith("/auth/") ||
    url.searchParams.has("shop") ||
    url.searchParams.has("host");

  if (isShopifySurface) {
    getShopifyApp().addDocumentResponseHeaders(request, headers);
  }
}
