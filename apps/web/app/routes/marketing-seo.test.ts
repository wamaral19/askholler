import { describe, expect, it } from "vitest";
import { marketingMeta } from "../components/marketing-shell";
import { industries } from "../components/marketing-industries";
import {
  MARKETING_PATHS,
  MARKETING_STRUCTURED_DATA,
} from "../lib/marketing-seo";
import { loader as robotsLoader } from "./robots";
import { loader as sitemapLoader } from "./sitemap";

describe("marketing discovery resources", () => {
  it("allows search crawlers on the marketing host", async () => {
    const response = robotsLoader({
      request: new Request("https://withholler.com/robots.txt"),
    } as Parameters<typeof robotsLoader>[0]);
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(body).toContain("User-agent: OAI-SearchBot\nAllow: /");
    expect(body).toContain("Sitemap: https://withholler.com/sitemap.xml");
  });

  it("disallows crawlers on the app host", async () => {
    const response = robotsLoader({
      request: new Request("https://app.withholler.com/robots.txt"),
    } as Parameters<typeof robotsLoader>[0]);

    await expect(response.text()).resolves.toBe("User-agent: *\nDisallow: /\n");
  });

  it("lists every public marketing and industry page in the sitemap", async () => {
    const response = sitemapLoader();
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    for (const path of MARKETING_PATHS) {
      expect(body).toContain(
        `<loc>${new URL(path, "https://withholler.com")}</loc>`,
      );
    }
    for (const industry of industries) {
      expect(body).toContain(
        `<loc>https://withholler.com/for/${industry.slug}</loc>`,
      );
    }
    expect(body).not.toContain("app.withholler.com");
  });
});

describe("marketing metadata", () => {
  it("emits an absolute canonical URL and structured company data", () => {
    const meta = marketingMeta(
      "Customer Research | Holler",
      "Customer research by Holler.",
      "/research",
    );

    expect(meta).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://withholler.com/research",
    });
    expect(meta).toContainEqual({
      property: "og:url",
      content: "https://withholler.com/research",
    });
    expect(meta).toContainEqual({
      "script:ld+json": MARKETING_STRUCTURED_DATA,
    });
    expect(
      MARKETING_STRUCTURED_DATA["@graph"].map((item) => item["@type"]),
    ).toEqual(["Organization", "WebSite", "Service"]);
  });
});
