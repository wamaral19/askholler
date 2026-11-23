import { marketingSitemap } from "../lib/marketing-seo";

export function loader() {
  return new Response(marketingSitemap(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
