import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  NavLink,
  Outlet,
  useLoaderData,
  useRouteError,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { getShopifyApp } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await getShopifyApp().authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY! };
}

const sections = [
  { to: "/app", label: "Research runs", end: true },
  { to: "/app/calls", label: "Raw research", end: false },
  { to: "/app/research/new", label: "Request research", end: false },
  { to: "/app/billing", label: "Pricing & billing", end: false },
] as const;

export default function ShopifyAppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      {/* Shopify admin's sidebar navigation for the app. */}
      <s-app-nav>
        <s-link href="/app" rel="home">
          Research runs
        </s-link>
        {sections.slice(1).map((section) => (
          <s-link href={section.to} key={section.to}>
            {section.label}
          </s-link>
        ))}
      </s-app-nav>
      <main className="shopify-app shopify-app--wide app-shell--console">
        <nav aria-label="Holler" className="shopify-app__tabs">
          {sections.map((section) => (
            <NavLink end={section.end} key={section.to} to={section.to}>
              {section.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </main>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
