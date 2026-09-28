import { describe, expect, it } from "vitest";
import { createHostRouting } from "./host-routing.mjs";

const resolve = createHostRouting({
  marketingUrl: "https://withholler.com",
  appBaseUrl: "https://app.withholler.com",
})!;

describe("createHostRouting", () => {
  it("is disabled unless both origins are configured", () => {
    expect(createHostRouting({ marketingUrl: "https://withholler.com" })).toBe(
      null,
    );
    expect(
      createHostRouting({ appBaseUrl: "https://app.withholler.com" }),
    ).toBe(null);
  });

  it("serves the landing page on the marketing host", () => {
    expect(resolve({ host: "withholler.com", path: "/", method: "GET" })).toBe(
      null,
    );
  });

  it("sends every other marketing-host path to the app host, preserving method", () => {
    expect(
      resolve({
        host: "withholler.com",
        path: "/api/twilio/voice?x=1",
        method: "POST",
      }),
    ).toEqual({
      status: 308,
      location: "https://app.withholler.com/api/twilio/voice?x=1",
    });
    expect(
      resolve({ host: "withholler.com", path: "/?shop=a", method: "GET" }),
    ).toEqual({ status: 308, location: "https://app.withholler.com/?shop=a" });
  });

  it("redirects www to the apex", () => {
    expect(
      resolve({ host: "WWW.withholler.com:443", path: "/", method: "GET" }),
    ).toEqual({ status: 308, location: "https://withholler.com/" });
  });

  it("sends visitors of the bare app root to the marketing site", () => {
    expect(
      resolve({ host: "app.withholler.com", path: "/", method: "GET" }),
    ).toEqual({ status: 302, location: "https://withholler.com/" });
  });

  it("serves app routes and Shopify launches on the app host", () => {
    for (const path of ["/queue", "/webhooks", "/?shop=a&host=b"]) {
      expect(resolve({ host: "app.withholler.com", path, method: "GET" })).toBe(
        null,
      );
    }
    expect(
      resolve({ host: "app.withholler.com", path: "/", method: "POST" }),
    ).toBe(null);
  });

  it("leaves unknown hosts alone", () => {
    expect(
      resolve({ host: "holler-web.onrender.com", path: "/", method: "GET" }),
    ).toBe(null);
  });
});
