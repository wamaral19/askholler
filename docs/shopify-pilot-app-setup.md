# Shopify pilot app: custom distribution and protected customer data

The pilot installs Holler on one merchant's store as a **custom app**, which
skips App Store review. Shopify still requires approval to read protected
customer data (the customer's name and phone number).

## 1. Create a separate production app

`shopify.app.toml` is the development app; `shopify app dev` rewrites its URLs
to a tunnel. Keep production separate:

1. In the Partner dashboard, **Apps → Create app → Create app manually**, named
   `Holler`.
2. Locally, `npx shopify app config link` and choose the new app; save the
   config as `shopify.app.production.toml`.
3. In that file set:
   - `application_url = "https://app.withholler.com"`
   - `redirect_urls = ["https://app.withholler.com/auth/callback"]`
   - `automatically_update_urls_on_dev = false`
   - the same `[access_scopes]` and `[webhooks]` sections as
     `shopify.app.toml` (scopes `read_orders,read_products,read_customers`;
     `orders/create`, `app/uninstalled`, and the three compliance topics, all
     to `/webhooks`).
4. `npx shopify app deploy --config production` to publish the configuration.
5. In Render, set `SHOPIFY_API_KEY` (render.yaml) to the new client ID and
   `SHOPIFY_API_SECRET` to its secret.

## 2. Choose custom distribution

Partner dashboard → the app → **Distribution → Custom distribution**, enter
the pilot merchant's `*.myshopify.com` domain, and generate the install link.
This choice cannot be changed later for this app; a future public listing
needs a new app.

## 3. Request protected customer data access

Partner dashboard → the app → **API access → Protected customer data access**.

Select **Protected customer data**, then only these fields:

- **Name** (first name, used to greet the customer)
- **Phone** (to place the research call)

Do not request email or address.

Suggested answers for "why does your app need this data":

> Holler conducts brand-commissioned customer research. After a customer
> places an order, a Holler researcher may call them to ask how they
> discovered the brand and why they purchased. The phone number is needed to
> place that call and the first name to greet them. Only customers the
> merchant targets are contacted, and customers without a phone or who opted
> out are never called.

For the data protection questions, the implemented controls are:

| Requirement                      | How Holler meets it                                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process only the minimum data    | Only phone and first name are stored; other customer fields in the order payload are discarded.                                                                                                                                                                                        |
| Tell merchants what data is used | Stated in the pilot agreement and the app listing's privacy details.                                                                                                                                                                                                                   |
| Respect consent and opt-out      | Opted-out customers are marked suppressed and never queued again.                                                                                                                                                                                                                      |
| Encrypt data at rest             | Phone and name are envelope-encrypted with Google Cloud KMS (AES-256-GCM, per-record data keys bound to merchant and customer); the database and backups are also encrypted by Render.                                                                                                 |
| Encrypt in transit               | TLS everywhere (Render, Twilio, Cloudflare R2, Google APIs).                                                                                                                                                                                                                           |
| Retention                        | Phone and name deleted 90 days after the latest order; call recordings after 30 days (hourly automated sweep).                                                                                                                                                                         |
| Access control                   | Staff sign in with Google Workspace accounts that require 2-step verification; access is granted per merchant and role, and revocation takes effect on the next request. A phone number is only revealed to the researcher who has claimed that customer, and every reveal is audited. |
| Logging without personal data    | Logs carry IDs and outcome codes only; no phone, name, or payload bodies.                                                                                                                                                                                                              |
| Deletion on request              | `customers/redact` and `shop/redact` webhooks queue automatic erasure (contact data, recordings, free-text notes); `customers/data_request` alerts an operator, who responds within 30 days.                                                                                           |
| Incident response                | See `docs/mvp-security-operations-runbook.md`.                                                                                                                                                                                                                                         |

Also provide the privacy policy URL (`https://withholler.com/privacy`, which
must exist before submitting) and a security contact.

## 4. Verify on a development store first

Before sending the install link, install the production-configured app on a
development store and run the checks in the README ("For a real
development-store check"), then send a test `customers/redact` from the
Partner dashboard and confirm a `deletion_requests` row appears and the
worker's next hourly sweep completes it.
