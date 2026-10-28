import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { describeCohortExpression } from "../components/angle-builder-form";
import { authenticateMerchant } from "../lib/merchant-context.server";
import { momentStatusLabels } from "../lib/moment-status";
import {
  executeOperationsRequest,
  getOperationsService,
} from "../lib/operations-service.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { context } = await authenticateMerchant(request);
  return executeOperationsRequest(async () => {
    if (!params.researchId)
      throw new Response("Research is required", { status: 400 });
    const service = getOperationsService();
    const [configuration, library] = await Promise.all([
      service.getMomentConfiguration(context, params.researchId),
      service.listResearchFields(context),
    ]);
    // Only what the merchant's page shows.
    return {
      id: configuration.id,
      name: configuration.name,
      objective: configuration.objective,
      status: configuration.status,
      weeklyTarget: configuration.weeklyTarget,
      cohort: describeCohortExpression(configuration.cohortExpression),
      fields: configuration.fields.flatMap((item) => {
        const field = library.find(
          (candidate) => candidate.fieldId === item.fieldId,
        );
        return field
          ? [
              {
                id: item.fieldId,
                label: field.label,
                prompt: field.prompt,
                required: item.required,
              },
            ]
          : [];
      }),
      prompts: configuration.prompts.map(({ id, title, prompt }) => ({
        id,
        title,
        prompt,
      })),
    };
  });
}

export default function ResearchDetail() {
  const research = useLoaderData<typeof loader>();
  return (
    <div className="merchant-home">
      <header className="shopify-app__header">
        <p className="eyebrow">
          <Link to="/app">Research runs</Link> ·{" "}
          {momentStatusLabels[research.status]}
        </p>
        <h1>{research.name}</h1>
        <p>{research.objective}</p>
        <p className="merchant-run__meta">
          {research.weeklyTarget > 0
            ? `Target: ${research.weeklyTarget} interviews a week · `
            : ""}
          <Link to={`/app/calls?research=${encodeURIComponent(research.id)}`}>
            View completed calls →
          </Link>
        </p>
      </header>

      <section className="sheet-section">
        <header className="sheet-section__header">
          <h2>Who we call</h2>
        </header>
        <p>
          Customers whose order completes and who match:{" "}
          <strong>
            {research.cohort ??
              "rules Holler set up with you for this research"}
          </strong>
        </p>
      </section>

      <section className="sheet-section">
        <header className="sheet-section__header">
          <h2>What researchers record</h2>
          <span className="sheet-section__meta">
            {research.fields.length} questions,{" "}
            {research.fields.filter((field) => field.required).length} required
          </span>
        </header>
        {research.fields.length ? (
          <ol className="merchant-questions">
            {research.fields.map((field) => (
              <li key={field.id}>
                <strong>{field.label}</strong>
                {field.required ? (
                  <span className="merchant-run__meta"> · Required</span>
                ) : null}
                {field.prompt && field.prompt !== field.label ? (
                  <p>{field.prompt}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="sheet-empty">No research questions on file.</p>
        )}
      </section>

      <section className="sheet-section">
        <header className="sheet-section__header">
          <h2>Interview script</h2>
          <span className="sheet-section__meta">
            Asked in this order on every call
          </span>
        </header>
        {research.prompts.length ? (
          <ol className="merchant-questions">
            {research.prompts.map((prompt) => (
              <li key={prompt.id}>
                <strong>{prompt.title}</strong>
                <p>{prompt.prompt}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="sheet-empty">
            Holler will choose the interview script for this research.
          </p>
        )}
      </section>
    </div>
  );
}
