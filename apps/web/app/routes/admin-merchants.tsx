import { Form, useActionData, useLoaderData } from "react-router";

import { AppShell } from "../components/app-shell";
import {
  MerchantAdminError,
  createMerchant,
  listManagedMerchants,
} from "../lib/merchant-admin.server";
import {
  MerchantPortalError,
  getMerchantPortalDirectory,
  normalizeLoginDomain,
} from "../lib/merchant-portal-auth.server";
import {
  executeOperationsRequest,
  getTenantContext,
  usesOidcWorkforceAuth,
} from "../lib/operations-service.server";
import { getShopifyIngestionDatabase } from "../lib/shopify-ingestion.server";

async function merchantOperator(request: Request) {
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
    const context = await merchantOperator(request);
    return {
      merchants: await listManagedMerchants(
        getShopifyIngestionDatabase(),
        context.merchantIds,
      ),
      timezones: Intl.supportedValuesOf("timeZone"),
    };
  });
}

const errorMessages: Record<string, string> = {
  MERCHANT_NAME_INVALID: "Enter the store's name (up to 100 characters).",
  MERCHANT_SHOP_DOMAIN_INVALID:
    "Enter the store's .myshopify.com address, e.g. acme.myshopify.com.",
  MERCHANT_TIMEZONE_INVALID: "Choose the store's timezone from the list.",
  MERCHANT_EXISTS:
    "A merchant with that .myshopify.com address already exists.",
  PORTAL_DOMAIN_INVALID:
    "Enter a company email domain like acme.com. Shared providers such as gmail.com can't be used.",
  PORTAL_DOMAIN_TAKEN:
    "That email domain already signs in to another merchant.",
  PORTAL_MERCHANT_NOT_FOUND: "That merchant no longer exists.",
};

export async function action({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await merchantOperator(request);
    const db = getShopifyIngestionDatabase();
    const form = await request.formData();
    const intent = form.get("intent");
    const field = (name: string) => String(form.get(name) ?? "").trim();
    try {
      if (intent === "create") {
        const loginDomain = field("loginDomain");
        // Check the domain's format before creating anything.
        if (loginDomain) normalizeLoginDomain(loginDomain);
        const merchantId = await createMerchant(
          db,
          {
            name: field("name"),
            shopDomain: field("shopDomain"),
            timezone: field("timezone"),
          },
          {
            actorId: context.researcherId,
            workforceUserId: usesOidcWorkforceAuth()
              ? context.researcherId
              : null,
            roles: context.roles,
          },
        );
        try {
          if (loginDomain)
            await getMerchantPortalDirectory().addDomain(
              merchantId,
              loginDomain,
            );
        } catch (thrown) {
          if (!(thrown instanceof MerchantPortalError)) throw thrown;
          return {
            created: field("name"),
            error: `Merchant created, but its sign-in domain wasn't added. ${errorMessages[thrown.code] ?? thrown.code}`,
          };
        }
        return { created: field("name") };
      }
      // Domain changes are limited to merchants this person can work on.
      const merchantId = field("merchantId");
      if (!context.merchantIds.includes(merchantId))
        throw Response.json(
          { error: { code: "MERCHANT_ACCESS_DENIED" } },
          { status: 403 },
        );
      if (intent === "add_domain") {
        await getMerchantPortalDirectory().addDomain(
          merchantId,
          field("domain"),
        );
        return { domainAdded: true };
      }
      if (intent === "remove_domain") {
        const domain = normalizeLoginDomain(field("domain"));
        const merchant = (await listManagedMerchants(db, [merchantId]))[0];
        if (!merchant?.loginDomains.includes(domain))
          throw Response.json(
            { error: { code: "MERCHANT_ACCESS_DENIED" } },
            { status: 403 },
          );
        await getMerchantPortalDirectory().removeDomain(domain);
        return { domainRemoved: true };
      }
    } catch (thrown) {
      if (
        thrown instanceof MerchantAdminError ||
        thrown instanceof MerchantPortalError
      )
        return { error: errorMessages[thrown.code] ?? thrown.code };
      throw thrown;
    }
    throw new Response("Unsupported action", { status: 400 });
  });
}

