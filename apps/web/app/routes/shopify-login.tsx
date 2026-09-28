import { useState } from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { getShopifyApp } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return getShopifyApp().login(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return getShopifyApp().login(request);
}

export default function ShopifyLogin() {
  const loaderErrors = useLoaderData<typeof loader>();
  const actionErrors = useActionData<typeof action>();
  const errors = actionErrors ?? loaderErrors;
  const [shop, setShop] = useState("");

  return (
    <main className="shopify-login">
      <section className="shopify-app__card">
        <p className="eyebrow">Holler for Shopify</p>
        <h1>Connect a store</h1>
        <Form method="post">
          <label htmlFor="shop">Shop domain</label>
          <input
            id="shop"
            name="shop"
            onChange={(event) => setShop(event.currentTarget.value)}
            placeholder="your-store.myshopify.com"
            type="text"
            value={shop}
          />
          {errors?.shop ? (
            <p className="shopify-login__error">
              Enter a valid Shopify domain.
            </p>
          ) : null}
          <button type="submit">Log in</button>
        </Form>
      </section>
    </main>
  );
}
