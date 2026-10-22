import { Link, useLoaderData } from "react-router";

import { RepeatByProduct } from "../components/repeat-by-product";
import { repeatLeader } from "../lib/analytics";
import {
  demoContext,
  demoModeEnabled,
  demoReportFacts,
  getCurrentDemo,
} from "../lib/demo/demo-service.server";
import { buildDemoAngle } from "../lib/demo/angle";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { getShopifyIngestionDatabase } from "../lib/shopify-ingestion.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loader({ request }: { request: Request }) {
  if (!demoModeEnabled()) throw new Response("Not found", { status: 404 });
  return executeOperationsRequest(async () => {
    const operator = await getTenantContext(request);
    if (!operator.roles.includes("platform_admin"))
      throw Response.json(
        { error: { code: "PLATFORM_ADMIN_REQUIRED" } },
        { status: 403 },
      );
    const db = getShopifyIngestionDatabase();
    const demo = await getCurrentDemo(db);
    if (!demo) throw new Response("Start a demo first.", { status: 404 });
    const context = demoContext(operator);
    const operations = getOperationsService();
    const today = new Date();
    const dashboard = await operations.getDashboard(context, {
      start: new Date(today.getTime() - 200 * DAY_MS)
        .toISOString()
        .slice(0, 10),
      end: today.toISOString().slice(0, 10),
      customerType: "all",
      attribution: "all",
      granularity: "week",
    });
    const facts = await demoReportFacts(db, demo);
    // The live call is optional: before it happens the report says so.
    const call = facts.interviewId
      ? await operations
          .getCallReview(context, facts.interviewId)
          .catch(() => null)
      : null;
    const hero = demo.config.products[demo.config.heroIndex]!;
    const angle = buildDemoAngle({
      companyName: demo.companyName,
      heroTitle: hero.title,
      otherTitles: demo.config.products
        .filter((product) => product !== hero)
        .map((product) => product.title),
    });
    return {
      companyName: demo.companyName,
      heroTitle: hero.title,
      angle: { name: angle.name, question: angle.question },
      sample: demo.sample,
      repeatByProduct: dashboard.repeatByProduct,
      totalOrders: dashboard.metrics.orders,
      facts,
      call: call && {
        id: call.id,
        orderNumber: call.assignment.orderNumber,
        durationSeconds: call.durationSeconds,
        transcriptStatus: call.transcriptStatus,
        transcript: call.transcript
          .filter((line) => line.speaker === "customer" && line.text.trim())
          .slice(0, 12),
        notes: call.prompts.filter(
          (prompt) => prompt.note.trim() || prompt.selected.length,
        ),
      },
      generatedAt: today.toISOString(),
    };
  });
}

export function meta() {
  return [{ title: "Sample report · Holler" }];
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta ads",
  google: "Google",
  tiktok: "TikTok ads",
  klaviyo: "Email",
  postscript: "SMS",
  direct: "Direct",
  unknown: "Unattributed",
};

