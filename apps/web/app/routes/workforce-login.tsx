import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import {
  getWorkforceDirectory,
  usesOidcWorkforceAuth,
} from "../lib/operations-service.server";
import {
  WORKFORCE_SESSION_COOKIE,
  clearWorkforceMerchantCookie,
  clearWorkforceSessionCookie,
  isUsableSyntheticToken,
  safeRedirectPath,
  syntheticSessionsFromEnvironment,
  workforceSessionCookie,
} from "../lib/workforce-session.server";

const signInErrors: Record<string, string> = {
  not_provisioned:
    "That Google account has no Holler access. Ask an administrator to add you.",
  domain: "Sign in with your withholler.com Google account.",
  failed: "Google sign-in did not complete. Try again.",
};

/**
 * Workforce sign-in. With WORKFORCE_AUTH_PROVIDER=oidc this offers Google
 * sign-in. Otherwise it is the development-only synthetic sign-in, where a
 * token from HOLLER_SYNTHETIC_WORKFORCE_SESSIONS acts as the password; that
 * mode is unavailable in production.
 */
function assertSyntheticAvailable() {
  if (process.env.NODE_ENV === "production")
    throw new Response("Not Found", { status: 404 });
}

export function loader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const redirectTo = safeRedirectPath(params.get("redirectTo"));
  if (usesOidcWorkforceAuth())
    return {
      mode: "oidc" as const,
      redirectTo,
      error: signInErrors[params.get("error") ?? ""] ?? null,
    };
  assertSyntheticAvailable();
  return { mode: "synthetic" as const, redirectTo, error: null };
}

export async function action({ request }: ActionFunctionArgs) {
  const oidc = usesOidcWorkforceAuth();
  if (!oidc) assertSyntheticAvailable();
  const form = await request.formData();
  if (form.get("intent") === "sign-out") {
    if (oidc) {
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim().split("="))
        .find(([key]) => key === WORKFORCE_SESSION_COOKIE)?.[1];
      if (token) await getWorkforceDirectory().revokeSession(token);
    }
    const headers = new Headers();
    headers.append("Set-Cookie", clearWorkforceSessionCookie(request));
    headers.append("Set-Cookie", clearWorkforceMerchantCookie(request));
    return redirect("/login", { headers });
  }
  if (oidc) throw new Response("Method Not Allowed", { status: 405 });
  const token = String(form.get("token") ?? "").trim();
  const sessions = syntheticSessionsFromEnvironment(process.env);
  if (!isUsableSyntheticToken(sessions, token))
    return { error: "That session token is not configured or is disabled." };
  return redirect(safeRedirectPath(form.get("redirectTo")), {
    headers: { "Set-Cookie": workforceSessionCookie(request, token) },
  });
}

export default function WorkforceLogin() {
  const { mode, redirectTo, error } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const message = result?.error ?? error;
  return (
    <main className="workforce-login">
      <section className="panel">
        <div className="brand-lockup">
          <img src="/brand/holler-wordmark.png" alt="Holler" />
          <span>Research operations</span>
        </div>
        <h1>Sign in</h1>
        {mode === "oidc" ? (
          <>
            <p className="lede">
              Use your withholler.com Google account. Access is granted by an
              administrator.
            </p>
            {message ? (
              <p className="workforce-login__error" role="alert">
                {message}
              </p>
            ) : null}
            <a
              className="button button-primary"
              href={`/login/google?redirectTo=${encodeURIComponent(redirectTo)}`}
            >
              Sign in with Google
            </a>
          </>
        ) : (
          <>
            <p className="lede">
              Paste the session token from{" "}
              <code>HOLLER_SYNTHETIC_WORKFORCE_SESSIONS</code> in{" "}
              <code>.env.local</code>. This development sign-in is unavailable
              in production, which uses Google sign-in.
            </p>
            <Form method="post" className="form-grid">
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <label>
                <span>Session token</span>
                <input
                  autoComplete="current-password"
                  autoFocus
                  name="token"
                  required
                  type="password"
                />
              </label>
              {message ? (
                <p className="workforce-login__error" role="alert">
                  {message}
                </p>
              ) : null}
              <button className="button button-primary" type="submit">
                Sign in
              </button>
            </Form>
          </>
        )}
      </section>
    </main>
  );
}
