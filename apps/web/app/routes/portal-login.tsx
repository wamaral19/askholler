import {
  redirect,
  useLoaderData,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";

import { merchantPortalOidcConfigFromEnvironment } from "../lib/google-oidc.server";
import {
  clearMerchantPortalSessionCookie,
  getMerchantPortalDirectory,
  readMerchantPortalToken,
  safePortalRedirectPath,
} from "../lib/merchant-portal-auth.server";

const signInErrors: Record<string, string> = {
  not_registered:
    "Your company isn't set up for Holler sign-in yet. Ask your Holler contact to add your email domain.",
  workspace:
    "Sign in with your work Google account. Personal Gmail accounts can't be used.",
  failed: "Google sign-in did not complete. Try again.",
};

export function loader({ request }: LoaderFunctionArgs) {
  if (!merchantPortalOidcConfigFromEnvironment(process.env))
    throw new Response("Not Found", { status: 404 });
  const params = new URL(request.url).searchParams;
  return {
    redirectTo: safePortalRedirectPath(params.get("redirectTo")),
    error: signInErrors[params.get("error") ?? ""] ?? null,
  };
}

/** Sign-out: revokes the stored session, then clears the cookie. */
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  if (form.get("intent") !== "sign-out")
    throw new Response("Method Not Allowed", { status: 405 });
  const token = readMerchantPortalToken(request);
  if (token) await getMerchantPortalDirectory().revokeSession(token);
  return redirect("/portal/login", {
    headers: { "Set-Cookie": clearMerchantPortalSessionCookie(request) },
  });
}

export default function MerchantPortalLogin() {
  const { redirectTo, error } = useLoaderData<typeof loader>();
  return (
    <main className="workforce-login">
      <section className="panel">
        <div className="brand-lockup">
          <img src="/brand/holler-wordmark.png" alt="Holler" />
          <span>Customer research</span>
        </div>
        <h1>Sign in</h1>
        <p className="lede">
          Use your company Google account. Anyone at your company&rsquo;s email
          domain can see your Holler research.
        </p>
        {error ? (
          <p className="workforce-login__error" role="alert">
            {error}
          </p>
        ) : null}
        <a
          className="button button-primary"
          href={`/portal/login/google?redirectTo=${encodeURIComponent(redirectTo)}`}
        >
          Sign in with Google
        </a>
      </section>
    </main>
  );
}

export const headers: HeadersFunction = () => ({
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
});
