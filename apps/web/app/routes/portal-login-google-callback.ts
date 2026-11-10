import type { LoaderFunctionArgs } from "react-router";

import { completePortalSignIn } from "../lib/merchant-portal-sign-in.server";

/**
 * Completes Google sign-in. The account's Workspace domain is the gate: it
 * must be registered to a merchant, and the session is scoped to that one.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  return completePortalSignIn(request);
}
