import { Outlet } from "react-router";

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
    };
  });
}

export default function WorkforceLayout() {
  return <Outlet />;
}
