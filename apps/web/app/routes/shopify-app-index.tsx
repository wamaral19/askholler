import { useLoaderData, type LoaderFunctionArgs } from "react-router";

import { authenticateMerchant } from "../lib/merchant-context.server";
import {
  executeOperationsRequest,
  getOperationsService,
} from "../lib/operations-service.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { context } = await authenticateMerchant(request);
  return executeOperationsRequest(async () => ({
    runs: await getOperationsService().listCompletedRuns(context),
  }));
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function CompletedResearchRuns() {
  const { runs } = useLoaderData<typeof loader>();
  return (
    <>
      <header className="shopify-app__header">
        <p className="eyebrow">Holler</p>
        <h1>Completed research runs</h1>
        <p>
          Each run is a set of customer interviews about one question. When a
          run finishes, its report appears here and is emailed to you.
        </p>
      </header>
      {runs.length ? (
        <ul className="merchant-runs">
          {runs.map((run) => (
            <li className="shopify-app__card merchant-run" key={run.id}>
              <div>
                <h2>{run.name}</h2>
                {run.objective ? <p>{run.objective}</p> : null}
                <p className="merchant-run__meta">
                  Completed{" "}
                  <time dateTime={run.completedAt}>
                    {dateFormat.format(new Date(run.completedAt))}
                  </time>{" "}
                  · {run.completedInterviews}{" "}
                  {run.completedInterviews === 1 ? "interview" : "interviews"}
                </p>
              </div>
              {run.reportUrl ? (
                <a
                  className="button button-primary"
                  href={run.reportUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View report
                </a>
              ) : (
                <span className="merchant-run__pending">
                  Report in progress
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <section className="shopify-app__card">
          <h2>No completed runs yet</h2>
          <p>
            Holler researchers call your customers after they order and ask how
            they found you and why they bought. When a research run finishes,
            its report will be listed here.
          </p>
          <p>
            Have a question you want answered? Use{" "}
            <strong>Request an angle</strong> to tell us which customers to talk
            to and what to ask.
          </p>
        </section>
      )}
    </>
  );
}
