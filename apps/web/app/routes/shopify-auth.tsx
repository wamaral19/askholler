import type { LoaderFunctionArgs } from "react-router";
import { getShopifyApp } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await getShopifyApp().authenticate.admin(request);
  return null;
}
