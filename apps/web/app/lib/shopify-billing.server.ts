import { BillingError, type MerchantCharge } from "./merchant-charges";

/** The `admin` client `authenticate.admin` returns. */
export interface AdminGraphqlClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<Response>;
}

interface UserError {
  readonly field?: readonly string[] | null;
  readonly message: string;
}

async function run<T>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(
    query,
    variables ? { variables } : undefined,
  );
  const body = (await response.json()) as { data?: T; errors?: unknown };
  if (!body.data) throw new BillingError("SHOPIFY_BILLING_FAILED", 502);
  return body.data;
}

/**
 * Development stores (including App Store reviewers') can only accept test
 * charges. SHOPIFY_BILLING_TEST=true forces test charges everywhere.
 */
export async function usesTestCharges(
  admin: AdminGraphqlClient,
): Promise<boolean> {
  if (process.env.SHOPIFY_BILLING_TEST === "true") return true;
  const data = await run<{
    shop: { plan: { partnerDevelopment: boolean } };
  }>(
    admin,
    `#graphql
    query HollerShopPlan { shop { plan { partnerDevelopment } } }`,
  );
  return data.shop.plan.partnerDevelopment;
}

/**
 * Creates the Shopify charge for a pending Holler charge and returns the page
 * where the merchant approves or declines it.
 */
export async function createShopifyCharge(
  admin: AdminGraphqlClient,
  charge: MerchantCharge,
  returnUrl: string,
  test: boolean,
): Promise<{ shopifyChargeId: string; confirmationUrl: string }> {
  const price = {
    amount: (charge.amountMinor / 100).toFixed(2),
    currencyCode: charge.currency,
  };
  if (charge.kind === "one_time") {
    const data = await run<{
      appPurchaseOneTimeCreate: {
        appPurchaseOneTime: { id: string } | null;
        confirmationUrl: string | null;
        userErrors: UserError[];
      };
    }>(
      admin,
      `#graphql
      mutation HollerProjectCharge($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
        appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
          appPurchaseOneTime { id }
          confirmationUrl
          userErrors { field message }
        }
      }`,
      { name: charge.description, price, returnUrl, test },
    );
    return createdCharge(
      data.appPurchaseOneTimeCreate.appPurchaseOneTime?.id,
      data.appPurchaseOneTimeCreate.confirmationUrl,
      data.appPurchaseOneTimeCreate.userErrors,
    );
  }
  const data = await run<{
    appSubscriptionCreate: {
      appSubscription: { id: string } | null;
      confirmationUrl: string | null;
      userErrors: UserError[];
    };
  }>(
    admin,
    `#graphql
    mutation HollerMonthlyCharge($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test) {
        appSubscription { id }
        confirmationUrl
        userErrors { field message }
      }
    }`,
    {
      name: charge.description,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: { price, interval: "EVERY_30_DAYS" },
          },
        },
      ],
      returnUrl,
      test,
    },
  );
  return createdCharge(
    data.appSubscriptionCreate.appSubscription?.id,
    data.appSubscriptionCreate.confirmationUrl,
    data.appSubscriptionCreate.userErrors,
  );
}

function createdCharge(
  id: string | undefined,
  confirmationUrl: string | null,
  userErrors: readonly UserError[],
) {
  if (userErrors.length || !id || !confirmationUrl) {
    console.error(
      JSON.stringify({
        event: "shopify.billing_create_failed",
        errors: userErrors.map((error) => error.message),
      }),
    );
    throw new BillingError("SHOPIFY_BILLING_FAILED", 502);
  }
  return { shopifyChargeId: id, confirmationUrl };
}

/** Current Shopify status of each charge, keyed by its GID. */
export async function readShopifyChargeStatuses(
  admin: AdminGraphqlClient,
  shopifyChargeIds: readonly string[],
): Promise<Map<string, string>> {
  if (!shopifyChargeIds.length) return new Map();
  const data = await run<{
    nodes: ({ id: string; status: string } | null)[];
  }>(
    admin,
    `#graphql
    query HollerChargeStatuses($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on AppPurchaseOneTime { id status }
        ... on AppSubscription { id status }
      }
    }`,
    { ids: shopifyChargeIds },
  );
  return new Map(
    data.nodes.flatMap((node) =>
      node?.id && node.status ? [[node.id, node.status] as const] : [],
    ),
  );
}

/** Cancels an active monthly charge; returns Shopify's new status. */
export async function cancelShopifySubscription(
  admin: AdminGraphqlClient,
  shopifyChargeId: string,
): Promise<string> {
  const data = await run<{
    appSubscriptionCancel: {
      appSubscription: { status: string } | null;
      userErrors: UserError[];
    };
  }>(
    admin,
    `#graphql
    mutation HollerCancelMonthly($id: ID!) {
      appSubscriptionCancel(id: $id) {
        appSubscription { status }
        userErrors { field message }
      }
    }`,
    { id: shopifyChargeId },
  );
  const result = data.appSubscriptionCancel;
  if (result.userErrors.length || !result.appSubscription)
    throw new BillingError("SHOPIFY_BILLING_FAILED", 502);
  return result.appSubscription.status;
}
