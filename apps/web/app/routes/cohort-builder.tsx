import { Link, redirect, useActionData, useLoaderData } from "react-router";

import { AngleBuilderForm } from "../components/angle-builder-form";
import { AppShell, PrototypeBanner } from "../components/app-shell";
import { MomentStatusMenu } from "../components/moment-status-menu";
import { angleSaveErrors, momentInputFromForm } from "../lib/angle-form";
import { canManageMoments } from "../lib/moment-status";
import { categoryOptions } from "../lib/prototype-data";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { formErrorFrom } from "../lib/route-forms";

interface Args {
  readonly request: Request;
  /** Set on /moments/:momentId/edit; absent when building a new angle. */
  readonly params: { readonly momentId?: string };
}

export async function loader({ request, params }: Args) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const service = getOperationsService();
    const [fields, scripts, initial] = await Promise.all([
      service.listResearchFields(context),
      service.listScripts(context),
      params.momentId
        ? service.getMomentConfiguration(context, params.momentId)
        : undefined,
    ]);
    return {
      fields,
      scripts,
      initial,
      categories: categoryOptions,
      canManage: canManageMoments(context.roles),
    };
  });
}

export async function action({ request, params }: Args) {
  try {
    return await saveMomentAction(request, params.momentId);
  } catch (thrown) {
    // Validation failures stay on the page instead of the error boundary.
    if (thrown instanceof Response && thrown.status === 400)
      return formErrorFrom(thrown, angleSaveErrors);
    throw thrown;
  }
}

async function saveMomentAction(request: Request, momentId?: string) {
  return executeOperationsRequest(async () => {
    const { momentId: _posted, ...input } = momentInputFromForm(
      await request.formData(),
    );
    const result = await getOperationsService().saveMoment(
      await getTenantContext(request),
      momentId ? { ...input, momentId } : input,
    );
    // A reviewed draft that launches goes back to the list it now runs in.
    if (momentId && input.publish) throw redirect("/moments");
    return { ...result, published: input.publish };
  });
}

export function meta() {
  return [{ title: "Angle builder · Holler" }];
}

export default function CohortBuilderRoute() {
  const { fields, scripts, initial, canManage } =
    useLoaderData<typeof loader>();
  const saved = useActionData<typeof action>();

  return (
    <AppShell
      eyebrow="Angle setup"
      title={initial ? initial.name : "Angle builder"}
      description="Choose which orders qualify, what to learn, and the script to follow. Launching makes the angle live, so new qualifying orders go straight to the queue."
      actions={
        <>
          {initial && canManage ? <MomentStatusMenu moment={initial} /> : null}
          <Link className="button button-quiet" to="/moments">
            Back to angles
          </Link>
        </>
      }
    >
      <PrototypeBanner>
        Configuration is submitted through the tenant-scoped application
        service.
      </PrototypeBanner>
      <AngleBuilderForm
        fields={fields}
        {...(initial ? { initial, canManage } : {})}
        key={initial?.id ?? "new"}
        mode="staff"
        saved={saved}
        scripts={scripts}
      />
    </AppShell>
  );
}
