import { redirect, type LoaderFunctionArgs } from "react-router";

import {
  beginGoogleSignIn,
  merchantPortalOidcConfigFromEnvironment,
} from "../lib/google-oidc.server";
import { safePortalRedirectPath } from "../lib/merchant-portal-auth.server";

/** Redirects a merchant to Google with a fresh state, nonce, and PKCE challenge. */
export function loader({ request }: LoaderFunctionArgs) {
  const config = merchantPortalOidcConfigFromEnvironment(process.env);
  if (!config) throw new Response("Not Found", { status: 404 });
  const { location, cookie } = beginGoogleSignIn(
    config,
    request,
    safePortalRedirectPath(new URL(request.url).searchParams.get("redirectTo")),
  );
  return redirect(location, {
    headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" },
  });
}
