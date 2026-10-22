# Sales demo

The demo console (`/demo`) sets up a prospect's own store in the development
environment in about a minute. You enter their website. Holler reads their company
name and best sellers, then seeds months of synthetic orders in which one product
has an outsized repeat purchase rate. It publishes an angle and a script asking
why, and keeps the research queue full with live orders. You then put the
prospect in the queue with their own phone number and call them as if they were
their customer.

It is development-only. The console, its routes, and the sidebar link do not
exist unless `HOLLER_DEMO_MODE=enabled`, and they never exist when
`NODE_ENV=production`.

## One-time setup

1. Run `npm run db:migrate` to create `demo_sessions`.
2. Add these to `.env.local`:

   ```sh
   HOLLER_DEMO_MODE=enabled
   HOLLER_OPERATIONS_MODE=synthetic-postgres   # fictional customers use synthetic contacts
   PII_KMS_KEY_ID=...                          # encrypts the prospect's phone
   # plus the TWILIO_* settings and an https APP_BASE_URL tunnel used for live calls
   ```

3. Give your workforce session the `platform_admin` role and add the demo
   workspace to its `merchantIds` in `HOLLER_SYNTHETIC_WORKFORCE_SESSIONS`. The
   demo workspace is always the same merchant:

   ```text
   9b65bfc1-d65f-71da-8caa-78814209364d   (holler-sales-demo.myshopify.com)
   ```

4. Restart the dev server. The console's readiness panel lists anything that's
   still missing.

The worker does not need to be running. The demo qualifies its own orders
inline, and a running worker finds that work already done.

## Running a demo

1. **Website.** Enter the prospect's site and select **Look up**. Shopify stores
   return their name and up to 12 best sellers. Other platforms fall back to the
   product markup on their home page; if that finds nothing, select **Enter by
   hand**. You can edit names, SKUs, and prices. Pick the product with the high
   repeat rate. The default is the second best seller, which makes the point that
   the product customers come back for isn't always the one they buy most.
2. **Start demo.** This wipes the previous demo, including its calls and the
   previous prospect's phone number. It seeds about 3,000 orders over 180 days,
   publishes the angle _Why <product> buyers come back_, and starts live orders
   (every 20 seconds for 30 minutes by default). About two in three live orders
   are earlier buyers of that product reordering, so they go to the angle; the
   rest are first orders, which go to general calls. Your merchant selection
   switches to the demo workspace.
3. **Call the prospect.** Enter their first name and phone right before you
   call: the queue only holds an order for five minutes. Their order goes to the
   top of the angle's queue. If the window passes, **Place another order** adds a
   fresh repeat order for the same person.
4. **Script.** The console shows the interview script, which is also pinned on
   the call sheet.
5. **Run of show.** These links follow the order of the pitch:
   - **Dashboard**: orders over time split into first and repeat orders,
     repeat purchase rate by first product (the leader highlighted), time to
     second order (the leader's reorder cycle), where first and repeat orders
     come from, monthly customer cohorts, and top products. Open it from the
     console's link so the date range covers the whole seeded history.
   - **Live angles**: the cohort is "a repeat order, and they previously
     ordered <product>".
   - **Live queue**: claim the prospect's order and call them.
   - **Completed calls**: the call sheet, recording, and transcript.
   - **Sample report**: the order data, 24 illustrative interviews (labeled as
     sample data), Shopify's last-click attribution compared with what customers
     said, and the notes and customer quotes from your live call.

## How it works

- `apps/web/app/lib/demo/storefront.server.ts` reads `/meta.json`,
  `/products.json`, and `/collections/all?sort_by=best-selling`, falling back to
  JSON-LD. It fetches only public hosts.
- `dataset.ts` generates the order history deterministically from the site and
  catalog, so a rehearsal shows the same numbers as the real demo.
- `demo-service.server.ts` resets and seeds the demo merchant and runs the live
  orders. Live and prospect orders go through the real Shopify ingestion path
  (`ingestShopifyOrder`) and qualification (`qualifyCommerceEvent`).
  Fictional customers get `555-01xx` synthetic contacts; the prospect's phone is
  KMS-encrypted like any customer's.
- The angle uses the new `customer.prior_orders_contain_current_category`
  predicate on a `merchant:demo-hero` category assigned to the chosen product.
- Live orders are an in-process timer. If you restart the dev server
  mid-demo, the timer resumes the next time the console loads.
