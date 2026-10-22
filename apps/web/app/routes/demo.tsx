import { useEffect, useState } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from "react-router";

import { AppShell } from "../components/app-shell";
import { buildDemoAngle } from "../lib/demo/angle";
import {
  DEMO_LIMITS,
  type DemoConfig,
  type DemoProduct,
} from "../lib/demo/catalog";
import {
  DEMO_MERCHANT_ID,
  DemoError,
  addProspectOrder,
  demoModeEnabled,
  demoPreflight,
  demoQueueStats,
  endDemo,
  ensureLiveLoop,
  getCurrentDemo,
  requireDemoOperator,
  resumeLiveOrders,
  startDemo,
} from "../lib/demo/demo-service.server";
import {
  StorefrontLookupError,
  lookupStorefront,
  type StorefrontLookup,
} from "../lib/demo/storefront.server";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { OperationsError } from "../lib/postgres-operations-service.server";
import { getShopifyIngestionDatabase } from "../lib/shopify-ingestion.server";
import { workforceMerchantCookie } from "../lib/workforce-session.server";

const DAY_MS = 24 * 60 * 60 * 1000;

async function operator(request: Request) {
  if (!demoModeEnabled()) throw new Response("Not found", { status: 404 });
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
    const context = await operator(request);
    const db = getShopifyIngestionDatabase();
    let demo = await getCurrentDemo(db);
    if (demo && (await ensureLiveLoop(db, demo)))
      demo = await getCurrentDemo(db);
    const hero = demo?.config.products[demo.config.heroIndex];
    const angle =
      demo && hero
        ? buildDemoAngle({
            companyName: demo.companyName,
            heroTitle: hero.title,
            otherTitles: demo.config.products
              .filter((product) => product !== hero)
              .map((product) => product.title),
          })
        : null;
    return {
      checks: demoPreflight(context),
      onDemoMerchant: context.merchantId === DEMO_MERCHANT_ID,
      canSwitch: context.merchantIds.includes(DEMO_MERCHANT_ID),
      demoMerchantId: DEMO_MERCHANT_ID,
      demo,
      stats: demo ? await demoQueueStats(db, demo) : null,
      angle: angle && {
        name: angle.name,
        question: angle.question,
        prompts: angle.prompts,
      },
      dashboardStart: new Date(Date.now() - 200 * DAY_MS)
        .toISOString()
        .slice(0, 10),
    };
  });
}

type ActionResult =
  | { intent: "lookup"; lookup: StorefrontLookup }
  | { intent: "prospect"; orderNumber: string; lastFour: string }
  | { intent: "ok" }
  | { error: string };

