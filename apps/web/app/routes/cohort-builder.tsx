import { Link, useActionData, useLoaderData } from "react-router";

import { AngleBuilderForm } from "../components/angle-builder-form";
import { AppShell, PrototypeBanner } from "../components/app-shell";
import { angleSaveErrors, momentInputFromForm } from "../lib/angle-form";
import { categoryOptions } from "../lib/prototype-data";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { formErrorFrom } from "../lib/route-forms";

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const service = getOperationsService();
    const [fields, scripts] = await Promise.all([
      service.listResearchFields(context),
      service.listScripts(context),
    ]);
    return { fields, scripts, categories: categoryOptions };
  });
}

export async function action({ request }: { request: Request }) {
  try {
    return await saveMomentAction(request);
  } catch (thrown) {
    // Validation failures stay on the page instead of the error boundary.
    if (thrown instanceof Response && thrown.status === 400)
      return formErrorFrom(thrown, angleSaveErrors);
    throw thrown;
  }
}

async function saveMomentAction(request: Request) {
  return executeOperationsRequest(async () => {
    const input = momentInputFromForm(await request.formData());
    const result = await getOperationsService().saveMoment(
      await getTenantContext(request),
      input,
    );
    return { ...result, published: input.publish };
  });
}

export function meta() {
  return [{ title: "Angle builder · Holler" }];
}

export default function CohortBuilderRoute() {
  const { fields, scripts } = useLoaderData<typeof loader>();
  const saved = useActionData<typeof action>();

  return (
    <AppShell
      eyebrow="Angle setup"
      title="Angle builder"
      description="Choose which orders qualify, what to learn, and the script to follow. Launching makes the angle live, so new qualifying orders go straight to the queue."
      actions={
        <Link className="button button-quiet" to="/moments">
          Back to angles
        </Link>
      }
    >
      <PrototypeBanner>
        Configuration is submitted through the tenant-scoped application
        service.
      </PrototypeBanner>
      <AngleBuilderForm
        fields={fields}
        mode="staff"
        saved={saved}
        scripts={scripts}
      />
    </AppShell>
  );
}
