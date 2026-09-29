import { redirect, type LoaderFunctionArgs } from "react-router";

import {
  GoogleSignInError,
  clearOidcFlowCookie,
  completeGoogleSignIn,
  defaultGoogleOidcDependencies,
  googleOidcConfigFromEnvironment,
} from "../lib/google-oidc.server";
import {
  getWorkforceDirectory,
  usesOidcWorkforceAuth,
} from "../lib/operations-service.server";
import { WorkforceSignInError } from "../lib/workforce-directory.server";
import {
  clearWorkforceMerchantCookie,
  workforceSessionCookie,
} from "../lib/workforce-session.server";

/** Completes Google sign-in and starts a stored workforce session. */
export async function loader({ request }: LoaderFunctionArgs) {
  if (!usesOidcWorkforceAuth())
    throw new Response("Not Found", { status: 404 });
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearOidcFlowCookie(request));
  try {
    const { identity, redirectTo } = await completeGoogleSignIn(
      googleOidcConfigFromEnvironment(process.env),
      defaultGoogleOidcDependencies(),
      request,
    );
    const token = await getWorkforceDirectory().signIn(identity);
    headers.append("Set-Cookie", workforceSessionCookie(request, token));
    headers.append("Set-Cookie", clearWorkforceMerchantCookie(request));
    return redirect(redirectTo, { headers });
  } catch (error) {
    const reason =
      error instanceof WorkforceSignInError
        ? "not_provisioned"
        : error instanceof GoogleSignInError &&
            error.code === "OIDC_DOMAIN_DENIED"
          ? "domain"
          : "failed";
    // Only the safe code is logged; never the email, subject, or tokens.
    console.warn(
      JSON.stringify({
        event: "workforce.sign_in_failed",
        code:
          error instanceof GoogleSignInError ||
          error instanceof WorkforceSignInError
            ? error.code
            : "UNEXPECTED",
      }),
    );
    return redirect(`/login?error=${reason}`, { headers });
  }
}
