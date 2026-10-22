# Shopify app: public unlisted distribution

Holler is distributed as a **public app with an unlisted App Store listing**.
Unlisted hides the app from App Store search and categories; it still goes
through full App Store review, and merchants install it from the listing link
we send them. Shopify also separately approves access to protected customer
data (the customer's name and phone number).

Merchants never see how research is done. The product is the report; the
embedded app exists because Shopify requires every App Store app to be usable
through a UI inside Shopify admin (requirements 2.1.3 and 2.2.2) and to take
payment through Shopify (1.2.1).

## 1. Production and development apps

The existing Partner app (client ID `44aa3b7648ef2fd87327306c7035e3ae`, the
one in `render.yaml`) is the **production** app. Development uses a separate
app so `shopify app dev` can never rewrite production URLs.

`shopify.app.toml` (production) points at `https://app.withholler.com` with
`automatically_update_urls_on_dev = false`. `shopify.app.dev.toml` (`Holler
Dev`) has the same `[access_scopes]` and `[webhooks]` (section 2); keep the
two in step.

1. Partner dashboard → **Apps → Create app → Create app manually**, named
   `Holler Dev`. Copy its client ID into `client_id` in
   `shopify.app.dev.toml`.
2. In `Holler Dev` → **API access → Protected customer data access**, select
   **Name** and **Phone** (section 5). Development stores need no review, but
   without this Shopify leaves name and phone out of order webhooks.
3. `npx shopify app config use dev`, so a plain `shopify app dev` also uses
   the dev app.
4. `npx shopify app dev --config dev --store <dev store>.myshopify.com`. The
   CLI points `Holler Dev` at a tunnel and installs it on the store.
5. Production, once Render runs the matching code:
   `npx shopify app deploy --config shopify.app.toml`. Render already holds
   the production `SHOPIFY_API_KEY`; confirm `SHOPIFY_API_SECRET` is this
   app's secret.

Never run `shopify app dev` against `shopify.app.toml`.

## 2. Scopes and webhooks

- **Scopes:** `read_orders` only. Holler makes no Admin API calls; it learns
  everything from order webhooks. Shopify requires apps to request only the
  scopes they use (3.2), so `read_products` and `read_customers` are dropped.
  Section 6 checks that order payloads still carry the customer's name and
  phone after the change; if they don't, restore `read_customers` and say why
  in the review notes.
- **Webhooks**, all to `/webhooks`:
  - `orders/create`, which ingests and may queue the order for research.
  - `orders/updated`, which keeps refunds and payment status current on the
    call sheet and never queues an order.
  - `app/uninstalled`, which deletes stored sessions and puts unpaid and
    monthly charges back to awaiting approval.
  - `app_subscriptions/update` and `app_purchases_one_time/update`, which
    record when a merchant approves, declines, or cancels a charge.
  - the compliance topics `customers/data_request`, `customers/redact`, and
    `shop/redact`.

`authenticate.webhook` verifies the HMAC and rejects invalid signatures with
401, which Shopify's automated checks test.

## 3. Billing

Every charge goes through the Shopify Billing API (manual pricing). Clients
billed directly before the app was listed may stay on their existing terms.
Bills are custom, per project or per month; there is no per-call pricing.

1. Staff open **Admin → Billing** in the workforce tool (platform admins
   only), with the merchant selected in the sidebar, and enter a description
   the merchant will see, the amount in USD, and **Project (one-time)** or
   **Monthly (recurring every 30 days)**. The charge is saved as awaiting
   approval; nothing is sent to Shopify yet. A charge can be withdrawn until
   the merchant approves it.
2. The merchant sees it on **Billing** in the app and chooses **Review and
   approve**. Holler then creates the Shopify charge
   (`appPurchaseOneTimeCreate` or `appSubscriptionCreate`) and sends the
   merchant to Shopify's approval page, where they approve or decline.
   Shopify returns them to the Billing page.
3. Shopify's billing webhooks, plus a check each time the Billing page loads,
   keep the status current: paid (project), active (monthly), declined, or
   cancelled. An approval page that expires puts the charge back to awaiting
   approval.
4. The merchant can cancel an active monthly plan from Billing (1.2.3).
   Approving a new monthly charge replaces the current one, because Shopify
   allows one active subscription per app.
5. Uninstalling cancels Shopify subscriptions, so on reinstall every unpaid
   or monthly charge asks for approval again (1.2.2).

Development stores, including reviewers', only accept test charges; Holler
detects them through the shop's plan. Set `SHOPIFY_BILLING_TEST=true` to
force test charges everywhere.

Shopify keeps a revenue share (0% on the first US$1M of lifetime app revenue,
then 15%).

## 4. Embedded app (what merchants and reviewers see)

Install opens Shopify's permission screen, then lands on `/app` inside Shopify
admin. Merchants and reviewers never see the workforce tool, which stays
behind Google sign-in limited to `withholler.com` accounts. The app's pages
are in Shopify admin's sidebar and in tabs at the top of each page:

1. **Research runs** (`/app`, the landing page): completed angles with when
   they finished, how many interviews they include, and **View report**,
   which opens the run's report link. Staff set that link on the completed
   angle under **Live angles**. Until it's set the run shows "Report in
   progress". Reports are also emailed.
2. **Raw research** (`/app/calls`): every finished call, as on Completed
   calls in the workforce tool, each with its recording, transcript, and the
   researcher's tags and notes. It is read-only. Phone numbers and customer
   names are never shown, and every recording playback is audited.
3. **Request an angle** (`/app/angles/new`): the Angle Builder form. Sending
   it saves a draft angle marked "Requested by merchant" under **Live
   angles**; nothing goes live and no one is notified. New questions the
   merchant adds are saved to that merchant's field library.
4. **Billing** (`/app/billing`): section 3.

Every page has an empty state for a fresh install.

In code, a Shopify admin session acts as a "merchant viewer"
(`viewer: "merchant"` on the tenant context). The operations service refuses
it everywhere except the read paths and angle requests listed above.

## 5. Protected customer data access

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
| Tell merchants what data is used | Stated in the app listing's privacy details and the client agreement.                                                                                                                                                                                                                  |
| Respect consent and opt-out      | Opted-out customers are marked suppressed and never queued again.                                                                                                                                                                                                                      |
| Encrypt data at rest             | Phone and name are envelope-encrypted with Google Cloud KMS (AES-256-GCM, per-record data keys bound to merchant and customer); the database and backups are also encrypted by Render.                                                                                                 |
| Encrypt in transit               | TLS everywhere (Render, Twilio, Cloudflare R2, Google APIs).                                                                                                                                                                                                                           |
| Retention                        | Phone and name deleted 90 days after the latest order; call recordings after 180 days (hourly automated sweep).                                                                                                                                                                        |
| Access control                   | Staff sign in with Google Workspace accounts that require 2-step verification; access is granted per merchant and role, and revocation takes effect on the next request. A phone number is only revealed to the researcher who has claimed that customer, and every reveal is audited. |
| Logging without personal data    | Logs carry IDs and outcome codes only; no phone, name, or payload bodies.                                                                                                                                                                                                              |
| Deletion on request              | `customers/redact` and `shop/redact` webhooks queue automatic erasure (contact data, recordings, free-text notes); `customers/data_request` alerts an operator, who responds within 30 days.                                                                                           |
| Incident response                | See `docs/mvp-security-operations-runbook.md`.                                                                                                                                                                                                                                         |

Also provide the privacy policy URL (`https://withholler.com/privacy`) and a
security contact.

## 6. Verify on a development store first

Install the **production** app on a development store from its install link,
not through `shopify app dev`, so you test exactly what reviewers will install.

1. Approve the permission screen and confirm you land on `/app` in admin.
2. Place a synthetic test order whose customer has a name and phone. Confirm
   the order is ingested and the encrypted contact fields are stored.
3. In **Admin → Billing**, create a project charge and a monthly charge for
   the store. Approve one and decline the other from the app's Billing page,
   cancel the monthly plan, then reinstall and confirm unpaid charges ask
   for approval again.
4. Complete an angle, set its report link under **Live angles**, and confirm
   it appears on **Research runs** with the link. Open a finished call under
   **Raw research** and play its recording.
5. Send an angle request and confirm it appears as a "Requested by merchant"
   draft under **Live angles**.
6. From the Partner dashboard, send a test `customers/redact`. Confirm a
   `deletion_requests` row appears and the worker's next hourly sweep
   completes it.
7. Uninstall and confirm the stored sessions are removed. Reinstall and
   confirm OAuth runs again before anything else.

## 7. Listing and submission

Partner dashboard → the app → **Distribution → Shopify App Store**, then
create the listing:

- name, 1200×1200 icon, tagline, and description;
- 1600×900 screenshots of the embedded app;
- pricing details matching section 3;
- support email (`wyatt@withholler.com`), privacy policy URL, and an
  emergency developer contact;
- a screencast (4.5.3) showing install, Research runs with a report, Raw
  research with a call, sending an angle request, and approving a charge;
- testing instructions (4.5.4). Merchants have no separate Holler login, so
  no credentials are needed. Explain that research calls are carried out by
  Holler staff after orders arrive. A reviewer's fresh store has no research
  and no charges. After they install, grant yourself access to their store
  (`npm run workforce -- grant you@withholler.com <merchantId> platform_admin`;
  the merchant ID is derived from the shop domain, see `shopifyMerchantId`),
  then add a $1 test project charge for it under **Admin → Billing**. Say in
  the notes that the charge will be there, and rely on the screencast for
  research runs and raw research.

Set listing visibility to **Unlisted**, run the pre-submission checks, and
submit. Expect reviewers to ask how customers consent to being called. The
answer: only orders the merchant targets are called, opt-outs are suppressed,
and contact data is deleted after 90 days.

After approval, send merchants the listing link to install.
