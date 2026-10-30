import { Form, useActionData, useLoaderData } from "react-router";

import { AppShell } from "../components/app-shell";
import {
  createMerchantCharge,
  listMerchantCharges,
  withdrawMerchantCharge,
} from "../lib/merchant-billing.server";
import {
  BillingError,
  chargeKindLabels,
  chargeStatusLabels,
  formatChargeAmount,
  parseDollarAmount,
  type ChargeKind,
} from "../lib/merchant-charges";
import {
  executeOperationsRequest,
  getTenantContext,
} from "../lib/operations-service.server";
import { getShopifyIngestionDatabase } from "../lib/shopify-ingestion.server";

async function billingOperator(request: Request) {
  const context = await getTenantContext(request);
  if (!context.roles.includes("platform_admin"))
    throw Response.json(
      { error: { code: "PLATFORM_ADMIN_REQUIRED" } },
      { status: 403 },
    );
  return context;
}

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await billingOperator(request);
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
  });
}

const actionErrors: Record<string, string> = {
  INVALID_CHARGE:
    "Enter a description (up to 100 characters) and an amount between $0.01 and $100,000.",
  CHARGE_NOT_PENDING:
    "Only charges the merchant hasn't approved yet can be withdrawn.",
};

export async function action({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await billingOperator(request);
    const db = getShopifyIngestionDatabase();
    const form = await request.formData();
    try {
      if (form.get("intent") === "create") {
        const kind = form.get("kind");
        const amountMinor = parseDollarAmount(String(form.get("amount") ?? ""));
        if ((kind !== "one_time" && kind !== "monthly") || amountMinor === null)
          throw new BillingError("INVALID_CHARGE", 400);
        await createMerchantCharge(db, {
          merchantId: context.merchantId,
          kind: kind as ChargeKind,
          description: String(form.get("description") ?? ""),
          amountMinor,
          createdBy: context.researcherId,
        });
        return { created: true };
      }
      if (form.get("intent") === "withdraw") {
        await withdrawMerchantCharge(
          db,
          context.merchantId,
          String(form.get("chargeId") ?? ""),
        );
        return { withdrawn: true };
      }
    } catch (thrown) {
      if (thrown instanceof BillingError)
        return { error: actionErrors[thrown.code] ?? thrown.code };
      throw thrown;
    }
    throw new Response("Unsupported action", { status: 400 });
  });
}

export function meta() {
  return [{ title: "Billing · Holler" }];
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function AdminBillingRoute() {
  const { charges } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  return (
    <AppShell
      eyebrow="Admin"
      title="Billing"
      description="Raise a custom charge for the selected merchant. They approve it in the Holler app inside Shopify admin, and Shopify adds it to their bill."
    >
      <Form method="post" className="panel billing-form" key={charges.length}>
        <input name="intent" type="hidden" value="create" />
        <div className="form-grid two-column">
          <label className="full-span">
            <span>Description (the merchant sees this)</span>
            <input
              maxLength={100}
              name="description"
              placeholder="e.g. Repeat-purchase research, Q4"
              required
            />
          </label>
          <label>
            <span>Billing</span>
            <select defaultValue="one_time" name="kind">
              <option value="one_time">Project (one-time)</option>
              <option value="monthly">Monthly (recurring every 30 days)</option>
            </select>
          </label>
          <label>
            <span>Amount (USD)</span>
            <input
              inputMode="decimal"
              name="amount"
              placeholder="5000"
              required
            />
          </label>
        </div>
        <button className="button button-primary" type="submit">
          Send to merchant for approval
        </button>
        {result && "error" in result ? (
          <p className="save-notice save-notice--error" role="alert">
            {result.error}
          </p>
        ) : result && "created" in result ? (
          <p className="save-notice">
            Sent. It waits on the merchant’s Billing page until they approve.
          </p>
        ) : null}
      </Form>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">This merchant</p>
            <h2>Charges</h2>
          </div>
        </div>
        {charges.length ? (
          <table className="charges-table">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Billing</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Added</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => (
                <tr key={charge.id}>
                  <td>{charge.description}</td>
                  <td>{chargeKindLabels[charge.kind]}</td>
                  <td>{charge.amount}</td>
                  <td>{chargeStatusLabels[charge.status]}</td>
                  <td>{dateFormat.format(new Date(charge.createdAt))}</td>
                  <td>
                    {charge.status === "pending" ? (
                      <Form method="post">
                        <input name="intent" type="hidden" value="withdraw" />
                        <input
                          name="chargeId"
                          type="hidden"
                          value={charge.id}
                        />
                        <button
                          className="text-button danger-text"
                          type="submit"
                        >
                          Withdraw
                        </button>
                      </Form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="inline-notice">No charges for this merchant yet.</p>
        )}
      </section>
    </AppShell>
  );
}
