import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import {
  applyShopifyChargeStatus,
  getMerchantCharge,
  listMerchantCharges,
  recordShopifyCharge,
} from "../lib/merchant-billing.server";
import {
  BillingError,
  chargeKindLabels,
  chargesToReconcile,
  chargeStatusLabels,
  formatChargeAmount,
  type MerchantCharge,
} from "../lib/merchant-charges";
import { authenticateMerchant } from "../lib/merchant-context.server";
import {
  cancelShopifySubscription,
  createShopifyCharge,
  readShopifyChargeStatuses,
  usesTestCharges,
} from "../lib/shopify-billing.server";
import { getShopifyIngestionDatabase } from "../lib/shopify-ingestion.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, context } = await authenticateMerchant(request);
  const db = getShopifyIngestionDatabase();
  let charges = await listMerchantCharges(db, context.merchantId);
  // Webhooks keep statuses current; this catches any the page beat.
  const open = chargesToReconcile(charges);
  if (open.length) {
    const statuses = await readShopifyChargeStatuses(
      admin,
      open.map((charge) => charge.shopifyChargeId!),
    ).catch(() => new Map<string, string>());
    for (const charge of open) {
      const status = statuses.get(charge.shopifyChargeId!);
      if (status)
        await applyShopifyChargeStatus(
          db,
          context.merchantId,
          charge.shopifyChargeId!,
          status,
        );
    }
    if (statuses.size)
      charges = await listMerchantCharges(db, context.merchantId);
  }
  return {
    charges: charges.map((charge) => ({
      ...charge,
      amount: formatChargeAmount(charge),
    })),
  };
}

const actionErrors: Record<string, string> = {
  CHARGE_NOT_FOUND: "That charge no longer exists.",
  CHARGE_NOT_PENDING: "That charge has already been handled.",
  SHOPIFY_BILLING_FAILED:
    "Shopify could not process this charge. Try again in a minute, or email wyatt@withholler.com.",
};

export async function action({ request }: ActionFunctionArgs) {
  const { admin, context, redirect, session } =
    await authenticateMerchant(request);
  const db = getShopifyIngestionDatabase();
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    const charge = await getMerchantCharge(
      db,
      context.merchantId,
      String(form.get("chargeId") ?? ""),
    );
    if (intent === "approve") {
      if (charge.status !== "pending")
        throw new BillingError("CHARGE_NOT_PENDING", 409);
      const created = await createShopifyCharge(
        admin,
        charge,
        // Shopify sends the merchant back into the app inside admin.
        `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing`,
        await usesTestCharges(admin),
      );
      await recordShopifyCharge(
        db,
        context.merchantId,
        charge.id,
        created.shopifyChargeId,
      );
      return redirect(created.confirmationUrl, { target: "_top" });
    }
    if (intent === "cancel") {
      if (charge.kind !== "monthly" || charge.status !== "active")
        throw new BillingError("CHARGE_NOT_PENDING", 409);
      const status = await cancelShopifySubscription(
        admin,
        charge.shopifyChargeId!,
      );
      await applyShopifyChargeStatus(
        db,
        context.merchantId,
        charge.shopifyChargeId!,
        status,
      );
      return { cancelled: true };
    }
    throw new Response("Unsupported action", { status: 400 });
  } catch (thrown) {
    if (thrown instanceof BillingError)
      return {
        error: actionErrors[thrown.code] ?? "Could not update billing.",
      };
    throw thrown;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function Billing() {
  const { charges } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const pending = charges.filter((charge) => charge.status === "pending");
  const history = charges.filter((charge) => charge.status !== "pending");

  return (
    <>
      <header className="shopify-app__header">
        <p className="eyebrow">Billing</p>
        <h1>Pricing & billing</h1>
        <p>
          Holler bills per project or monthly, as agreed with you. Each charge
          appears here for you to approve, and is then added to your Shopify
          bill. Nothing is charged until you approve it.
        </p>
      </header>
      <section
        aria-label="Available engagements"
        className="merchant-plan-grid"
      >
        <article className="shopify-app__card">
          <p className="eyebrow">Monthly subscription</p>
          <h2>From $1,000 / month</h2>
          <p>
            25 completed interviews, up to two hours of consented recorded
            research, a monthly report, and a quarterly long-form synthesis.
          </p>
        </article>
        <article className="shopify-app__card">
          <p className="eyebrow">Standalone Research Run</p>
          <h2>From $3,500</h2>
          <p>
            At least 50 completed interviews, at least three hours of consented
            recorded research, and one evidence-backed report.
          </p>
        </article>
      </section>
      {result && "error" in result ? (
        <p className="save-notice save-notice--error" role="alert">
          {result.error}
        </p>
      ) : null}

      <section className="sheet-section">
        <header className="sheet-section__header">
          <h2>Waiting for your approval</h2>
        </header>
        {pending.length ? (
          <ul className="merchant-charges">
            {pending.map((charge) => (
              <li className="shopify-app__card merchant-charge" key={charge.id}>
                <ChargeSummary charge={charge} />
                <Form method="post">
                  <input name="chargeId" type="hidden" value={charge.id} />
                  <button
                    className="button button-primary"
                    disabled={busy}
                    name="intent"
                    type="submit"
                    value="approve"
                  >
                    Review and approve
                  </button>
                </Form>
              </li>
            ))}
          </ul>
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
                {charge.kind === "monthly" && charge.status === "active" ? (
                  <Form
                    method="post"
                    onSubmit={(event) => {
                      if (
                        !window.confirm(
                          `Cancel “${charge.description}”? Monthly billing stops right away.`,
                        )
                      )
                        event.preventDefault();
                    }}
                  >
                    <input name="chargeId" type="hidden" value={charge.id} />
                    <button
                      className="button button-quiet"
                      disabled={busy}
                      name="intent"
                      type="submit"
                      value="cancel"
                    >
                      Cancel monthly plan
                    </button>
                  </Form>
                ) : null}
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

function ChargeSummary({
  charge,
}: {
  charge: MerchantCharge & { amount: string };
}) {
  return (
    <div>
      <h3>{charge.description}</h3>
      <p className="merchant-run__meta">
        {chargeKindLabels[charge.kind]} · <strong>{charge.amount}</strong> ·{" "}
        {chargeStatusLabels[charge.status]}
        {charge.decidedAt
          ? ` ${dateFormat.format(new Date(charge.decidedAt))}`
          : ` · added ${dateFormat.format(new Date(charge.createdAt))}`}
      </p>
    </div>
  );
}
