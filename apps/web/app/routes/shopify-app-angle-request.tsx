import {
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import { AngleBuilderForm } from "../components/angle-builder-form";
import { angleSaveErrors, momentInputFromForm } from "../lib/angle-form";
import {
  launchDevelopmentStoreRequest,
  launchIfDevelopmentStore,
} from "../lib/development-store.server";
import { authenticateMerchantViewer } from "../lib/merchant-context.server";
import { sendOpsAlert, staffUrl } from "../lib/ops-alerts.server";
import {
  executeOperationsRequest,
  getOperationsService,
} from "../lib/operations-service.server";
import { formErrorFrom } from "../lib/route-forms";

export async function loader({ request }: LoaderFunctionArgs) {
  const { context } = await authenticateMerchantViewer(request);
  return executeOperationsRequest(async () => {
    const service = getOperationsService();
    const [fields, scripts, products] = await Promise.all([
      service.listResearchFields(context),
      service.listScripts(context),
      service.listCatalogProducts(context),
    ]);
    return { fields, scripts, products };
  });
}

/**
 * Saved as a draft marked as the merchant's request, for staff to review.
 * On a Shopify development store (where App Store reviewers test) it is
 * launched right away so the request visibly progresses without staff.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { context, shopify } = await authenticateMerchantViewer(request);
  try {
    return await executeOperationsRequest(async () => {
      // Merchants only send new requests; staff revise existing research.
      const {
        momentId: _ignored,
        publish: _publish,
        ...input
      } = momentInputFromForm(await request.formData());
      const service = getOperationsService();
      const result = await service.saveMoment(context, {
        ...input,
        publish: false,
      });
      const published = await launchIfDevelopmentStore(shopify?.admin, () =>
        launchDevelopmentStoreRequest(
          service,
          context.merchantId,
          result.id,
          input,
        ),
      );
      // Never throws; not awaited so a slow webhook doesn't delay the merchant.
      void sendOpsAlert(
        [
          `New research request from ${shopify?.shop ?? "the merchant portal"}: "${input.name}".`,
          published
            ? "Development store: launched automatically."
            : "Waiting for staff review.",
          staffUrl(`/moments/${encodeURIComponent(result.id)}/edit`),
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return { ...result, published };
    });
  } catch (thrown) {
    if (thrown instanceof Response && thrown.status === 400)
      return formErrorFrom(thrown, angleSaveErrors);
    throw thrown;
  }
}

export default function AngleRequest() {
  const { fields, scripts, products } = useLoaderData<typeof loader>();
  const saved = useActionData<typeof action>();
  return (
    <>
      <header className="shopify-app__header">
        <p className="eyebrow">Request research</p>
        <h1>Request research</h1>
        <p>
          Tell us what you want answered by talking to a specific group of
          customers. Describe it here and send it to Holler; we review every
          request with you before any calls start.
        </p>
      </header>
      <AngleBuilderForm
        fields={fields}
        mode="request"
        products={products}
        saved={saved}
        scripts={scripts}
      />
    </>
  );
}
