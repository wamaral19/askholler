import { useLoaderData, type LoaderFunctionArgs } from "react-router";

import { ChargeSummary, PlanGrid } from "../components/merchant-billing";
import { listMerchantCharges } from "../lib/merchant-billing.server";
import { formatChargeAmount } from "../lib/merchant-charges";
import { authenticatePortalMerchant } from "../lib/merchant-portal-auth.server";
import { getShopifyIngestionDatabase } from "../lib/shopify-ingestion.server";

/**
 * Billing in the portal is read-only. Approving a charge goes through
 * Shopify Billing, which only works inside Shopify admin; merchants without
 * the app installed are invoiced directly.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { context } = await authenticatePortalMerchant(request);
  const charges = await listMerchantCharges(
    getShopifyIngestionDatabase(),
    context.merchantId,
  );
  return {
    charges: charges.map((charge) => ({
      ...charge,
      amount: formatChargeAmount(charge),
    })),
  };
}

export default function PortalBilling() {
  const { charges } = useLoaderData<typeof loader>();
  const pending = charges.filter((charge) => charge.status === "pending");
  const history = charges.filter((charge) => charge.status !== "pending");
  return (
    <>
      <header className="shopify-app__header">
        <p className="eyebrow">Billing</p>
        <h1>Pricing & billing</h1>
        <p>
          Holler bills per project or monthly, as agreed with you. Nothing is
          charged until you approve it.
        </p>
      </header>
      <PlanGrid />

      <section className="sheet-section">
        <header className="sheet-section__header">
          <h2>Waiting for your approval</h2>
        </header>
        {pending.length ? (
          <>
            <ul className="merchant-charges">
              {pending.map((charge) => (
                <li
                  className="shopify-app__card merchant-charge"
                  key={charge.id}
                >
                  <ChargeSummary charge={charge} />
                </li>
              ))}
            </ul>
            <p className="sheet-note">
              Approve these from Holler in your Shopify admin, or reply to
              Holler&rsquo;s email and we&rsquo;ll invoice you directly.
            </p>
          </>
        ) : (
          <p className="sheet-empty">
            No charges waiting. When Holler scopes a project or a monthly plan
            with you, it will appear here.
          </p>
        )}
      </section>

      <section className="sheet-section">
        <header className="sheet-section__header">
          <h2>History</h2>
        </header>
        {history.length ? (
          <ul className="merchant-charges">
            {history.map((charge) => (
              <li className="shopify-app__card merchant-charge" key={charge.id}>
                <ChargeSummary charge={charge} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="sheet-empty">No past charges.</p>
        )}
      </section>
    </>
  );
}
