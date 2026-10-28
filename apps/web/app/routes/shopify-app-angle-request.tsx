import {
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import { AngleBuilderForm } from "../components/angle-builder-form";
import { angleSaveErrors, momentInputFromForm } from "../lib/angle-form";
import { authenticateMerchant } from "../lib/merchant-context.server";
import {
  executeOperationsRequest,
  getOperationsService,
} from "../lib/operations-service.server";
import { formErrorFrom } from "../lib/route-forms";

export async function loader({ request }: LoaderFunctionArgs) {
  const { context } = await authenticateMerchant(request);
  return executeOperationsRequest(async () => {
    const service = getOperationsService();
    const [fields, scripts] = await Promise.all([
      service.listResearchFields(context),
      service.listScripts(context),
    ]);
    return { fields, scripts };
  });
}

/** Saved as a draft marked as the merchant's request; nothing goes live. */
export async function action({ request }: ActionFunctionArgs) {
  const { context } = await authenticateMerchant(request);
  try {
    return await executeOperationsRequest(async () => {
      // Merchants only send new requests; staff revise existing research.
      const { momentId: _ignored, ...input } = momentInputFromForm(
        await request.formData(),
      );
      const result = await getOperationsService().saveMoment(context, {
        ...input,
        publish: false,
      });
      return { ...result, published: false };
    });
  } catch (thrown) {
    if (thrown instanceof Response && thrown.status === 400)
      return formErrorFrom(thrown, angleSaveErrors);
    throw thrown;
  }
}

export default function AngleRequest() {
  const { fields, scripts } = useLoaderData<typeof loader>();
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
        saved={saved}
        scripts={scripts}
      />
    </>
  );
}
