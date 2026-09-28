import type { ActionFunctionArgs } from "react-router";
import { getShopifyApp } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const shopify = getShopifyApp();
  const { shop, topic } = await shopify.authenticate.webhook(request);

  if (topic === "APP_UNINSTALLED") {
    const sessions = await shopify.sessionStorage.findSessionsByShop(shop);
    if (sessions.length > 0) {
      await shopify.sessionStorage.deleteSessions(
        sessions.map((session) => session.id),
      );
    }
  }

  // The authenticated orders/create request is deliberately acknowledged here.
  // Durable receipt and normalization will be connected in the ingestion slice.
  return new Response(null, { status: 200 });
}
