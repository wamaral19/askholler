import type { LoaderFunctionArgs } from "react-router";
import { MARKETING_ORIGIN } from "../lib/marketing-seo";

const ALLOW_MARKETING_CRAWLERS = `User-agent: OAI-SearchBot
Allow: /

User-agent: *
Allow: /

Sitemap: ${MARKETING_ORIGIN}/sitemap.xml
`;

const DISALLOW_APP_CRAWLERS = `User-agent: *
Disallow: /
`;

export function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url);
  const marketingHostname = new URL(
    process.env.HOLLER_MARKETING_URL ?? MARKETING_ORIGIN,
  ).hostname;
  const isMarketingHost =
    requestUrl.hostname === marketingHostname ||
    requestUrl.hostname === `www.${marketingHostname}` ||
    requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1";

  return new Response(
    isMarketingHost ? ALLOW_MARKETING_CRAWLERS : DISALLOW_APP_CRAWLERS,
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
}
