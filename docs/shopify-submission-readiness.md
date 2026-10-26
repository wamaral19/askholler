# Shopify submission readiness

Last audited: 2026-10-23

This file separates controls that the repository proves from controls that must
be verified in Shopify, Render, Google, Cloudflare, Twilio, or R2. Passing local
checks is not evidence that an external control is enabled.

## Verified in the repository

- Production Shopify configuration validates with Shopify CLI.
- Embedded merchant routes authenticate through Shopify's official React
  Router package and App Bridge.
- The app requests `read_orders`; protected customer fields are allowlisted and
  phone, first name, and locality are envelope-encrypted before persistence.
- Locality is limited to city and state/province and is used for local-time
  calling-window safety. Street lines, postal codes, and email are discarded.
- Webhook authentication runs before trusted processing. Delivery IDs and
  normalized event identities have database uniqueness guards.
- Mandatory privacy topics and `app/uninstalled` are configured. Redaction
  requests are durable and the worker runs an hourly deletion/retention sweep.
- Merchant access is tenant-scoped. Merchant viewers cannot enter the workforce
  queue, reveal phones, or edit completed research.
- Shopify Billing API mutations create one-time and recurring charges;
  merchants can cancel an active monthly subscription.
- The public privacy policy, pricing page, and synthetic sample report have no
  separate login requirement.
- The production dependency audit reports no known vulnerabilities; typecheck,
  unit tests, and production builds are required by CI. The full development
  audit still reports four moderate `esbuild` findings nested under
  `drizzle-kit`; npm offers only a breaking forced downgrade, so keep the local
  development server private and track an upstream tooling upgrade.

## Must be verified externally before submission

- [ ] Partner Dashboard protected-customer-data request selects Protected
      customer data plus Name, Phone, and Address, with the narrow purposes in
      `docs/shopify-pilot-app-setup.md`.
- [ ] Partner Dashboard grants `read_all_orders`; only then add the scope to the
      production and development TOML files.
- [ ] A production-app install on a development store completes OAuth, opens
      `/app`, receives real Shopify webhook deliveries, rejects an invalid
      signature, deduplicates a replay, and reinstalls cleanly.
- [ ] Google Workspace requires 2-Step Verification for every workforce user;
      the production OAuth client and redirect URL are correct.
- [ ] The production Cloud KMS key and least-privilege service account exist;
      a rotation/decryption drill has passed.
- [ ] Render has every `sync: false` secret, runs both web and worker services,
      and has an alert for privacy-sweep failures or overdue requests.
- [ ] R2 is private, its lifecycle/backup policy matches the retention schedule,
      and recording deletion has been exercised.
- [ ] Twilio signature validation, consent-gated recording, transfer to R2, and
      deletion of the provider copy have been exercised.
- [ ] Shopify offline session/access tokens are encrypted at rest or an
      equivalent reviewed secret-storage control is implemented.
- [ ] Session revocation, membership removal, backup expiry, incident response,
      and legal-hold ownership have named owners and completed drills.
- [ ] An independent security reviewer has accepted or remediated the remaining
      findings.

## Reviewer-store path

Use only a dedicated reviewer/development store. Install the production app,
then run the guarded `shopify:seed-reviewer` command documented in
`docs/shopify-pilot-app-setup.md`. It adds database-backed, explicitly synthetic
run/request state without creating customer PII. Give the reviewer exact steps
for the sample report, request form, pricing/billing page, and a $1 Shopify test
charge.

## Historical-data gate

Historical analytics are part of Holler's product promise. `read_orders` alone
is a 60-day window. Submission copy must not claim full history until
`read_all_orders` is approved and a GraphQL bulk import records coverage,
progress, failures, and completion. Webhooks continue to handle new orders
during and after the import.
