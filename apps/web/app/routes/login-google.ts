import { redirect, type LoaderFunctionArgs } from "react-router";

import {
  beginGoogleSignIn,
  googleOidcConfigFromEnvironment,
} from "../lib/google-oidc.server";
import { usesOidcWorkforceAuth } from "../lib/operations-service.server";

/** Redirects to Google with a fresh state, nonce, and PKCE challenge. */
export function loader({ request }: LoaderFunctionArgs) {
  if (!usesOidcWorkforceAuth())
    throw new Response("Not Found", { status: 404 });
  const { location, cookie } = beginGoogleSignIn(
    googleOidcConfigFromEnvironment(process.env),
    request,
    new URL(request.url).searchParams.get("redirectTo"),
  );
  return redirect(location, {
    headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" },
  });
}
