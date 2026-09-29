import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Outlet,
  useLoaderData,
  useRouteError,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { shopifyMerchantId } from "../lib/shopify-ingestion.server";
import { getShopifyApp } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await getShopifyApp().authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY!,
    shop: session.shop,
    merchantId: shopifyMerchantId(session.shop),
  };
}

export default function ShopifyAppLayout() {
  const { apiKey, shop, merchantId } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <main className="shopify-app">
        <header className="shopify-app__header">
          <p className="eyebrow">Holler for Shopify</p>
          <h1>Merchant connection</h1>
          <p>
            Authenticated as <strong>{shop}</strong>
          </p>
          <p>
            Holler merchant ID <code>{merchantId}</code>
          </p>
        </header>
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