export async function action({ request }: { request: Request }) {
  const context = await operator(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const db = getShopifyIngestionDatabase();
  try {
    requireDemoOperator(context);
    switch (intent) {
      case "lookup":
        return {
          intent: "lookup",
          lookup: await lookupStorefront(String(form.get("website") ?? "")),
        } satisfies ActionResult;
      case "start": {
        const config = JSON.parse(
          String(form.get("config") ?? "null"),
        ) as DemoConfig;
        await startDemo(db, getOperationsService(), context, config);
        // Land in the demo workspace so every linked page shows the demo.
        return redirect(
          "/demo",
          context.merchantIds.includes(DEMO_MERCHANT_ID)
            ? {
                headers: {
                  "Set-Cookie": workforceMerchantCookie(
                    request,
                    DEMO_MERCHANT_ID,
                  ),
                },
              }
            : undefined,
        );
      }
      case "prospect": {
        const result = await addProspectOrder(db, context, {
          firstName: String(form.get("firstName") ?? ""),
          phone: String(form.get("phone") ?? ""),
        });
        return { intent: "prospect", ...result } satisfies ActionResult;
      }
      case "end":
        await endDemo(db);
        return { intent: "ok" } satisfies ActionResult;
      case "extend":
        await resumeLiveOrders(db, 15);
        return { intent: "ok" } satisfies ActionResult;
      default:
        return data({ error: "Unknown action." } satisfies ActionResult, {
          status: 400,
        });
    }
  } catch (error) {
    if (error instanceof DemoError || error instanceof StorefrontLookupError)
      return data({ error: error.message } satisfies ActionResult, {
        status: 400,
      });
    if (error instanceof OperationsError)
      return data(
        {
          error: `Holler rejected the demo setup (${error.code}).`,
        } satisfies ActionResult,
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return data(
        { error: "The demo setup was malformed." } satisfies ActionResult,
        { status: 400 },
      );
    throw error;
  }
}

export function meta() {
  return [{ title: "Sales demo · Holler" }];
}

const emptyProduct = (index: number): DemoProduct => ({
  productId: "",
  variantId: "",
  handle: `product-${index + 1}`,
  title: "",
  // Styles entered by hand need a unique code; nobody sees it.
  sku: `STYLE-${index + 1}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
  price: "",
  variantTitle: null,
  imageUrl: null,
});

function draftFrom(lookup: StorefrontLookup): DemoConfig {
  return {
    website: lookup.website,
    companyName: lookup.companyName,
    products: lookup.products,
    // Not the best seller: "your best retainer isn't your best seller" lands harder.
    heroIndex: lookup.products.length >= 3 ? 1 : 0,
    historicalOrders: 3000,
    liveMinutes: 30,
    liveIntervalSeconds: 20,
  };
}

export default function DemoRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const { demo, stats, angle, checks } = loaderData;
  const revalidator = useRevalidator();
  const live = demo?.status === "live";

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (revalidator.state === "idle") void revalidator.revalidate();
    }, 5000);
    return () => clearInterval(timer);
  }, [live, revalidator]);

  const blocking = checks.filter((check) => !check.ok);

  return (
    <AppShell
      eyebrow="Sales demo"
      title="Demo console"
      description="Set up a prospect's own catalog, fill the research queue with live orders, and call them as their customer."
    >
      <section
        className={`panel demo-checks${blocking.length ? " demo-checks--warn" : ""}`}
        aria-label="Readiness"
      >
        <h2>{blocking.length ? "Fix before the call" : "Ready to demo"}</h2>
        <ul>
          {checks.map((check) => (
            <li key={check.label} className={check.ok ? "is-ok" : "is-missing"}>
              <span aria-hidden="true">{check.ok ? "✓" : "!"}</span>
              <strong>{check.label}</strong>{" "}
              {check.ok ? null : (
                <span className="demo-check-detail">{check.detail}</span>
              )}
              {!check.ok && check.label === "Demo workspace access" ? (
                <code>{loaderData.demoMerchantId}</code>
              ) : null}
            </li>
          ))}
        </ul>
        {loaderData.canSwitch && !loaderData.onDemoMerchant && demo ? (
          <Form action="/merchant" method="post" className="demo-inline-form">
            <input
              type="hidden"
              name="merchantId"
              value={loaderData.demoMerchantId}
            />
            <input type="hidden" name="redirectTo" value="/demo" />
            <span>
              You're looking at another merchant. The links below show whichever
              merchant is selected.
            </span>
            <button className="button button-small" type="submit">
              Switch to {demo.companyName}
            </button>
          </Form>
        ) : null}
      </section>

      <SetupStep hasDemo={Boolean(demo)} />

      {demo ? (
        <>
          <LiveStatus demo={demo} stats={stats} />
          <ProspectStep demo={demo} angleName={angle?.name ?? ""} />
          {angle ? (
            <section className="panel demo-step" aria-labelledby="demo-script">
              <p className="demo-step-number">4</p>
              <div>
                <h2 id="demo-script">Interview script</h2>
                <p className="helper-copy">
                  Pinned to the <strong>{angle.name}</strong> angle; it is the
                  script on the call sheet. Use{" "}
                  <strong>{demo.companyName}</strong>'s name when you open.
                </p>
                <p className="demo-question">{angle.question}</p>
                <ol className="demo-script">
                  {angle.prompts.map((prompt) => (
                    <li key={prompt.id}>
                      <strong>{prompt.title}</strong>
                      <span>{prompt.prompt}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ) : null}
          <section
            className="panel demo-step"
            aria-labelledby="demo-run-of-show"
          >
            <p className="demo-step-number">5</p>
            <div>
              <h2 id="demo-run-of-show">Run of show</h2>
              <ol className="demo-run">
                <li>
                  <Link
                    to={`/admin/dashboard?start=${loaderData.dashboardStart}`}
                  >
                    Dashboard
                  </Link>
                  : their catalog, months of orders, and the product customers
                  keep coming back for.
                </li>
                <li>
                  <Link to="/moments">Live angles</Link>: the question turned
                  into a cohort of repeat buyers of that product, and its
                  script.
                </li>
                <li>
                  <Link to="/queue">Live queue</Link>: orders arriving now.
                  Claim the prospect's order and call them.
                </li>
                <li>
                  <Link to="/calls">Completed calls</Link>: the call sheet,
                  recording, and transcript after you hang up.
                </li>
                <li>
                  <a href="/demo/report" target="_blank" rel="noreferrer">
                    Sample report
                  </a>
                  : findings from a full run, with their own call included.
                </li>
              </ol>
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function ErrorText({ result }: { result: unknown }) {
  return result && typeof result === "object" && "error" in result ? (
    <p className="inline-notice demo-error" role="alert">
      {String((result as { error: string }).error)}
    </p>
  ) : null;
}

function SetupStep({ hasDemo }: { hasDemo: boolean }) {
  const lookup = useFetcher<typeof action>();
  const navigation = useNavigation();
  const [draft, setDraft] = useState<DemoConfig | null>(null);
  const [open, setOpen] = useState(!hasDemo);
  const starting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "start";

  useEffect(() => {
    const result = lookup.data as ActionResult | undefined;
    if (result && "intent" in result && result.intent === "lookup")
      setDraft(draftFrom(result.lookup));
  }, [lookup.data]);

  const update = (patch: Partial<DemoConfig>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const updateProduct = (index: number, patch: Partial<DemoProduct>) =>
    update({
      products: draft!.products.map((product, position) =>
        position === index ? { ...product, ...patch } : product,
      ),
    });
  const removeProduct = (index: number) =>
    update({
      products: draft!.products.filter((_, position) => position !== index),
      heroIndex:
        index === draft!.heroIndex
          ? 0
          : index < draft!.heroIndex
            ? draft!.heroIndex - 1
            : draft!.heroIndex,
    });

  if (!open)
    return (
      <section className="panel demo-step demo-step--collapsed">
        <p className="demo-step-number">1</p>
        <div className="demo-step-row">
          <h2>Prospect's website</h2>
          <button
            className="button button-small"
            type="button"
            onClick={() => setOpen(true)}
          >
            Set up a new demo
          </button>
        </div>
      </section>
    );

  return (
    <section className="panel demo-step" aria-labelledby="demo-setup">
      <p className="demo-step-number">1</p>
      <div>
        <h2 id="demo-setup">Prospect's website</h2>
        <p className="helper-copy">
          We read the company name and best sellers from their storefront. You
          can edit anything before starting.
        </p>
        <lookup.Form method="post" className="demo-inline-form">
          <input type="hidden" name="intent" value="lookup" />
          <label className="demo-grow">
            <span className="sr-only">Company website</span>
            <input
              name="website"
              type="text"
              inputMode="url"
              placeholder="brand.com"
              required
              autoComplete="off"
            />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={lookup.state !== "idle"}
          >
            {lookup.state !== "idle" ? "Looking up…" : "Look up"}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setDraft({
                website: "https://example.com/",
                companyName: "",
                products: [0, 1, 2].map(emptyProduct),
                heroIndex: 1,
                historicalOrders: 3000,
                liveMinutes: 30,
                liveIntervalSeconds: 20,
              })
            }
          >
            Enter by hand
          </button>
        </lookup.Form>
        <ErrorText result={lookup.data} />

        {draft ? (
          <Form method="post" className="demo-draft">
            <input type="hidden" name="intent" value="start" />
            <input type="hidden" name="config" value={JSON.stringify(draft)} />
            <label className="demo-company">
              <span>Company name</span>
              <input
                value={draft.companyName}
                onChange={(event) =>
                  update({ companyName: event.target.value })
                }
                required
              />
            </label>
            <table className="demo-products">
              <thead>
                <tr>
                  <th scope="col">High repeat</th>
                  <th scope="col">Product (style)</th>
                  <th scope="col">Price</th>
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.products.map((product, index) => (
                  <tr key={`${product.handle}-${index}`}>
                    <td>
                      <input
                        type="radio"
                        name="hero"
                        aria-label={`${product.title || "This product"} has the high repeat rate`}
                        checked={draft.heroIndex === index}
                        onChange={() => update({ heroIndex: index })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Product name"
                        value={product.title}
                        onChange={(event) =>
                          updateProduct(index, { title: event.target.value })
                        }
                        required
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Price"
                        inputMode="decimal"
                        value={product.price}
                        onChange={(event) =>
                          updateProduct(index, {
                            price: event.target.value.replace(/[^\d.]/g, ""),
                          })
                        }
                        required
                      />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        disabled={
                          draft.products.length <= DEMO_LIMITS.minProducts
                        }
                        onClick={() => removeProduct(index)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="text-button"
              type="button"
              disabled={draft.products.length >= DEMO_LIMITS.maxProducts}
              onClick={() =>
                update({
                  products: [
                    ...draft.products,
                    emptyProduct(draft.products.length),
                  ],
                })
              }
            >
              Add product
            </button>
            <div className="demo-settings">
              <label>
                <span>Historical orders</span>
                <input
                  type="number"
                  min={DEMO_LIMITS.minHistoricalOrders}
                  max={DEMO_LIMITS.maxHistoricalOrders}
                  step={100}
                  value={draft.historicalOrders}
                  onChange={(event) =>
                    update({ historicalOrders: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>Live orders for (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={DEMO_LIMITS.maxLiveMinutes}
                  value={draft.liveMinutes}
                  onChange={(event) =>
                    update({ liveMinutes: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>Seconds between live orders</span>
                <input
                  type="number"
                  min={DEMO_LIMITS.minLiveIntervalSeconds}
                  max={600}
                  value={draft.liveIntervalSeconds}
                  onChange={(event) =>
                    update({ liveIntervalSeconds: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <div className="demo-start">
              <button
                className="button button-primary"
                type="submit"
                disabled={starting}
              >
                {starting ? "Building their store…" : "Start demo"}
              </button>
              <span className="helper-copy">
                Replaces the previous demo, including its calls. Seeding takes
                up to a minute.
              </span>
            </div>
          </Form>
        ) : null}
        <StartError />
      </div>
    </section>
  );
}

/** A failed start reloads this page with the action's error. */
function StartError() {
  return <ErrorText result={useActionData<typeof action>()} />;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type LoaderDemo = NonNullable<
  ReturnType<typeof useLoaderData<typeof loader>>["demo"]
>;
type LoaderStats = ReturnType<typeof useLoaderData<typeof loader>>["stats"];

function LiveStatus({ demo, stats }: { demo: LoaderDemo; stats: LoaderStats }) {
  const fetcher = useFetcher<typeof action>();
  const now = useNow(1000);
  const remaining = demo.liveUntil
    ? Math.max(0, new Date(demo.liveUntil).getTime() - now)
    : 0;
  const live = demo.status === "live" && remaining > 0;
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const hero = demo.config.products[demo.config.heroIndex];
  return (
    <section className="panel demo-step" aria-labelledby="demo-live">
      <p className="demo-step-number">2</p>
      <div>
        <div className="demo-step-row">
          <h2 id="demo-live">
            {demo.companyName}{" "}
            <span
              className={`status-pill ${live ? "status-live" : "status-paused"}`}
            >
              {live ? "Live orders on" : "Live orders off"}
            </span>
          </h2>
          <fetcher.Form method="post" className="demo-inline-form">
            {live ? (
              <button
                className="button button-small"
                name="intent"
                value="end"
                type="submit"
              >
                Stop live orders
              </button>
            ) : null}
            <button
              className="button button-small"
              name="intent"
              value="extend"
              type="submit"
            >
              {live ? "Add 15 minutes" : "Restart for 15 minutes"}
            </button>
          </fetcher.Form>
        </div>
        <p className="helper-copy">
          {demo.website} · {demo.config.products.length} products · high repeat
          product: <strong>{hero?.title}</strong>
        </p>
        <dl className="demo-stats">
          <div>
            <dt>Time left</dt>
            <dd>
              {live ? `${minutes}:${String(seconds).padStart(2, "0")}` : "—"}
            </dd>
          </div>
          <div>
            <dt>Orders in store</dt>
            <dd>{stats?.ordersTotal.toLocaleString() ?? "—"}</dd>
          </div>
          <div>
            <dt>Live orders sent</dt>
            <dd>{demo.liveOrdersSent}</dd>
          </div>
          <div>
            <dt>In queue now</dt>
            <dd>{stats?.queued ?? "—"}</dd>
          </div>
          <div>
            <dt>For the angle</dt>
            <dd>{stats?.queuedForAngle ?? "—"}</dd>
          </div>
        </dl>
        {demo.status === "live" && !demo.loopRunning ? (
          <p className="inline-notice">
            Live orders are paused in this server process. Press "Add 15
            minutes" to resume.
          </p>
        ) : null}
        <ErrorText result={fetcher.data} />
      </div>
    </section>
  );
}

function ProspectStep({
  demo,
  angleName,
}: {
  demo: LoaderDemo;
  angleName: string;
}) {
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data as ActionResult | undefined;
  const placed =
    result && "intent" in result && result.intent === "prospect"
      ? result
      : null;
  return (
    <section className="panel demo-step" aria-labelledby="demo-prospect">
      <p className="demo-step-number">3</p>
      <div>
        <h2 id="demo-prospect">Call the prospect as a customer</h2>
        <p className="helper-copy">
          Places a repeat order from them for{" "}
          <strong>{demo.config.products[demo.config.heroIndex]?.title}</strong>,
          so they land in the <strong>{angleName}</strong> queue. The queue
          holds an order for five minutes, so add them right before you call.
          Their number is stored encrypted and is deleted when the next demo
          starts.
        </p>
        <fetcher.Form method="post" className="demo-inline-form">
          <input type="hidden" name="intent" value="prospect" />
          <label>
            <span>First name</span>
            <input
              name="firstName"
              required
              autoComplete="off"
              maxLength={60}
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              name="phone"
              type="tel"
              required
              autoComplete="off"
              placeholder="+1 555 123 4567"
            />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={fetcher.state !== "idle"}
          >
            {fetcher.state !== "idle"
              ? "Placing order…"
              : demo.prospectOrderNumber
                ? "Place another order"
                : "Put them in the queue"}
          </button>
        </fetcher.Form>
        {placed ? (
          <p className="inline-notice" role="status">
            Order {placed.orderNumber} (phone ending {placed.lastFour}) is in
            the queue. <Link to="/queue">Open the live queue</Link> and claim it
            within five minutes.
          </p>
        ) : demo.prospectOrderNumber ? (
          <p className="helper-copy">
            Last prospect order: {demo.prospectOrderNumber}.
          </p>
        ) : null}
        <ErrorText result={fetcher.data} />
      </div>
    </section>
  );
}
