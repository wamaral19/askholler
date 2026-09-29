export default function ShopifyAppIndex() {
  return (
    <section className="shopify-app__card">
      <h2>Holler is connected</h2>
      <p>
        Shopify authentication is active and the installation session is stored
        in PostgreSQL. New orders are ingested from the orders/create webhook
        and qualified against published research moments by the worker.
      </p>
    </section>
  );
}