export default function DemoReportRoute() {
  const report = useLoaderData<typeof loader>();
  const leader = repeatLeader(report.repeatByProduct);
  const { interviews, findings, actions } = report.sample;
  const discovery = findings.find(
    (finding) => finding.promptId === "discovery",
  );
  const sourceTotal = report.facts.heroFirstOrderSources.reduce(
    (sum, row) => sum + row.customers,
    0,
  );
  const paid = report.facts.heroFirstOrderSources
    .filter((row) => ["meta", "google", "tiktok"].includes(row.source))
    .reduce((sum, row) => sum + row.customers, 0);
  const wordOfMouth = discovery?.rows
    .filter((row) => /friend|creator/i.test(row.label))
    .reduce((sum, row) => sum + row.count, 0);

  return (
    <main className="demo-report">
      <div className="demo-report-toolbar">
        <Link to="/demo">← Demo console</Link>
        <button
          className="button button-small"
          type="button"
          onClick={() => window.print()}
        >
          Print or save as PDF
        </button>
      </div>
      <header>
        <img
          src="/brand/holler-wordmark.png"
          alt="Holler"
          className="demo-report-logo"
        />
        <p className="eyebrow">Research Run report · {report.companyName}</p>
        <h1>{report.angle.question}</h1>
        <p className="demo-report-sample" role="note">
          <strong>Sample report.</strong> Commerce figures come from this demo's{" "}
          {report.totalOrders.toLocaleString()} synthetic orders. The{" "}
          {interviews} interviews are illustrative; the call from today's demo
          is real.
        </p>
      </header>

      <section aria-labelledby="summary">
        <h2 id="summary">Executive summary</h2>
        <ul className="demo-report-summary">
          {leader ? (
            <li>
              <strong>
                {report.heroTitle} buyers come back {leader.multiple.toFixed(1)}
                × as often as the rest of the catalog
              </strong>{" "}
              ({percent(leader.rate)} against {percent(leader.othersRate)}).
              {report.facts.heroReorderDays
                ? ` They reorder about every ${report.facts.heroReorderDays} days.`
                : ""}
            </li>
          ) : null}
          <li>
            <strong>They come back because it works and they run out.</strong>{" "}
            {findings[0]?.rows[0]?.count} of {interviews} said the product
            worked so there was no reason to switch; running low was the most
            common trigger for today's order.
          </li>
          {wordOfMouth ? (
            <li>
              <strong>
                {wordOfMouth} of {interviews} first heard of{" "}
                {report.companyName} from a person, not an ad.
              </strong>{" "}
              {sourceTotal
                ? `Shopify credits ${percent(paid / sourceTotal)} of these customers' first orders to paid ads.`
                : null}
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="orders">
        <h2 id="orders">What the orders show</h2>
        <RepeatByProduct rows={report.repeatByProduct} />
        <dl className="demo-report-tiles">
          <div>
            <dt>Median days to second order, {report.heroTitle}</dt>
            <dd>{report.facts.heroReorderDays ?? "—"}</dd>
          </div>
          <div>
            <dt>Median days to second order, rest of catalog</dt>
            <dd>{report.facts.othersReorderDays ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="interviews">
        <h2 id="interviews">What customers told us</h2>
        <p className="demo-report-method">
          {interviews} repeat buyers of {report.heroTitle}, interviewed within
          minutes of their repeat order.
        </p>
        <div className="demo-report-findings">
          {findings.map((finding) => (
            <article key={finding.promptId} className="demo-finding">
              <h3>{finding.question}</h3>
              <ul>
                {finding.rows.map((row) => (
                  <li key={row.label}>
                    <span className="demo-finding-label">{row.label}</span>
                    <span className="demo-finding-track" aria-hidden="true">
                      <span
                        style={{ width: `${(row.count / interviews) * 100}%` }}
                      />
                    </span>
                    <span className="demo-finding-count">
                      {row.count} of {interviews}
                    </span>
                  </li>
                ))}
              </ul>
              <blockquote>“{finding.rows[0]?.quote}”</blockquote>
            </article>
          ))}
        </div>
      </section>

      {discovery ? (
        <section aria-labelledby="attribution">
          <h2 id="attribution">What Shopify saw and what customers said</h2>
          <div className="demo-report-compare">
            <div>
              <h3>Shopify last click on their first order</h3>
              <p className="demo-report-method">
                {sourceTotal.toLocaleString()} repeat buyers of{" "}
                {report.heroTitle}
              </p>
              <ul>
                {report.facts.heroFirstOrderSources.map((row) => (
                  <li key={row.source}>
                    <span>{SOURCE_LABELS[row.source] ?? row.source}</span>
                    <strong>
                      {sourceTotal ? percent(row.customers / sourceTotal) : "—"}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Where they say they first heard of you</h3>
              <p className="demo-report-method">{interviews} interviews</p>
              <ul>
                {discovery.rows.map((row) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <strong>{percent(row.count / interviews)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p>
            The two are kept separate on purpose. Last click records the session
            that converted; interviews record what started the relationship.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="live-call">
        <h2 id="live-call">From today's call</h2>
        {report.call ? (
          <>
            <p className="demo-report-method">
              Order {report.call.orderNumber ?? "—"}
              {report.call.durationSeconds
                ? ` · ${Math.round(report.call.durationSeconds / 60)} min call`
                : ""}{" "}
              · <Link to={`/calls/${report.call.id}`}>Full call review</Link>
            </p>
            {report.call.notes.length ? (
              <ul className="demo-report-notes">
                {report.call.notes.map((note) => (
                  <li key={note.key}>
                    <strong>{note.title}</strong>
                    {note.selected.length ? (
                      <span> {note.selected.join(", ")}.</span>
                    ) : null}
                    {note.note ? <span> {note.note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {report.call.transcript.length ? (
              <div className="demo-report-transcript">
                {report.call.transcript.map((line) => (
                  <blockquote key={line.sequence}>“{line.text}”</blockquote>
                ))}
              </div>
            ) : (
              <p className="helper-copy">
                {report.call.transcriptStatus === "processing"
                  ? "The transcript is still processing. Refresh in a moment."
                  : "No transcript was captured for this call."}
              </p>
            )}
          </>
        ) : (
          <p className="helper-copy">
            After the live call, its notes and the customer's own words appear
            here.
          </p>
        )}
      </section>

      <section aria-labelledby="actions">
        <h2 id="actions">Recommended actions</h2>
        <ol className="demo-report-actions">
          {actions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <footer className="demo-report-footer">
        <h2>Method</h2>
        <p>
          Angle: {report.angle.name}. Cohort: customers who previously bought{" "}
          {report.heroTitle}, reached while placing a repeat order. Commerce
          rates count customers whose first order included each product and
          whether they ordered again; products with fewer than 20 such customers
          are not ranked. Interview counts are out of completed interviews and
          are not projected onto the customer base.
        </p>
        <p>Generated {new Date(report.generatedAt).toLocaleString()}.</p>
      </footer>
    </main>
  );
}
