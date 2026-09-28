/**
 * Splits one deployment across two public hostnames:
 * - the marketing origin (e.g. https://withholler.com) serves only the landing page;
 * - the app origin (APP_BASE_URL, e.g. https://app.withholler.com) serves Shopify,
 *   Twilio, and workforce routes.
 * Any other host (the platform's default hostname, health checks, localhost) is
 * left alone. When either origin is unconfigured, routing is disabled.
 */
export function createHostRouting({ marketingUrl, appBaseUrl }) {
  if (!marketingUrl || !appBaseUrl) return null;
  const marketing = new URL(marketingUrl);
  const app = new URL(appBaseUrl);

  return function resolve({ host, path, method }) {
    const hostname = (host ?? "").split(":")[0].toLowerCase();
    const url = new URL(path, "http://placeholder");

    if (hostname === `www.${marketing.hostname}`) {
      return { status: 308, location: `${marketing.origin}${path}` };
    }

    if (hostname === marketing.hostname) {
      const isLandingPage =
        url.pathname === "/" &&
        !url.searchParams.has("shop") &&
        !url.searchParams.has("host");
      if (isLandingPage) return null;
      return { status: 308, location: `${app.origin}${path}` };
    }

    if (hostname === app.hostname) {
      const isBareAppRoot =
        url.pathname === "/" &&
        (method === "GET" || method === "HEAD") &&
        !url.searchParams.has("shop") &&
        !url.searchParams.has("host");
      if (isBareAppRoot)
        return { status: 302, location: `${marketing.origin}/` };
    }

    return null;
  };
}
