/**
 * Reads every order on a store through the app's stored offline session, to
 * confirm that read_all_orders is granted and reaches past the 60-day window.
 *
 *   npm run shopify:read-all-orders -- --shop <store>.myshopify.com [--app custom]
 *
 * The shop must have installed the chosen app (run `shopify app dev --config
 * <app>` once). --app picks the credentials (see shopify-app-credentials.ts);
 * DATABASE_URL must hold that app's session. Prints only counts and dates,
 * never customer data. Under Holler Dev, which lacks read_all_orders, it
 * returns the last 60 days only.
 */
import { parseArgs } from "node:util";

import { selectShopifyAppCredentials } from "./shopify-app-credentials";

const { values: args } = parseArgs({
  options: {
    shop: { type: "string" },
    app: { type: "string", default: "custom" },
    help: { type: "boolean", default: false },
  },
});

if (args.help || !args.shop) {
  console.info(
    "Usage: npm run shopify:read-all-orders -- --shop <store>.myshopify.com [--app dev|custom]  (default custom)",
  );
  process.exit(args.help ? 0 : 1);
}

selectShopifyAppCredentials(args.app);

// Neither is used to read orders, but shopifyApp requires both.
process.env.SHOPIFY_APP_URL ??= "https://example.com";
process.env.SHOPIFY_SCOPES ??= "read_orders,read_all_orders";

const { getShopifyApp } = await import("../apps/web/app/shopify.server");

type GraphqlBody<T> = { data?: T; errors?: unknown };

const { admin } = await getShopifyApp().unauthenticated.admin(args.shop);

async function graphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, variables && { variables });
  const body = (await response.json()) as GraphqlBody<T>;
  if (!body.data) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

const { currentAppInstallation } = await graphql<{
  currentAppInstallation: { accessScopes: { handle: string }[] };
}>(`
  #graphql
  query GrantedScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`);
const scopes = currentAppInstallation.accessScopes.map((s) => s.handle);
console.info(`Granted scopes: ${scopes.join(", ")}`);
if (!scopes.includes("read_all_orders"))
  console.warn(
    "read_all_orders is not granted; only the last 60 days of orders will be returned.",
  );

const { bulkOperationRunQuery } = await graphql<{
  bulkOperationRunQuery: {
    bulkOperation: { id: string; status: string } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
}>(
  `
    #graphql
    mutation StartOrderExport($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
  {
    query: `{
      orders(sortKey: CREATED_AT) {
        edges { node { id name createdAt } }
      }
    }`,
  },
);
if (!bulkOperationRunQuery.bulkOperation)
  throw new Error(JSON.stringify(bulkOperationRunQuery.userErrors));
const operationId = bulkOperationRunQuery.bulkOperation.id;
console.info(`Started bulk export ${operationId}`);

type Operation = {
  status: string;
  errorCode: string | null;
  rootObjectCount: string;
  url: string | null;
};
let operation: Operation;
for (;;) {
  ({ bulkOperation: operation } = await graphql<{ bulkOperation: Operation }>(
    `
      #graphql
      query OrderExportStatus($id: ID!) {
        bulkOperation(id: $id) {
          status
          errorCode
          rootObjectCount
          url
        }
      }
    `,
    { id: operationId },
  ));
  if (operation.status !== "CREATED" && operation.status !== "RUNNING") break;
  console.info(`  ${operation.status}: ${operation.rootObjectCount} orders`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (operation.status !== "COMPLETED")
  throw new Error(`Export ${operation.status}: ${operation.errorCode}`);

// A completed export with no orders has no file.
const lines = operation.url
  ? (await (await fetch(operation.url)).text()).split("\n").filter(Boolean)
  : [];
const createdAts = lines.map(
  (line) => (JSON.parse(line) as { createdAt: string }).createdAt,
);
const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
const older = createdAts.filter((d) => Date.parse(d) < sixtyDaysAgo).length;

console.info(`Orders: ${createdAts.length}`);
if (createdAts.length > 0)
  console.info(
    `Created: ${createdAts[0]} to ${createdAts[createdAts.length - 1]}`,
  );
console.info(`Older than 60 days: ${older}`);
process.exit(0);
