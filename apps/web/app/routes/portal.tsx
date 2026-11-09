import {
  Form,
  NavLink,
  Outlet,
  useLoaderData,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";

import { authenticatePortalMerchant } from "../lib/merchant-portal-auth.server";

/**
 * The merchant portal: the same pages as the embedded Shopify app, reached
 * with Google sign-in instead of Shopify admin. Children reuse the
 * shopify-app-* route modules, which authenticate by path.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticatePortalMerchant(request);
  return { merchantName: session.merchantName, email: session.email };
}

const sections = [
  { to: "/portal", label: "Research runs", end: true },
  { to: "/portal/calls", label: "Raw research", end: false },
  { to: "/portal/research/new", label: "Request research", end: false },
  { to: "/portal/billing", label: "Pricing & billing", end: false },
] as const;

export default function MerchantPortalLayout() {
  const { merchantName, email } = useLoaderData<typeof loader>();
  return (
    <main className="shopify-app shopify-app--wide app-shell--console">
      <header className="merchant-portal__bar">
        <a className="merchant-portal__brand" href="/portal">
          <img alt="Holler" src="/brand/holler-wordmark.png" />
          <span>{merchantName}</span>
        </a>
        <Form
          action="/portal/login"
          className="merchant-portal__account"
          method="post"
        >
          <span>{email}</span>
          <button
            className="text-button"
            name="intent"
            type="submit"
            value="sign-out"
          >
            Sign out
          </button>
        </Form>
      </header>
      <nav aria-label="Holler" className="shopify-app__tabs">
        {sections.map((section) => (
          <NavLink end={section.end} key={section.to} to={section.to}>
            {section.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </main>
  );
}

/** Customer research is private; keep it out of shared caches and frames. */
export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-store, private",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
});
