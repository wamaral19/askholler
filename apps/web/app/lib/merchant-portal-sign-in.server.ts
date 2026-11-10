import { redirect } from "react-router";

import {
  GoogleSignInError,
  clearOidcFlowCookie,
  completeGoogleSignIn,
  defaultGoogleOidcDependencies,
  merchantPortalOidcConfigFromEnvironment,
  type GoogleOidcDependencies,
} from "./google-oidc.server";
import {
  MerchantPortalError,
  getMerchantPortalDirectory,
  merchantPortalSessionCookie,
  safePortalRedirectPath,
  type MerchantPortalDirectory,
} from "./merchant-portal-auth.server";

/** Finishes the portal's Google callback: verify, gate on domain, start a session. */
export async function completePortalSignIn(
  request: Request,
  dependencies?: GoogleOidcDependencies,
  directory?: MerchantPortalDirectory,
): Promise<Response> {
  const config = merchantPortalOidcConfigFromEnvironment(process.env);
  if (!config) throw new Response("Not Found", { status: 404 });
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearOidcFlowCookie(config, request));
  try {
    const { identity, redirectTo } = await completeGoogleSignIn(
      config,
      dependencies ?? defaultGoogleOidcDependencies(),
      request,
    );
    const token = await (directory ?? getMerchantPortalDirectory()).signIn(
      identity,
    );
    headers.append("Set-Cookie", merchantPortalSessionCookie(request, token));
    return redirect(safePortalRedirectPath(redirectTo), { headers });
  } catch (error) {
    const reason =
      error instanceof MerchantPortalError
        ? "not_registered"
        : error instanceof GoogleSignInError &&
            error.code === "OIDC_DOMAIN_DENIED"
          ? "workspace"
          : "failed";
    // Only the safe code is logged; never the email, domain, or tokens.
    console.warn(
      JSON.stringify({
        event: "merchant_portal.sign_in_failed",
        code:
          error instanceof GoogleSignInError ||
          error instanceof MerchantPortalError
            ? error.code
            : "UNEXPECTED",
      }),
    );
    return redirect(`/portal/login?error=${reason}`, { headers });
  }
}
