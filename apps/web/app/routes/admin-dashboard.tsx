import { Form, Link, useLoaderData } from "react-router";
import { AppShell, PrototypeBanner } from "../components/app-shell";
import { parseDashboardFilters } from "../lib/analytics";
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
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: snapshot.metrics.currency,
  }).format(snapshot.metrics.revenueMinor / 100);
  return (
    <AppShell
      eyebrow="Admin only"
      title="Dashboard"
      description="Tenant-scoped metrics and reusable, validated cohort controls."
    >
      <PrototypeBanner>
        Every filter maps to a fixed predicate; no arbitrary query text is
        accepted.
      </PrototypeBanner>
      <section className="dashboard-columns" aria-label="Research setup">
        <article className="panel dashboard-panel">
          <h2>Research fields</h2>
          <p className="helper-copy">
            Edit reusable questions and choose which ones new research runs
            include, require, and ask first.
          </p>
          <Link className="button button-small" to="/admin/research-fields">
            Manage fields
          </Link>
        </article>
        <article className="panel dashboard-panel">
          <h2>Scripts</h2>
          <p className="helper-copy">
            Edit library interview scripts and the order of their steps.
          </p>
          <Link className="button button-small" to="/admin/scripts">
            Manage scripts
          </Link>
        </article>
      </section>
      <Form className="dashboard-filters panel" method="get">
        <label>
          <span>Start</span>
          <input
            name="start"
            type="date"
            defaultValue={snapshot.filters.start}
          />
        </label>
        <label>
          <span>End</span>
          <input name="end" type="date" defaultValue={snapshot.filters.end} />
        </label>
        <label>
          <span>Customer</span>
          <select
            name="customerType"
            defaultValue={snapshot.filters.customerType}
          >
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="repeat">Repeat</option>
          </select>
        </label>
        <label>
          <span>Attribution</span>
          <select
            name="attribution"
            defaultValue={snapshot.filters.attribution}
          >
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
            defaultValue={snapshot.filters.sku ?? ""}
          />
        </label>
        <button className="button button-primary" type="submit">
          Apply filters
        </button>
      </Form>
      <section className="metric-grid" aria-label="Commerce metrics">
        <Metric label="Orders" value={snapshot.metrics.orders} />
        <Metric label="Revenue" value={money} />
        <Metric label="New customers" value={snapshot.metrics.newCustomers} />
        <Metric
          label="Repeat customers"
          value={snapshot.metrics.repeatCustomers}
        />
        <Metric
          label="Repurchase share"
          value={`${snapshot.metrics.repurchaseRate}%`}
        />
        <Metric
          label="Refunded orders"
          value={snapshot.metrics.refundedOrders}
        />
      </section>
      <div className="dashboard-columns">
        <section className="panel dashboard-panel">
          <h2>Observed attribution</h2>
          {snapshot.attribution.map((item) => (
            <div className="distribution-row" key={item.source}>
              <span>{item.source}</span>
              <strong>{item.orders}</strong>
            </div>
          ))}
        </section>
        <section className="panel dashboard-panel">
          <h2>Reusable cohort</h2>
          <p className="helper-copy">
            Copy this snapshot into a Research Moment as validated predicates.
          </p>
          <pre>{JSON.stringify(snapshot.cohortExpression, null, 2)}</pre>
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
