import { useEffect } from "react";
import {
  Form,
  Link,
  redirect,
  useLoaderData,
  useRevalidator,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { AppShell } from "../components/app-shell";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { momentStatusLabels } from "../lib/moment-status";
import type { QueueItem } from "../lib/operations-types";

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const service = getOperationsService();
    const [assignments, moments] = await Promise.all([
      service.listQueue(context),
      service.listMoments(context),
    ]);
    // Only running or paused angles can have work waiting in the queue.
    const angles = moments
      .filter(
        (moment) => moment.status === "live" || moment.status === "paused",
      )
      .map(({ id, name, status }) => ({ id, name, status }));
    return {
      assignments,
      angles,
      researcherId: context.researcherId,
      liveCount: angles.filter((angle) => angle.status === "live").length,
      refreshedAt: new Date().toISOString(),
    };
  });
}

export async function action({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const form = await request.formData();
    const assignmentId = String(form.get("assignmentId") ?? "");
    const intent = String(form.get("intent") ?? "");
    if (!assignmentId)
      throw new Response("Assignment is required", { status: 400 });
    const service = getOperationsService();
    const context = await getTenantContext(request);
    const lockVersion = Number(form.get("lockVersion"));
    if (intent === "open") {
      // Claim and start in one step; an order already claimed by this
      // researcher goes straight to its call sheet.
      const claimed =
        form.get("status") === "queued"
          ? await service.claimAssignment(context, assignmentId, lockVersion)
          : undefined;
      const interview = await service.startInterview(
        context,
        assignmentId,
        claimed?.lockVersion ?? lockVersion,
      );
      return redirect(`/interviews/${interview.id}`);
    }
    if (intent === "claim")
      return {
        intent,
        assignmentId,
        assignment: await service.claimAssignment(
          context,
          assignmentId,
          lockVersion,
        ),
      };
    if (intent === "release")
      return {
        intent,
        assignmentId,
        assignment: await service.releaseAssignment(
          context,
          assignmentId,
          lockVersion,
        ),
      };
    if (intent === "start") {
      const interview = await service.startInterview(
        context,
        assignmentId,
        lockVersion,
      );
      return redirect(`/interviews/${interview.id}`);
    }
    if (intent === "reveal") {
      const result = await service.revealPhone(context, assignmentId);
      return Response.json(
        { intent, assignmentId, phone: result.phone },
        {
          headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" },
        },
      );
    }
    throw new Response("Unsupported action", { status: 400 });
  });
}

// Filters and sorting live in the URL so they survive a trip to the call
// sheet, but changing them only re-sorts what is loaded; reloading would
// decrypt (and audit) every name again.
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (
    !formMethod &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search !== nextUrl.search
  )
    return false;
  return defaultShouldRevalidate;
}

export function meta() {
  return [{ title: "Order queue · Holler" }];
}

/** Orders drop out after five minutes, so the table keeps itself current. */
const REFRESH_MS = 15_000;
const VISIBLE_ROWS = 10;
/** Past this age an order is still callable but a weaker lead. */
const STALE_AFTER_MS = 3 * 60_000;

const easternTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const sortKeys = [
  "angle",
  "placed",
  "name",
  "location",
  "value",
  "items",
  "sequence",
  "source",
] as const;
type SortKey = (typeof sortKeys)[number];

const columns: readonly { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "angle", label: "Research angle" },
  { key: "placed", label: "Placed (ET)" },
  { key: "name", label: "First name" },
  { key: "location", label: "City, state" },
  { key: "value", label: "Order value", numeric: true },
  { key: "items", label: "Items purchased" },
  { key: "sequence", label: "Order #", numeric: true },
  { key: "source", label: "Attribution source" },
];

const moneyValue = (formatted: string) =>
  Number(formatted.replace(/[^0-9.-]/g, "")) || 0;

const sortValue: Record<SortKey, (item: QueueItem) => string | number> = {
  angle: (item) => item.moment.toLowerCase(),
  placed: (item) => Date.parse(item.orderedAt),
  name: (item) => item.customerName.toLowerCase(),
  // East to west, so customers in the same time zone sit together.
  location: (item) => {
    const zone = timeZoneOf(item.locality);
    return `${String(zone ? zone.order : 9).padStart(2, "0")}|${(item.locality ?? "~").toLowerCase()}`;
  },
  value: (item) => moneyValue(item.orderTotal),
  items: (item) => item.itemCount,
  sequence: (item) => item.orderSequence,
  source: (item) => item.observedAttribution.toLowerCase(),
};

