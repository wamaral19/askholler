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
  it("targets repeat hero buyers who have never bought the opportunity category", () => {
    const angle = buildDemoAngle(input);
    expect(
      cohortExpressionSchema.safeParse(angle.cohortExpression).success,
    ).toBe(true);
    const rules = JSON.stringify(angle.cohortExpression);
    expect(rules).toContain("customer.distinct_orders_with_product");
    expect(rules).toContain("customer.distinct_orders_with_category");
    expect(rules).toContain('"operator":"equals","value":0');
    expect(angle.name).toBe(
      "Cloud Dew Moisturizer: loyalty & cross-sell opportunity",
    );
  });

  it("builds a valid behavioral guide with comparison branches", () => {
    const { prompts } = buildDemoAngle(input);
    expect(scriptContentV1Schema.safeParse({ prompts }).success).toBe(true);
    const text = prompts.map((prompt) => prompt.prompt).join("\n");
    expect(text).toContain(
      "Take me back to your most recent Juniper Row order",
    );
    expect(text).toContain("last time you used your Cloud Dew Moisturizer");
    expect(text).toContain(
      "between receiving your first Cloud Dew Moisturizer",
    );
    expect(text).toContain("apart from Cloud Dew Moisturizer");
    expect(
      prompts.filter((prompt) => prompt.delivery?.requirement === "branch"),
    ).toHaveLength(2);
    expect(
      prompts.find((prompt) => prompt.id === "xsl-001")?.delivery
        ?.probeBranches,
    ).toHaveLength(3);
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
