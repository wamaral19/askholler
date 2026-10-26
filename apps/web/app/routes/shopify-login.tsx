import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { getShopifyApp } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const errors = await getShopifyApp().login(request);
  return {
    errors,
    installUrl:
      process.env.SHOPIFY_APP_STORE_URL?.trim() ||
      process.env.HOLLER_MARKETING_URL?.trim() ||
      "https://withholler.com",
  };
}

export default function ShopifyLogin() {
  const { errors, installUrl } = useLoaderData<typeof loader>();

  return (
    <main className="shopify-login">
      <section className="shopify-app__card">
        <p className="eyebrow">Holler for Shopify</p>
        <h1>Install Holler from Shopify</h1>
        <p>
          For your security, Holler can only be installed or opened from a
          Shopify-owned surface. We never ask you to type your store domain into
          this website.
        </p>
        {errors?.shop ? (
          <p className="shopify-login__error">
            Shopify did not provide a valid store context. Open Holler from
            Shopify admin and try again.
          </p>
        ) : null}
        <a className="button button-primary" href={installUrl}>
          Continue to Shopify
        </a>
      </section>
    </main>
  );
}
