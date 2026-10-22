import { Form, Link, useLoaderData } from "react-router";
import { AppShell, PrototypeBanner } from "../components/app-shell";
import {
  CohortRetention,
  OrdersOverTime,
  ReorderTimingChart,
  SourcesBySequence,
  TopProducts,
} from "../components/dashboard-charts";
import { RepeatByProduct } from "../components/repeat-by-product";
import { parseDashboardFilters, repeatLeader } from "../lib/analytics";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    return getOperationsService().getDashboard(
      context,
      parseDashboardFilters(new URL(request.url)),
    );
  });
}

export function meta() {
  return [{ title: "Dashboard · Holler" }];
}

export default function AdminDashboardRoute() {
  const snapshot = useLoaderData<typeof loader>();
  const { metrics, filters } = snapshot;
  const currency = (minor: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: metrics.currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  const leader = repeatLeader(snapshot.repeatByProduct);
  return (
    <AppShell
      eyebrow="Admin only"
      title="Dashboard"
      description="What the orders say: who buys, who comes back, and when."
    >
      <PrototypeBanner>
        Every filter maps to a fixed predicate; no arbitrary query text is
        accepted.
      </PrototypeBanner>
      <Form className="dashboard-filters panel" method="get">
        <label>
          <span>Start</span>
          <input name="start" type="date" defaultValue={filters.start} />
        </label>
        <label>
          <span>End</span>
          <input name="end" type="date" defaultValue={filters.end} />
        </label>
        <label>
          <span>Customer</span>
          <select name="customerType" defaultValue={filters.customerType}>
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="repeat">Repeat</option>
          </select>
        </label>
        <label>
          <span>Attribution</span>
          <select name="attribution" defaultValue={filters.attribution}>
            <option value="all">All</option>
            <option value="meta">Meta</option>
            <option value="google">Google</option>
            <option value="direct">Direct</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          <span>SKU</span>
          <input
            name="sku"
            pattern="[A-Za-z0-9._-]+"
            defaultValue={filters.sku ?? ""}
          />
        </label>
        <label>
          <span>Group by</span>
          <select name="granularity" defaultValue={filters.granularity}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <button className="button button-primary" type="submit">
          Apply filters
        </button>
      </Form>
      <section
        className="metric-grid metric-grid--four"
        aria-label="Commerce metrics"
      >
        <Metric label="Orders" value={metrics.orders.toLocaleString()} />
        <Metric label="Revenue" value={currency(metrics.revenueMinor)} />
        <Metric
          label="Average order"
          value={
            metrics.orders
              ? currency(metrics.revenueMinor / metrics.orders)
              : "—"
          }
        />
        <Metric
          label="Refunded orders"
          value={metrics.refundedOrders.toLocaleString()}
        />
        <Metric
          label="First orders"
          value={metrics.newCustomers.toLocaleString()}
        />
        <Metric
          label="Repeat orders"
          value={metrics.repeatCustomers.toLocaleString()}
        />
        <Metric
          label="Repeat share of orders"
          value={`${metrics.repurchaseRate}%`}
        />
        <Metric
          label="Top repeat product"
          value={leader ? `${leader.multiple.toFixed(1)}×` : "—"}
          note={leader ? leader.product : "No clear leader"}
        />
      </section>
      <OrdersOverTime
        series={snapshot.series}
        granularity={filters.granularity}
        currency={metrics.currency}
      />
      <RepeatByProduct
        rows={snapshot.repeatByProduct}
        action={
          <Link className="button button-small" to="/moments">
            See the angles asking these customers
          </Link>
        }
      />
      <div className="dashboard-columns">
        <ReorderTimingChart timing={snapshot.reorderTiming} />
        <SourcesBySequence rows={snapshot.sources} />
      </div>
      <CohortRetention cohorts={snapshot.cohorts} />
      <div className="dashboard-columns">
        <TopProducts
          rows={snapshot.topProducts}
          currency={metrics.currency}
          leaderProduct={leader?.product ?? null}
        />
        <section className="panel dashboard-panel">
          <h2>Reusable cohort</h2>
          <p className="helper-copy">
            Copy this snapshot into a Research Moment as validated predicates.
          </p>
          <pre>{JSON.stringify(snapshot.cohortExpression, null, 2)}</pre>
          <h2>Research setup</h2>
          <p className="helper-copy">
            Edit reusable questions and library scripts.
          </p>
          <div className="dashboard-links">
            <Link className="button button-small" to="/admin/research-fields">
              Manage fields
            </Link>
            <Link className="button button-small" to="/admin/scripts">
              Manage scripts
            </Link>
          </div>
        </section>
      </div>
      {snapshot.limitations.map((item) => (
        <p className="inline-notice" key={item}>
          {item}
        </p>
      ))}
    </AppShell>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small title={note}>{note}</small> : null}
    </article>
  );
}
