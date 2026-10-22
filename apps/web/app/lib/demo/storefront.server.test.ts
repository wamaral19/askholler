import { describe, expect, it } from "vitest";

import {
  StorefrontLookupError,
  companyNameFrom,
  finalizeStyles,
  lookupStorefront,
  normalizeWebsite,
  productsFromStructuredData,
  styleCode,
} from "./storefront.server";

const shopifyProducts = {
  products: [
    {
      id: 101,
      title: "Harbor Tee",
      handle: "harbor-tee",
      product_type: "Tops",
      variants: [{ id: 1011, sku: "JR-TEE", price: "34.00", title: "S" }],
      images: [{ src: "https://cdn.example/tee.jpg" }],
    },
    {
      id: 102,
      title: "Cloud Dew Moisturizer",
      handle: "cloud-dew",
      variants: [{ id: 1021, sku: "", price: "64.00", title: "Default Title" }],
    },
    {
      id: 103,
      title: "Gift Card",
      handle: "gift-card",
      variants: [{ id: 1031, sku: "GC", price: "25.00" }],
    },
    {
      id: 104,
      title: "Trail Socks",
      handle: "trail-socks",
      variants: [{ id: 1041, sku: "JR-TEE", price: "12.00" }],
    },
  ],
};

function fakeFetch(routes: Record<string, string>): typeof fetch {
  return (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const body = routes[url.pathname + url.search];
    return body === undefined
      ? new Response("missing", { status: 404 })
      : new Response(body, { status: 200 });
  }) as typeof fetch;
}

describe("normalizeWebsite", () => {
  it("adds https and drops paths", () => {
    expect(normalizeWebsite("brand.com/collections/all").href).toBe(
      "https://brand.com/",
    );
  });

  it.each([
    "localhost:5173",
    "http://127.0.0.1",
    "ftp://brand.com",
    "intranet",
    "user:pw@brand.com",
    "shop.internal",
  ])("rejects %s", (value) => {
    expect(() => normalizeWebsite(value)).toThrow(StorefrontLookupError);
  });
});

describe("lookupStorefront", () => {
  it("reads a Shopify store's name and best sellers in order, skipping gift cards", async () => {
    const lookup = await lookupStorefront("brand.example", {
      skipHostCheck: true,
      fetch: fakeFetch({
        "/": "<title>Ignored</title>",
        "/meta.json": JSON.stringify({ name: "Juniper Row" }),
        "/products.json?limit=250": JSON.stringify(shopifyProducts),
        "/collections/all?sort_by=best-selling":
          '<a href="/products/cloud-dew">x</a><a href="/products/trail-socks">y</a><a href="/products/cloud-dew">z</a>',
      }),
    });
    expect(lookup.companyName).toBe("Juniper Row");
    expect(lookup.source).toBe("shopify");
    expect(lookup.products.map((product) => product.title)).toEqual([
      "Cloud Dew Moisturizer",
      "Trail Socks",
      "Harbor Tee",
    ]);
    const [dew, socks, tee] = lookup.products;
    expect(dew).toMatchObject({
      sku: "CLOUD-DEW",
      price: "64.00",
      variantTitle: null,
      productId: "102",
    });
    // Storefronts reuse SKUs; the second use gets a suffix.
    expect(socks!.sku).toBe("JR-TEE");
    expect(tee!.sku).toBe("JR-TEE-2");
  });

  it("falls back to schema.org products on other platforms", async () => {
    const html = `<html><head><meta property="og:site_name" content="Trail &amp; Co"></head><body>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
        {"@type":"Product","name":"Day Pack","sku":"DP-1","offers":{"price":"89.00"}},
        {"@type":"Product","name":"Bottle","offers":[{"price":24}]}]}</script></body></html>`;
    const lookup = await lookupStorefront("trail.example", {
      skipHostCheck: true,
      fetch: fakeFetch({ "/": html }),
    });
    expect(lookup.companyName).toBe("Trail & Co");
    expect(lookup.source).toBe("structured_data");
    expect(
      lookup.products.map((product) => [
        product.title,
        product.sku,
        product.price,
      ]),
    ).toEqual([
      ["Day Pack", "DP-1", "89.00"],
      ["Bottle", "BOTTLE", "24.00"],
    ]);
  });

  it("explains when a site has no products to read", async () => {
    await expect(
      lookupStorefront("empty.example", {
        skipHostCheck: true,
        fetch: fakeFetch({ "/": "<title>Empty Studio | Home</title>" }),
      }),
    ).rejects.toMatchObject({ code: "NO_PRODUCTS_FOUND" });
  });
});

describe("companyNameFrom", () => {
  it("uses the title before a separator, then the hostname", () => {
    expect(
      companyNameFrom("<title>Acme Goods | Shop</title>", null, "acme.com"),
    ).toBe("Acme Goods");
    expect(companyNameFrom(null, null, "www.acme.com")).toBe("Acme");
  });
});

describe("productsFromStructuredData", () => {
  it("ignores malformed blocks", () => {
    expect(
      productsFromStructuredData(
        '<script type="application/ld+json">{nope</script>',
      ),
    ).toEqual([]);
  });
});

describe("styleCode", () => {
  it("keeps what a style's sizes share", () => {
    expect(styleCode(["QLTDNJCKT-S", "QLTDNJCKT-M", "QLTDNJCKT-XL"])).toBe(
      "QLTDNJCKT",
    );
    expect(styleCode(["TWDWP3-28X29", "TWDWP3-30X30"])).toBe("TWDWP3");
    expect(styleCode(["KNITBNIE1"])).toBe("KNITBNIE1");
    expect(styleCode(["", null])).toBeNull();
    expect(styleCode(["AB-1", "XY-2"])).toBeNull();
  });
});

describe("finalizeStyles", () => {
  const style = (title: string, handle: string, sku: string) => ({
    productId: "1",
    variantId: "2",
    handle,
    title,
    sku,
    price: "128.00",
    variantTitle: null,
    imageUrl: null,
  });

  it("tells apart styles that share a name using their handle", () => {
    const [vest, jacket, tee] = finalizeStyles([
      style("Jaspers", "jasper-quilted-vest", "QU1VNV"),
      style("Jaspers", "jasper-quilted-jacket", "QU1JNV"),
      style("Jet Black", "supima-tee-black", "TEESS1"),
    ]);
    expect(vest!.title).toBe("Jaspers (Quilted Vest)");
    expect(jacket!.title).toBe("Jaspers (Quilted Jacket)");
    expect(tee!.title).toBe("Jet Black");
  });
});