/** Primary time zone by US state or Canadian province, east to west. */
const zonesByRegion: Record<string, { label: string; order: number }> = {};
for (const [label, regions] of [
  ["AT", "NB NL NS PE"],
  [
    "ET",
    "CT DC DE FL GA IN KY MA MD ME MI NC NH NJ NY OH ON PA QC RI SC VA VT WV",
  ],
  ["CT", "AL AR IA IL KS LA MB MN MO MS ND NE OK SD SK TN TX WI"],
  ["MT", "AB AZ CO ID MT NM UT WY"],
  ["PT", "BC CA NV OR WA"],
  ["AKT", "AK"],
  ["HT", "HI"],
] as const)
  for (const region of regions.split(" "))
    zonesByRegion[region] = {
      label,
      order: ["AT", "ET", "CT", "MT", "PT", "AKT", "HT"].indexOf(label),
    };

function timeZoneOf(locality: string | null) {
  const region = locality?.split(",").at(-1)?.trim().toUpperCase();
  return region ? zonesByRegion[region] : undefined;
}

const newestFirst = (a: QueueItem, b: QueueItem) =>
  Date.parse(b.orderedAt) - Date.parse(a.orderedAt);

export default function ResearchQueueRoute() {
  const { assignments, angles, researcherId, liveCount, refreshedAt } =
    useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        revalidator.state === "idle"
      )
        void revalidator.revalidate();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [revalidator]);

  const angleFilter = params.get("angle") ?? "";
  const orderFilter = params.get("order") ?? "";
  const sourceFilter = params.get("source") ?? "";
  const sort: SortKey = sortKeys.includes(params.get("sort") as SortKey)
    ? (params.get("sort") as SortKey)
    : "placed";
  const direction =
    params.get("dir") === "asc" || params.get("dir") === "desc"
      ? params.get("dir")
      : sort === "placed"
        ? "desc"
        : "asc";

  function update(changes: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes))
          if (value) next.set(key, value);
          else next.delete(key);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  function toggleSort(key: SortKey) {
    if (key === sort) update({ dir: direction === "asc" ? "desc" : "asc" });
    else update({ sort: key === "placed" ? null : key, dir: null });
  }

  // Claimed work for an angle no longer listed still appears as an option.
  const angleOptions = [
    ...angles.map(({ id, name, status }) => ({ id, name, status })),
    ...assignments
      .filter((item) => !angles.some((angle) => angle.id === item.momentId))
      .map((item) => ({
        id: item.momentId,
        name: item.moment,
        status: undefined,
      })),
  ].filter(
    (option, index, all) =>
      all.findIndex((other) => other.id === option.id) === index,
  );
  const sourceOptions = [
    ...new Set(assignments.map((item) => item.observedAttribution)),
  ].sort();

  const qualifying = assignments.filter(
    (item) =>
      (!angleFilter || item.momentId === angleFilter) &&
      (!sourceFilter || item.observedAttribution === sourceFilter) &&
      (orderFilter === "first"
        ? item.orderSequence <= 1
        : orderFilter === "repeat"
          ? item.orderSequence > 1
          : true),
  );
  // The ten newest qualifying orders, then the researcher's chosen order.
  const visible = [...qualifying]
    .sort(newestFirst)
    .slice(0, VISIBLE_ROWS)
    .sort((a, b) => {
      const left = sortValue[sort](a);
      const right = sortValue[sort](b);
      const order = left < right ? -1 : left > right ? 1 : 0;
      return (direction === "asc" ? order : -order) || newestFirst(a, b);
    });
  const staleBefore = Date.parse(refreshedAt) - STALE_AFTER_MS;
  const filtered = Boolean(angleFilter || orderFilter || sourceFilter);

  return (
    <AppShell
      className="app-shell--console"
      eyebrow="Research operations"
      title="Order queue"
      description="The ten newest qualifying orders."
      hideHeader
    >
      <div className="call-sheet queue-sheet">
        <section className="call-bar queue-bar" aria-label="Queue filters">
          <div className="queue-bar__title">
            <strong>Order queue</strong>
            <span>
              <span className="status-dot" />
              Updated {easternTime.format(new Date(refreshedAt))} ET · every 15
              seconds
            </span>
          </div>
          <div className="queue-bar__filters">
            <label className="queue-filter">
              <span>Angle</span>
              <select
                onChange={(event) => update({ angle: event.target.value })}
                value={angleFilter}
              >
                <option value="">All angles</option>
                {angleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                    {option.status === "paused"
                      ? ` (${momentStatusLabels.paused.toLowerCase()})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="queue-filter">
              <span>Order</span>
              <select
                onChange={(event) => update({ order: event.target.value })}
                value={orderFilter}
              >
                <option value="">All orders</option>
                <option value="first">First orders</option>
                <option value="repeat">Repeat orders</option>
              </select>
            </label>
            <label className="queue-filter">
              <span>Attribution</span>
              <select
                onChange={(event) => update({ source: event.target.value })}
                value={sourceFilter}
              >
                <option value="">All sources</option>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            {filtered ? (
              <button
                className="console-button console-button--quiet"
                onClick={() =>
                  update({ angle: null, order: null, source: null })
                }
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>
        </section>

        {liveCount === 0 ? (
          <p className="inline-notice" role="status">
            No angles are live, so no new orders are coming in. Resume or launch
            an angle in Angle setup to start calling again.
          </p>
        ) : null}

        <section className="sheet-section">
          <header className="sheet-section__header">
            <h2>Newest orders</h2>
            <span className="sheet-section__meta">
              {visible.length
                ? `${visible.length} of ${qualifying.length} qualifying${filtered ? " (filtered)" : ""} · faded after 3 minutes`
                : filtered
                  ? "No orders match these filters"
                  : "Waiting for qualifying orders"}
            </span>
          </header>
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th className="queue-table__open" scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                  {columns.map((column) => (
                    <th
                      aria-sort={
                        column.key === sort
                          ? direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className={`queue-table__${column.key}${column.numeric ? " is-numeric" : ""}`}
                      key={column.key}
                      scope="col"
                    >
                      <button
                        onClick={() => toggleSort(column.key)}
                        type="button"
                      >
                        {column.label}
                        <span aria-hidden="true" className="queue-table__arrow">
                          {column.key === sort
                            ? direction === "asc"
                              ? "↑"
                              : "↓"
                            : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <QueueRow
                    item={item}
                    key={item.id}
                    mine={item.claimedByResearcherId === researcherId}
                    stale={Date.parse(item.orderedAt) < staleBefore}
                  />
                ))}
                {Array.from(
                  { length: VISIBLE_ROWS - visible.length },
                  (_, index) => (
                    <tr
                      aria-hidden="true"
                      className="queue-row queue-row--empty"
                      key={`empty-${index}`}
                    >
                      <td colSpan={columns.length + 1} />
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function QueueRow({
  item,
  mine,
  stale,
}: {
  item: QueueItem;
  mine: boolean;
  stale: boolean;
}) {
  const taken = item.status !== "queued" && !mine;
  const zone = timeZoneOf(item.locality);
  const state = taken ? "taken" : mine ? "mine" : "open";
  return (
    <tr className={`queue-row queue-row--${state}${stale ? " is-stale" : ""}`}>
      <td className="queue-table__open">
        {taken ? (
          <span
            className="queue-row__taken"
            title="Another researcher has this order"
          >
            Taken
          </span>
        ) : mine && item.interviewId ? (
          <Link
            className="queue-open queue-open--mine"
            to={`/interviews/${item.interviewId}`}
          >
            Reopen
          </Link>
        ) : (
          <Form method="post">
            <input name="assignmentId" type="hidden" value={item.id} />
            <input name="lockVersion" type="hidden" value={item.lockVersion} />
            <input name="status" type="hidden" value={item.status} />
            <button
              className={`queue-open${mine ? " queue-open--mine" : ""}`}
              name="intent"
              type="submit"
              value="open"
            >
              Open
            </button>
          </Form>
        )}
      </td>
      <td className="queue-table__angle">{item.moment}</td>
      <td className="queue-table__placed">
        <time dateTime={item.orderedAt}>
          {easternTime.format(new Date(item.orderedAt))}
        </time>
      </td>
      <td className="queue-table__name">{item.customerName}</td>
      <td className="queue-table__location">
        {item.locality ?? "—"}
        {zone ? <span className="queue-row__zone">{zone.label}</span> : null}
      </td>
      <td className="queue-table__value is-numeric">{item.orderTotal}</td>
      <td className="queue-table__items" title={item.products.join(", ")}>
        <span className="queue-row__count">{item.itemCount}</span>
        {item.products.join(", ") || "—"}
      </td>
      <td className="queue-table__sequence is-numeric">
        {item.orderSequence || "—"}
      </td>
      <td className="queue-table__source">{item.observedAttribution}</td>
    </tr>
  );
}
