import { useId, useState, type CSSProperties, type ReactNode } from "react";

import {
  MIN_REPEAT_COHORT,
  repeatLeader,
  repeatRate,
  type RepeatByProductRow,
} from "../lib/analytics";

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Repeat purchase rate by first-order product: one bar per product, the
 * clear leader (if any) highlighted against the rest of the catalog, with a
 * reference line at the rest-of-catalog rate. Products with too few
 * first-order customers to rank are left out and counted below the chart.
 */
export function RepeatByProduct({
  rows,
  action,
}: {
  rows: readonly RepeatByProductRow[];
  /** Shown under the headline when a product clearly leads. */
  action?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const tableId = useId();
  const ranked = rows
    .filter((row) => row.customers >= MIN_REPEAT_COHORT)
    .sort((a, b) => repeatRate(b) - repeatRate(a));
  const hidden = rows.length - ranked.length;
  const leader = repeatLeader(rows);
  const scaleMax = Math.max(0.1, ...ranked.map(repeatRate)) * 1.08;
  const position = (rate: number) => `${(rate / scaleMax) * 100}%`;

  return (
    <section
      className="panel dashboard-panel repeat-panel"
      aria-labelledby={`${tableId}-title`}
    >
      <div className="repeat-panel-head">
        <div>
          <h2 id={`${tableId}-title`}>Repeat purchase rate by first product</h2>
          <p className="helper-copy">
            Customers whose first order fell in this period and included each
            product, and the share who have ordered again since.
          </p>
        </div>
        <button
          className="text-button"
          type="button"
          aria-controls={tableId}
          aria-expanded={showTable}
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {leader ? (
        <div className="repeat-callout">
          <p className="repeat-callout-headline">
            {leader.product} customers come back {leader.multiple.toFixed(1)}×
            as often.
          </p>
          <p>
            {percent(leader.rate)} of first-time {leader.product} buyers ordered
            again, against {percent(leader.othersRate)} for the rest of the
            catalog. <strong>Why?</strong> Orders can tell you that they come
            back, not why.
          </p>
          {action}
        </div>
      ) : null}

      {ranked.length === 0 ? (
        <p className="helper-copy">
          No product has {MIN_REPEAT_COHORT} or more first-order customers in
          this period yet. Widen the date range.
        </p>
      ) : showTable ? (
        <table className="repeat-table" id={tableId}>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">First-order customers</th>
              <th scope="col">Ordered again</th>
              <th scope="col">Repeat rate</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => (
              <tr key={row.product}>
                <th scope="row">{row.product}</th>
                <td>{row.customers.toLocaleString()}</td>
                <td>{row.repeatCustomers.toLocaleString()}</td>
                <td>{percent(repeatRate(row))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="repeat-chart" id={tableId} role="list">
          {leader ? (
            <div
              className="repeat-reference"
              style={{ "--at": leader.othersRate / scaleMax } as CSSProperties}
              aria-hidden="true"
            >
              <span>Rest of catalog {percent(leader.othersRate)}</span>
            </div>
          ) : null}
          {ranked.map((row) => {
            const rate = repeatRate(row);
            const isLeader = leader?.product === row.product;
            return (
              <div
                className={`repeat-row${isLeader ? " repeat-row--leader" : ""}${hovered === row.product ? " is-hovered" : ""}`}
                key={row.product}
                role="listitem"
                tabIndex={0}
                aria-label={`${row.product}: ${percent(rate)} repeat rate, ${row.repeatCustomers} of ${row.customers} customers`}
                onMouseEnter={() => setHovered(row.product)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(row.product)}
                onBlur={() => setHovered(null)}
              >
                <span className="repeat-label" title={row.product}>
                  {row.product}
                </span>
                <span className="repeat-track">
                  <span
                    className="repeat-bar"
                    style={{ width: position(rate) }}
                  />
                  <span
                    className="repeat-value"
                    style={{ left: position(rate) }}
                  >
                    {percent(rate)}
                  </span>
                  {hovered === row.product ? (
                    <span className="repeat-tooltip" role="tooltip">
                      <strong>{row.product}</strong>
                      {row.repeatCustomers.toLocaleString()} of{" "}
                      {row.customers.toLocaleString()} first-order customers
                      ordered again
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {hidden > 0 ? (
        <p className="helper-copy">
          {hidden} {hidden === 1 ? "product has" : "products have"} fewer than{" "}
          {MIN_REPEAT_COHORT} first-order customers and{" "}
          {hidden === 1 ? "is" : "are"} not ranked.
        </p>
      ) : null}
    </section>
  );
}
