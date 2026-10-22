import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { DEMO_LIMITS, demoSku, type DemoProduct } from "./catalog";

/**
 * Reads a prospect's company name and best-selling products from their public
 * storefront. Shopify stores expose /products.json and a best-selling
 * collection sort; other sites fall back to schema.org Product markup on the
 * home page. Only public http(s) hosts are fetched.
 */

export class StorefrontLookupError extends Error {
  constructor(
    readonly code:
      "INVALID_WEBSITE" | "WEBSITE_UNREACHABLE" | "NO_PRODUCTS_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "StorefrontLookupError";
  }
}

export interface StorefrontLookup {
  readonly website: string;
  readonly companyName: string;
  readonly products: readonly DemoProduct[];
  readonly source: "shopify" | "structured_data";
}

type Fetch = typeof fetch;

const TIMEOUT_MS = 8000;
const MAX_BYTES = 6 * 1024 * 1024;

export function normalizeWebsite(input: string): URL {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(
      /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
  } catch {
    throw new StorefrontLookupError(
      "INVALID_WEBSITE",
      "Enter a website like brand.com.",
    );
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    isIP(url.hostname) !== 0 ||
    /(^|\.)(localhost|local|internal|invalid)$/i.test(url.hostname)
  )
    throw new StorefrontLookupError(
      "INVALID_WEBSITE",
      "Enter a public website like brand.com.",
    );
  return new URL(url.origin);
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const lower = address.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80") ||
      lower.startsWith("::ffff:")
    );
  }
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function assertPublicHost(url: URL): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new StorefrontLookupError(
      "WEBSITE_UNREACHABLE",
      `Couldn't find ${url.hostname}.`,
    );
  }
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  )
    throw new StorefrontLookupError(
      "INVALID_WEBSITE",
      "Enter a public website like brand.com.",
    );
}

async function fetchText(fetchImpl: Fetch, url: URL): Promise<string | null> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.5",
        "User-Agent": "HollerDemo/1.0 (+https://withholler.com)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    // A redirect must stay on the storefront (myshopify.com hosts redirect to
    // their custom domain, which is fine).
    const finalHost = new URL(response.url || url.href).hostname.replace(
      /^www\./,
      "",
    );
    if (
      finalHost !== url.hostname.replace(/^www\./, "") &&
      !finalHost.endsWith(".myshopify.com") &&
      !url.hostname.endsWith(".myshopify.com")
    )
      return null;
    const text = await response.text();
    return text.length > MAX_BYTES ? null : text;
  } catch {
    return null;
  }
}

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    );

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    "i",
  );
  const match = pattern.exec(html);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeEntities(value).trim() : null;
}

/** Shop name from Shopify's meta.json, og:site_name, or the page title. */
export function companyNameFrom(
  html: string | null,
  metaJson: string | null,
  hostname: string,
): string {
  try {
    const name = metaJson
      ? (JSON.parse(metaJson) as { name?: unknown }).name
      : null;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {
    // Not Shopify, or not JSON.
  }
  if (html) {
    const site = metaContent(html, "og:site_name");
    if (site) return site;
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
    if (title) {
      const cleaned = decodeEntities(title)
        .split(/\s[|–—-]\s/)[0]!
        .trim();
      if (cleaned) return cleaned;
    }
  }
  const base = hostname.replace(/^www\./, "").split(".")[0] ?? hostname;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

interface ShopifyProductJson {
  id?: number;
  title?: string;
  handle?: string;
  product_type?: string;
  variants?: {
    id?: number;
    sku?: string | null;
    price?: string;
    title?: string;
    available?: boolean;
  }[];
  images?: { src?: string }[];
}

export function productsFromShopifyJson(json: string): DemoProduct[] {
  let parsed: { products?: ShopifyProductJson[] };
  try {
    parsed = JSON.parse(json) as { products?: ShopifyProductJson[] };
  } catch {
    return [];
  }
  const products: DemoProduct[] = [];
  for (const product of parsed.products ?? []) {
    const variant =
      product.variants?.find((candidate) => candidate.available !== false) ??
      product.variants?.[0];
    if (!product.id || !product.title || !product.handle || !variant?.id)
      continue;
    if (/gift.?card/i.test(`${product.handle} ${product.product_type ?? ""}`))
      continue;
    const price = Number(variant.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    // A demo product is a style, so it carries no size or color variant.
    products.push({
      productId: String(product.id),
      variantId: String(variant.id),
      handle: product.handle,
      title: decodeEntities(product.title).trim().slice(0, 120),
      sku: demoSku(
        styleCode((product.variants ?? []).map((candidate) => candidate.sku)),
        product.handle,
      ),
      price: price.toFixed(2),
      variantTitle: null,
      imageUrl: product.images?.[0]?.src ?? null,
    });
  }
  return products;
}

/**
 * The part of a style's SKU its sizes share: QLTDNJCKT-S, QLTDNJCKT-M →
 * QLTDNJCKT. A single-variant SKU is kept whole.
 */
export function styleCode(
  skus: readonly (string | null | undefined)[],
): string | null {
  const values = skus.map((sku) => sku?.trim() ?? "").filter(Boolean);
  if (!values.length) return null;
  if (values.length === 1) return values[0]!;
  let prefix = values[0]!;
  for (const value of values.slice(1))
    while (prefix && !value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  prefix = prefix.replace(/[-_./\s]+$/, "");
  return prefix.length >= 3 ? prefix : null;
}

/** Product handles in the order the page links them (first mention wins). */
export function productHandleOrder(html: string): string[] {
  const seen = new Set<string>();
  for (const match of html.matchAll(/\/products\/([a-z0-9][a-z0-9-_%]*)/gi)) {
    const handle = decodeURIComponent(match[1]!).toLowerCase();
    seen.add(handle);
  }
  return [...seen];
}

/** schema.org Product entries from JSON-LD blocks, for non-Shopify sites. */
export function productsFromStructuredData(html: string): DemoProduct[] {
  const products: DemoProduct[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record["@graph"])) visit(record["@graph"]);
    if (record.itemListElement) visit(record.itemListElement);
    if (record.item) visit(record.item);
    const type = record["@type"];
    if (
      type !== "Product" &&
      !(Array.isArray(type) && type.includes("Product"))
    )
      return;
    const name =
      typeof record.name === "string" ? decodeEntities(record.name).trim() : "";
    const offers = Array.isArray(record.offers)
      ? record.offers[0]
      : record.offers;
    const priceValue = (offers as Record<string, unknown> | undefined)?.price;
    const price = Number(priceValue);
    if (!name || !Number.isFinite(price) || price <= 0) return;
    const handle = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (products.some((product) => product.handle === handle)) return;
    const image = Array.isArray(record.image) ? record.image[0] : record.image;
    products.push({
      productId: "",
      variantId: "",
      handle,
      title: name.slice(0, 120),
      sku: demoSku(typeof record.sku === "string" ? record.sku : null, handle),
      price: price.toFixed(2),
      variantTitle: null,
      imageUrl: typeof image === "string" ? image : null,
    });
  };
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(match[1]!));
    } catch {
      // Malformed blocks are common; skip them.
    }
  }
  return products;
}

