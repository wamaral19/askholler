import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import {
  clearWorkforceMerchantCookie,
  clearWorkforceSessionCookie,
  isUsableSyntheticToken,
  safeRedirectPath,
  syntheticSessionsFromEnvironment,
  workforceSessionCookie,
} from "../lib/workforce-session.server";

/**
 * Development sign-in for the synthetic workforce: the session token from
 * HOLLER_SYNTHETIC_WORKFORCE_SESSIONS acts as the password. Disabled in
 * production, where workforce identity must come from OIDC.
 */
function assertAvailable() {
  if (process.env.NODE_ENV === "production")
    throw new Response("Not Found", { status: 404 });
}

export function loader({ request }: LoaderFunctionArgs) {
  assertAvailable();
  const redirectTo = safeRedirectPath(
    new URL(request.url).searchParams.get("redirectTo"),
  );
  return { redirectTo };
}

export async function action({ request }: ActionFunctionArgs) {
  assertAvailable();
  const form = await request.formData();
  if (form.get("intent") === "sign-out") {
    const headers = new Headers();
    headers.append("Set-Cookie", clearWorkforceSessionCookie(request));
    headers.append("Set-Cookie", clearWorkforceMerchantCookie(request));
    return redirect("/login", { headers });
  }
  const token = String(form.get("token") ?? "").trim();
  const sessions = syntheticSessionsFromEnvironment(process.env);
  if (!isUsableSyntheticToken(sessions, token))
    return { error: "That session token is not configured or is disabled." };
  return redirect(safeRedirectPath(form.get("redirectTo")), {
    headers: { "Set-Cookie": workforceSessionCookie(request, token) },
  });
}

export default function WorkforceLogin() {
  const { redirectTo } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main className="workforce-login">
      <section className="panel">
        <div className="brand-lockup">
          <img src="/brand/holler-wordmark.png" alt="Holler" />
          <span>Research operations</span>
        </div>
        <h1>Sign in</h1>
        <p className="lede">
          Paste the session token from{" "}
          <code>HOLLER_SYNTHETIC_WORKFORCE_SESSIONS</code> in{" "}
          <code>.env.local</code>. This development sign-in is replaced by OIDC
          before launch.
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
          {result?.error ? (
            <p className="workforce-login__error" role="alert">
              {result.error}
            </p>
          ) : null}
          <button className="button button-primary" type="submit">
            Sign in
          </button>
        </Form>
      </section>
    </main>
  );
}
