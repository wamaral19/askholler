import { Outlet } from "react-router";

import { demoModeEnabled } from "../lib/demo/demo-service.server";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";

/** Sidebar data shared by every signed-in workforce page. */
export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    return {
      merchantId: context.merchantId,
      merchants: await getOperationsService().listMerchants(context),
      showDemo: demoModeEnabled() && context.roles.includes("platform_admin"),
      showBilling: context.roles.includes("platform_admin"),
      // Set by the sidebar toggle in the browser; read here so a collapsed
      // sidebar renders collapsed without a flash.
      sidebarCollapsed: /(?:^|;\s*)holler_sidebar=collapsed(?:;|$)/.test(
        request.headers.get("cookie") ?? "",
      ),
    };
  });
}

export default function WorkforceLayout() {
  return <Outlet />;
}
