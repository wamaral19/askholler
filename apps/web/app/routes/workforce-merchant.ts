import { redirect } from "react-router";

import {
  executeOperationsRequest,
  getTenantContext,
} from "../lib/operations-service.server";
import {
  safeRedirectPath,
  workforceMerchantCookie,
} from "../lib/workforce-session.server";

/** Switches the merchant the workforce is acting on, within its allowlist. */
export async function action({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const form = await request.formData();
    const merchantId = String(form.get("merchantId") ?? "");
    if (!context.merchantIds.includes(merchantId))
      throw Response.json(
        { error: { code: "MERCHANT_ACCESS_DENIED" } },
        { status: 403 },
      );
    const back = safeRedirectPath(form.get("redirectTo"));
    // An interview belongs to one merchant; land on the new merchant's queue.
    const target = back.startsWith("/interviews/") ? "/queue" : back;
    return redirect(target, {
      headers: { "Set-Cookie": workforceMerchantCookie(request, merchantId) },
    });
  });
}
