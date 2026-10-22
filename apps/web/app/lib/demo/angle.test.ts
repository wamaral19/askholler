import { cohortExpressionSchema, scriptContentV1Schema } from "@holler/domain";
import { describe, expect, it } from "vitest";

import { buildDemoAngle, buildSampleFindings } from "./angle";
import { validateDemoConfig, demoSku, type DemoConfig } from "./catalog";

const input = {
  companyName: "Juniper Row",
  heroTitle: "Cloud Dew Moisturizer",
  otherTitles: ["Harbor Tee", "Trail Crew Socks", "Travel Kit"],
};

describe("buildDemoAngle", () => {
  it("targets repeat buyers who previously bought the hero product", () => {
    const angle = buildDemoAngle(input);
    expect(
      cohortExpressionSchema.safeParse(angle.cohortExpression).success,
    ).toBe(true);
    expect(JSON.stringify(angle.cohortExpression)).toContain(
      "customer.prior_orders_contain_current_category",
    );
    expect(angle.name).toBe("Why Cloud Dew Moisturizer buyers come back");
  });

  it("asks the five repeat-purchase questions in the company's voice", () => {
    const { prompts } = buildDemoAngle(input);
    expect(scriptContentV1Schema.safeParse({ prompts }).success).toBe(true);
    const text = prompts.map((prompt) => prompt.prompt).join("\n");
    expect(text).toContain("What made you want to buy more from Juniper Row?");
    expect(text).toContain("Think back to your first Cloud Dew Moisturizer");
    expect(text).toContain("Where did you hear about Juniper Row originally?");
    expect(text).toContain("impulse buy");
    expect(text).toContain("Did something trigger the purchase today?");
    expect(text).toContain("the Harbor Tee or the Trail Crew Socks");
  });
});

describe("buildSampleFindings", () => {
  it("never counts more answers than interviews", () => {
    const sample = buildSampleFindings(input);
    for (const finding of sample.findings) {
      const total = finding.rows.reduce((sum, row) => sum + row.count, 0);
      expect(total).toBe(sample.interviews);
    }
  });
});

describe("validateDemoConfig", () => {
  const product = (sku: string) => ({
    productId: "1",
    variantId: "2",
    handle: sku.toLowerCase(),
    title: sku,
    sku,
    price: "28.00",
    variantTitle: null,
    imageUrl: null,
  });
  const config: DemoConfig = {
    website: "https://brand.example/",
    companyName: "Brand",
    products: [product("A"), product("B"), product("C")],
    heroIndex: 1,
    historicalOrders: 3000,
    liveMinutes: 30,
    liveIntervalSeconds: 20,
  };

  it("accepts a complete config", () => {
    expect(validateDemoConfig(config)).toEqual([]);
  });

  it("rejects repeated SKUs, bad prices, and a missing hero", () => {
    const problems = validateDemoConfig({
      ...config,
      products: [
        product("A"),
        product("A"),
        { ...product("C"), price: "free" },
      ],
      heroIndex: 5,
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'SKU "A" is repeated.',
        '"C" needs a price like 28.00.',
        "Pick the product with the high repeat rate.",
      ]),
    );
  });

  it("derives filterable SKUs from handles", () => {
    expect(demoSku(null, "cloud-dew-serum")).toBe("CLOUD-DEW-SERUM");
    expect(demoSku("JR CDM 50", "x")).toBe("JR-CDM-50");
    expect(demoSku("JR-CDM-50", "x")).toBe("JR-CDM-50");
  });
});
