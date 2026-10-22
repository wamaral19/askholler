import { useId, useState, type CSSProperties, type ReactNode } from "react";

import type {
  CohortRow,
  OrderSeriesPoint,
  ReorderTiming,
  SourceSplitRow,
  TopProductRow,
} from "../lib/analytics";

/**
 * Dashboard charts. One color meaning across the page: orange is repeat
 * orders, blue is the repeat-rate leader, gray is the baseline (first orders,
 * the rest of the catalog). Every chart has a table view and per-mark hover.
 */

const percent = (value: number) => `${Math.round(value * 100)}%`;

export const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta ads",
  google: "Google",
  tiktok: "TikTok ads",
  klaviyo: "Email (Klaviyo)",
  postscript: "SMS (Postscript)",
  direct: "Direct",
  unknown: "Unattributed",
};

const sourceLabel = (source: string) =>
  SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);

function money(minor: number, currency: string, compact = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact || minor >= 100_000 ? 0 : 2,
    ...(compact ? { notation: "compact" } : {}),
  }).format(minor / 100);
}

/** 0, then 3–4 round steps covering `max`. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10]
    .map((f) => f * magnitude)
    .find((s) => s >= rough)!;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step)
    ticks.push(value);
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

interface SeriesKey {
  readonly label: string;
  readonly className: string;
}

function Legend({ items }: { items: readonly SeriesKey[] }) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            className={`chart-swatch ${item.className}`}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function ChartPanel({
  title,
  description,
  legend,
  insight,
  chart,
  table,
  className,
}: {
  title: string;
  description: ReactNode;
  legend?: readonly SeriesKey[];
  insight?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  return (
    <section
      className={`panel dashboard-panel chart-panel ${className ?? ""}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="chart-panel-head">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p className="helper-copy">{description}</p>
        </div>
        <button
          className="text-button"
          type="button"
          aria-controls={id}
          aria-expanded={showTable}
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {insight ? <p className="chart-insight">{insight}</p> : null}
      {legend && !showTable ? <Legend items={legend} /> : null}
      <div id={id}>{showTable ? table : chart}</div>
    </section>
  );
}

function Tooltip({
  children,
  align,
}: {
  children: ReactNode;
  align: "start" | "end";
}) {
  return (
    <span className={`chart-tooltip chart-tooltip--${align}`} role="tooltip">
      {children}
    </span>
  );
}

function periodLabel(
  period: string,
  granularity: "day" | "week" | "month",
  long = false,
): string {
  const at = new Date(`${period}T00:00:00.000Z`);
  if (granularity === "month")
    return at.toLocaleDateString("en-US", {
      month: long ? "long" : "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const day = at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return long && granularity === "week" ? `Week of ${day}` : day;
}

export function OrdersOverTime({
  series,
  granularity,
  currency,
}: {
  series: readonly OrderSeriesPoint[];
  granularity: "day" | "week" | "month";
  currency: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const totals = series.map(
    (point) => point.firstOrders + point.repeatOrders + point.otherOrders,
  );
  const ticks = niceTicks(Math.max(0, ...totals));
  const top = ticks.at(-1) || 1;
  const hasOther = series.some((point) => point.otherOrders > 0);
  const orders = totals.reduce((sum, value) => sum + value, 0);
  const repeats = series.reduce((sum, point) => sum + point.repeatOrders, 0);
  // Label roughly eight evenly spaced periods.
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  const legend: SeriesKey[] = [
    { label: "First orders", className: "chart-swatch--base" },
    { label: "Repeat orders", className: "chart-swatch--repeat" },
    ...(hasOther
      ? [{ label: "History unknown", className: "chart-swatch--other" }]
      : []),
  ];
  return (
    <ChartPanel
      className="chart-panel--wide"
      title="Orders over time"
      description={`Orders per ${granularity}, split by whether it was the customer's first order.`}
      insight={
        orders ? (
          <>
            <strong>{percent(repeats / orders)}</strong> of orders in this
            period came from returning customers.
          </>
        ) : null
      }
      legend={legend}
      chart={
        <div className="column-chart" role="list">
          <div className="column-chart-grid" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }}>
                {tick.toLocaleString()}
              </span>
            ))}
          </div>
          <div className="column-chart-plot">
            {series.map((point, index) => {
              const total = totals[index]!;
              const segments = [
                ["chart-fill--base", point.firstOrders],
                ["chart-fill--other", point.otherOrders],
                ["chart-fill--repeat", point.repeatOrders],
              ] as const;
              return (
                <div
                  className={`column${hovered === index ? " is-hovered" : ""}`}
                  key={point.period}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${periodLabel(point.period, granularity, true)}: ${total} orders, ${point.repeatOrders} repeat`}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                >
                  <div
                    className="column-stack"
                    style={{ height: `${(total / top) * 100}%` }}
                  >
                    {segments
                      .filter(([, value]) => value > 0)
                      .map(([className, value]) => (
                        <span
                          key={className}
                          className={className}
                          style={{ flexGrow: value }}
                        />
                      ))}
                  </div>
                  {index % labelEvery === 0 ? (
                    <span className="column-label">
                      {periodLabel(point.period, granularity)}
                    </span>
                  ) : null}
                  {hovered === index ? (
                    <Tooltip
                      align={index > series.length / 2 ? "end" : "start"}
                    >
                      <strong>
                        {periodLabel(point.period, granularity, true)}
                      </strong>
                      <span>
                        {point.firstOrders.toLocaleString()} first ·{" "}
                        {point.repeatOrders.toLocaleString()} repeat
                        {point.otherOrders
                          ? ` · ${point.otherOrders} unknown`
                          : ""}
                      </span>
                      <span>{money(point.revenueMinor, currency)} revenue</span>
                    </Tooltip>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      }
      table={
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">
                {granularity === "week"
                  ? "Week of"
                  : granularity === "month"
                    ? "Month"
                    : "Day"}
              </th>
              <th scope="col">First orders</th>
              <th scope="col">Repeat orders</th>
              {hasOther ? <th scope="col">History unknown</th> : null}
              <th scope="col">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.period}>
                <th scope="row">{periodLabel(point.period, granularity)}</th>
                <td>{point.firstOrders.toLocaleString()}</td>
                <td>{point.repeatOrders.toLocaleString()}</td>
                {hasOther ? (
                  <td>{point.otherOrders.toLocaleString()}</td>
                ) : null}
                <td>{money(point.revenueMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export function SourcesBySequence({
  rows,
}: {
  rows: readonly SourceSplitRow[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const firstTotal = rows.reduce((sum, row) => sum + row.firstOrders, 0);
  const repeatTotal = rows.reduce((sum, row) => sum + row.repeatOrders, 0);
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [row.firstOrders, row.repeatOrders]),
  );
  // The source whose share of repeat orders most exceeds its share of first orders.
  const tilt =
    firstTotal && repeatTotal
      ? rows
          .map((row) => ({
            row,
            repeatShare: row.repeatOrders / repeatTotal,
            firstShare: row.firstOrders / firstTotal,
          }))
          .sort(
            (a, b) =>
              b.repeatShare - b.firstShare - (a.repeatShare - a.firstShare),
          )[0]
      : undefined;
  return (
    <ChartPanel
      title="Where orders come from"
      description="Observed (last-click) source of each order. It shows the session that converted, not how the customer first heard of you."
      insight={
        tilt && tilt.repeatShare > tilt.firstShare * 1.5 ? (
          <>
            <strong>{sourceLabel(tilt.row.source)}</strong> drives{" "}
            {percent(tilt.repeatShare)} of repeat orders but{" "}
            {percent(tilt.firstShare)} of first orders.
          </>
        ) : null
      }
      legend={[
        { label: "First orders", className: "chart-swatch--base" },
        { label: "Repeat orders", className: "chart-swatch--repeat" },
      ]}
      chart={
        <div className="pair-bars" role="list">
          {rows.map((row) => (
            <div
              key={row.source}
              className={`pair-row${hovered === row.source ? " is-hovered" : ""}`}
              role="listitem"
              tabIndex={0}
              aria-label={`${sourceLabel(row.source)}: ${row.firstOrders} first orders, ${row.repeatOrders} repeat orders`}
              onMouseEnter={() => setHovered(row.source)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(row.source)}
              onBlur={() => setHovered(null)}
            >
              <span className="pair-label">{sourceLabel(row.source)}</span>
              <span className="pair-tracks">
                {(
                  [
                    ["chart-fill--base", row.firstOrders],
                    ["chart-fill--repeat", row.repeatOrders],
                  ] as const
                ).map(([className, value]) => (
                  <span className="pair-track" key={className}>
                    <span
                      className={`pair-bar ${className}`}
                      style={{ width: `${(value / max) * 100}%` }}
                    />
                    <span
                      className="pair-value"
                      style={{ left: `${(value / max) * 100}%` }}
                    >
                      {value.toLocaleString()}
                    </span>
                  </span>
                ))}
                {hovered === row.source ? (
                  <Tooltip align="start">
                    <strong>{sourceLabel(row.source)}</strong>
                    <span>
                      {firstTotal ? percent(row.firstOrders / firstTotal) : "—"}{" "}
                      of first orders ·{" "}
                      {repeatTotal
                        ? percent(row.repeatOrders / repeatTotal)
                        : "—"}{" "}
                      of repeat orders
                    </span>
                  </Tooltip>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      }
      table={
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">First orders</th>
              <th scope="col">Share</th>
              <th scope="col">Repeat orders</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.source}>
                <th scope="row">{sourceLabel(row.source)}</th>
                <td>{row.firstOrders.toLocaleString()}</td>
                <td>
                  {firstTotal ? percent(row.firstOrders / firstTotal) : "—"}
                </td>
                <td>{row.repeatOrders.toLocaleString()}</td>
                <td>
                  {repeatTotal ? percent(row.repeatOrders / repeatTotal) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export function ReorderTimingChart({ timing }: { timing: ReorderTiming }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const leader = timing.leaderProduct;
  const share = (count: number, total: number) => (total ? count / total : 0);
  const max = Math.max(
    0.01,
    ...timing.buckets.flatMap((bucket) => [
      share(bucket.leader, timing.leaderCustomers),
      share(bucket.others, timing.otherCustomers),
    ]),
  );
  const ticks = niceTicks(max * 100).map((tick) => tick / 100);
  const top = ticks.at(-1) || 1;
  const peak = leader
    ? timing.buckets.reduce(
        (best, bucket) => (bucket.leader > best.leader ? bucket : best),
        timing.buckets[0]!,
      )
    : null;
  const otherLabel = leader ? "Rest of catalog" : "All customers";
  return (
    <ChartPanel
      title="Time to second order"
      description="Customers acquired in this period who have ordered again, by how long they waited. Each group adds to 100%."
      insight={
        peak && timing.leaderCustomers >= 20 ? (
          <>
            <strong>{leader}</strong> buyers reorder on a cycle:{" "}
            {percent(share(peak.leader, timing.leaderCustomers))} come back at{" "}
            {peak.label.replace("wks", "weeks")}.
          </>
        ) : null
      }
      legend={[
        ...(leader
          ? [
              {
                label: `${leader} (${timing.leaderCustomers.toLocaleString()})`,
                className: "chart-swatch--leader",
              },
            ]
          : []),
        {
          label: `${otherLabel} (${timing.otherCustomers.toLocaleString()})`,
          className: "chart-swatch--base",
        },
      ]}
      chart={
        timing.leaderCustomers + timing.otherCustomers === 0 ? (
          <p className="helper-copy">
            No second orders yet from customers acquired in this period.
          </p>
        ) : (
          <div className="column-chart column-chart--grouped" role="list">
            <div className="column-chart-grid" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }}>
                  {percent(tick)}
                </span>
              ))}
            </div>
            <div className="column-chart-plot">
              {timing.buckets.map((bucket, index) => (
                <div
                  key={bucket.label}
                  className={`column column--group${hovered === index ? " is-hovered" : ""}`}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${bucket.label}: ${leader ? `${percent(share(bucket.leader, timing.leaderCustomers))} of ${leader} buyers, ` : ""}${percent(share(bucket.others, timing.otherCustomers))} of ${otherLabel.toLowerCase()}`}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                >
                  <div className="column-pair">
                    {leader ? (
                      <span
                        className="chart-fill--leader"
                        style={{
                          height: `${(share(bucket.leader, timing.leaderCustomers) / top) * 100}%`,
                        }}
                      />
                    ) : null}
                    <span
                      className="chart-fill--base"
                      style={{
                        height: `${(share(bucket.others, timing.otherCustomers) / top) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="column-label">{bucket.label}</span>
                  {hovered === index ? (
                    <Tooltip
                      align={
                        index > timing.buckets.length / 2 ? "end" : "start"
                      }
                    >
                      <strong>
                        Second order {bucket.label.replace("wks", "weeks")}{" "}
                        later
                      </strong>
                      {leader ? (
                        <span>
                          {leader}: {bucket.leader.toLocaleString()} (
                          {percent(
                            share(bucket.leader, timing.leaderCustomers),
                          )}
                          )
                        </span>
                      ) : null}
                      <span>
                        {otherLabel}: {bucket.others.toLocaleString()} (
                        {percent(share(bucket.others, timing.otherCustomers))})
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )
      }
      table={
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Second order after</th>
              {leader ? <th scope="col">{leader}</th> : null}
              <th scope="col">{otherLabel}</th>
            </tr>
          </thead>
          <tbody>
            {timing.buckets.map((bucket) => (
              <tr key={bucket.label}>
                <th scope="row">{bucket.label}</th>
                {leader ? (
                  <td>
                    {bucket.leader.toLocaleString()} (
                    {percent(share(bucket.leader, timing.leaderCustomers))})
                  </td>
                ) : null}
                <td>
                  {bucket.others.toLocaleString()} (
                  {percent(share(bucket.others, timing.otherCustomers))})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

// Sequential blue ramp (light → dark); text flips to light on the darker half.
const RAMP = [
  "#cde2fb",
  "#9ec5f4",
  "#6da7ec",
  "#3987e5",
  "#256abf",
  "#184f95",
  "#0d366b",
];

export function CohortRetention({
  cohorts,
}: {
  cohorts: readonly CohortRow[];
}) {
  const months = cohorts[0]?.retained.length ?? 0;
  const rates = cohorts.flatMap((row) =>
    row.retained.flatMap((value) =>
      value === null || !row.customers ? [] : [value / row.customers],
    ),
  );
  const max = Math.max(0.01, ...rates);
  const cohortLabel = (cohort: string) =>
    new Date(`${cohort}-01T00:00:00.000Z`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return (
    <section
      className="panel dashboard-panel chart-panel chart-panel--wide"
      aria-labelledby="cohort-title"
    >
      <div className="chart-panel-head">
        <div>
          <h2 id="cohort-title">Customer cohorts</h2>
          <p className="helper-copy">
            Customers grouped by the month of their first order, and the share
            who ordered again in each month after. Blank cells are months that
            haven't finished.
          </p>
        </div>
      </div>
      {cohorts.length === 0 ? (
        <p className="helper-copy">No first orders in this period.</p>
      ) : (
        <div className="cohort-scroll">
          <table className="cohort-table">
            <thead>
              <tr>
                <th scope="col">First order</th>
                <th scope="col">Customers</th>
                {Array.from({ length: months }, (_, index) => (
                  <th scope="col" key={index}>
                    Month {index + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((row) => (
                <tr key={row.cohort}>
                  <th scope="row">{cohortLabel(row.cohort)}</th>
                  <td className="cohort-size">
                    {row.customers.toLocaleString()}
                  </td>
                  {row.retained.map((value, index) => {
                    if (value === null || !row.customers)
                      return <td key={index} className="cohort-empty" />;
                    const rate = value / row.customers;
                    const step = Math.min(
                      RAMP.length - 1,
                      Math.floor((rate / max) * RAMP.length),
                    );
                    return (
                      <td
                        key={index}
                        className={`cohort-cell${step >= 3 ? " cohort-cell--dark" : ""}`}
                        style={{ "--cell": RAMP[step] } as CSSProperties}
                        title={`${value.toLocaleString()} of ${row.customers.toLocaleString()} customers`}
                      >
                        {percent(rate)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TopProducts({
  rows,
  currency,
  leaderProduct,
}: {
  rows: readonly TopProductRow[];
  currency: string;
  leaderProduct: string | null;
}) {
  const max = Math.max(1, ...rows.map((row) => row.revenueMinor));
  return (
    <section
      className="panel dashboard-panel chart-panel"
      aria-labelledby="top-products-title"
    >
      <div className="chart-panel-head">
        <div>
          <h2 id="top-products-title">Top products by revenue</h2>
          <p className="helper-copy">
            Line totals after discounts in the filtered orders.
            {leaderProduct ? " The repeat-rate leader is highlighted." : ""}
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="helper-copy">No orders in this period.</p>
      ) : (
        <table className="chart-table top-products">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Units</th>
              <th scope="col">Orders</th>
              <th scope="col">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.product}
                className={
                  row.product === leaderProduct ? "is-leader" : undefined
                }
              >
                <th scope="row">{row.product}</th>
                <td>{row.units.toLocaleString()}</td>
                <td>{row.orders.toLocaleString()}</td>
                <td>
                  <span className="inline-bar">
                    <span
                      className={
                        row.product === leaderProduct
                          ? "chart-fill--leader"
                          : "chart-fill--base"
                      }
                      style={{ width: `${(row.revenueMinor / max) * 100}%` }}
                    />
                  </span>
                  {money(row.revenueMinor, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