export function meta() {
  return [{ title: "Merchant creation · Holler" }];
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function AdminMerchantsRoute() {
  const { merchants, timezones } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const created = result && "created" in result ? result.created : null;
  const error = result && "error" in result ? result.error : null;

  return (
    <AppShell
      eyebrow="Admin"
      title="Merchant creation"
      description="Add a store that sends orders to Holler through store webhooks. Its people can then sign in to the merchant portal with their company Google account."
    >
      <Form className="panel billing-form" key={created ?? "new"} method="post">
        <input name="intent" type="hidden" value="create" />
        <div className="form-grid two-column">
          <label>
            <span>Store name</span>
            <input
              maxLength={100}
              name="name"
              placeholder="e.g. Hollow Peak Outfitters"
              required
            />
          </label>
          <label>
            <span>Shopify address</span>
            <input
              name="shopDomain"
              placeholder="acme.myshopify.com"
              required
            />
          </label>
          <label>
            <span>Timezone</span>
            <select defaultValue="America/New_York" name="timezone">
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Portal sign-in domain (optional)</span>
            <input name="loginDomain" placeholder="acme.com" />
          </label>
        </div>
        <p className="helper-copy">
          Use the store&rsquo;s .myshopify.com address, not its public website:
          store webhooks and Shopify installs find the merchant by it. Anyone
          signed in to Google Workspace at the sign-in domain sees this
          merchant&rsquo;s research in the portal.
        </p>
        <button className="button button-primary" type="submit">
          Create merchant
        </button>
        {error ? (
          <p className="save-notice save-notice--error" role="alert">
            {error}
          </p>
        ) : created ? (
          <p className="save-notice" role="status">
            {created} is ready. Switch to it from the merchant menu, then add
            its store webhooks and signing key.
          </p>
        ) : null}
      </Form>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your merchants</p>
            <h2>Merchants</h2>
          </div>
        </div>
        {merchants.length ? (
          <table className="charges-table merchants-table">
            <thead>
              <tr>
                <th scope="col">Store</th>
                <th scope="col">Shopify address</th>
                <th scope="col">Orders</th>
                <th scope="col">Portal sign-in</th>
                <th scope="col">Added</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((merchant) => (
                <tr key={merchant.id}>
                  <td>
                    <strong>{merchant.name}</strong>
                    <small className="merchants-table__meta">
                      {merchant.timezone}
                    </small>
                  </td>
                  <td>{merchant.shopDomain ?? "—"}</td>
                  <td>
                    {merchant.status !== "active" ? (
                      <span className="status-pill status-completed">
                        {merchant.status}
                      </span>
                    ) : merchant.installedAt ? (
                      <span className="status-pill status-live">Receiving</span>
                    ) : (
                      <span className="status-pill status-draft">
                        Waiting for first order
                      </span>
                    )}
                  </td>
                  <td>
                    <ul className="merchants-table__domains">
                      {merchant.loginDomains.map((domain) => (
                        <li key={domain}>
                          <span>{domain}</span>
                          <Form
                            method="post"
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  `Remove ${domain}? Everyone signed in from it loses portal access right away.`,
                                )
                              )
                                event.preventDefault();
                            }}
                          >
                            <input
                              name="intent"
                              type="hidden"
                              value="remove_domain"
                            />
                            <input
                              name="merchantId"
                              type="hidden"
                              value={merchant.id}
                            />
                            <input name="domain" type="hidden" value={domain} />
                            <button
                              aria-label={`Remove ${domain}`}
                              className="text-button danger-text"
                              type="submit"
                            >
                              Remove
                            </button>
                          </Form>
                        </li>
                      ))}
                    </ul>
                    <Form className="merchants-table__add" method="post">
                      <input name="intent" type="hidden" value="add_domain" />
                      <input
                        name="merchantId"
                        type="hidden"
                        value={merchant.id}
                      />
                      <input
                        aria-label={`Add a sign-in domain for ${merchant.name}`}
                        name="domain"
                        placeholder="acme.com"
                        required
                      />
                      <button className="button button-small" type="submit">
                        Add
                      </button>
                    </Form>
                  </td>
                  <td>{dateFormat.format(new Date(merchant.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="inline-notice">No merchants yet.</p>
        )}
      </section>
    </AppShell>
  );
}