export async function lookupStorefront(
  input: string,
  options: { fetch?: Fetch; skipHostCheck?: boolean; limit?: number } = {},
): Promise<StorefrontLookup> {
  const fetchImpl = options.fetch ?? fetch;
  const limit = options.limit ?? 12;
  const origin = normalizeWebsite(input);
  if (!options.skipHostCheck) await assertPublicHost(origin);
  const at = (path: string) => new URL(path, origin);

  const [home, metaJson, productsJson, bestSelling] = await Promise.all([
    fetchText(fetchImpl, at("/")),
    fetchText(fetchImpl, at("/meta.json")),
    fetchText(fetchImpl, at("/products.json?limit=250")),
    fetchText(fetchImpl, at("/collections/all?sort_by=best-selling")),
  ]);
  if (home === null && productsJson === null)
    throw new StorefrontLookupError(
      "WEBSITE_UNREACHABLE",
      `Couldn't load ${origin.hostname}. Check the address, or add products by hand.`,
    );
  const companyName = companyNameFrom(home, metaJson, origin.hostname);

  const shopify = productsJson ? productsFromShopifyJson(productsJson) : [];
  if (shopify.length) {
    const rank = new Map(
      productHandleOrder(bestSelling ?? home ?? "").map((handle, index) => [
        handle,
        index,
      ]),
    );
    const ordered = shopify
      .map((product, index) => ({ product, index }))
      .sort(
        (a, b) =>
          (rank.get(a.product.handle) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.product.handle) ?? Number.MAX_SAFE_INTEGER) ||
          a.index - b.index,
      )
      .map(({ product }) => product);
    return {
      website: origin.href,
      companyName,
      products: finalizeStyles(
        ordered.slice(0, Math.min(limit, DEMO_LIMITS.maxProducts)),
      ),
      source: "shopify",
    };
  }

  const structured = home ? productsFromStructuredData(home) : [];
  if (!structured.length)
    throw new StorefrontLookupError(
      "NO_PRODUCTS_FOUND",
      `Found ${companyName} but no products on the home page. Add products by hand.`,
    );
  return {
    website: origin.href,
    companyName,
    products: finalizeStyles(
      structured.slice(0, Math.min(limit, DEMO_LIMITS.maxProducts)),
    ),
    source: "structured_data",
  };
}

/**
 * Storefronts reuse names across styles (a "Jaspers" vest and jacket) and
 * SKUs across products. Repeated names get the words of their URL handle that
 * the name doesn't already say; repeated SKUs get a numeric suffix.
 */
export function finalizeStyles(products: DemoProduct[]): DemoProduct[] {
  const titleCounts = new Map<string, number>();
  for (const product of products) {
    const key = product.title.toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const usedSkus = new Map<string, number>();
  return products.map((product) => {
    let title = product.title;
    if ((titleCounts.get(title.toLowerCase()) ?? 0) > 1) {
      const said = new Set(
        title
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .map((word) => word.replace(/s$/, "")),
      );
      const extra = product.handle
        .split("-")
        .filter(
          (word) => word && !said.has(word.toLowerCase().replace(/s$/, "")),
        )
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      if (extra) title = `${title} (${extra})`.slice(0, 120);
    }
    const count = usedSkus.get(product.sku) ?? 0;
    usedSkus.set(product.sku, count + 1);
    const sku = count
      ? `${product.sku.slice(0, 36)}-${count + 1}`
      : product.sku;
    return { ...product, title, sku };
  });
}
