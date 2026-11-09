import { describe, expect, it } from "vitest";

import { cohortCategoryKeys, describeCohort } from "./cohort-description";

const sequence = (operator: string, value: number) => ({
  predicate: "customer.order_sequence",
  version: 1,
  config: { operator, value },
});
const contains = (categoryKey: string) => ({
  predicate: "order.contains_current_category",
  version: 1,
  config: { namespace: "merchant", categoryKey },
});
const firstContains = (categoryKey: string) => ({
  predicate: "customer.first_order_contains_current_category",
  version: 1,
  config: { namespace: "merchant", categoryKey },
});

describe("describeCohort", () => {
  it("reads the builder's default category-transition cohort as a sentence", () => {
    expect(
      describeCohort({
        all: [
          sequence("equals", 2),
          { not: firstContains("bottoms") },
          contains("bottoms"),
        ],
      }),
    ).toBe(
      "The customer's second order, their first order had no Bottoms, and this order includes Bottoms.",
    );
  });

  it("phrases lifetime product and category order counts", () => {
    const products = (operator: string, value: number, titles: string[]) => ({
      predicate: "customer.distinct_orders_with_product",
      version: 1,
      config: { operator, value, productTitles: titles },
    });
    const inCategory = (operator: string, value: number, key: string) => ({
      predicate: "customer.distinct_orders_with_category",
      version: 1,
      config: { operator, value, namespace: "merchant", categoryKey: key },
    });
    expect(
      describeCohort({
        all: [
          products("at_least", 1, ["Cloud Dew"]),
          inCategory("equals", 0, "gift-sets"),
        ],
      }),
    ).toBe(
      "They have ordered Cloud Dew and they have never ordered Gift sets.",
    );
    expect(describeCohort(products("at_least", 3, ["A", "B"]))).toBe(
      "They have ordered A or B on at least 3 orders.",
    );
    expect(
      describeCohort({
        predicate: "customer.distinct_orders_with_product",
        version: 1,
        config: { operator: "equals", value: 1, productTitle: "Legacy" },
      }),
    ).toBe("They have ordered Legacy on exactly 1 order.");
  });

  it("phrases order-sequence operators and alternatives plainly", () => {
    expect(describeCohort(sequence("equals", 1))).toBe(
      "The customer's first order.",
    );
    expect(describeCohort(sequence("at_least", 2))).toBe("A repeat order.");
    expect(describeCohort(sequence("at_most", 3))).toBe(
      "The customer's third order or earlier.",
    );
    expect(describeCohort({ not: sequence("equals", 12) })).toBe(
      "Not the customer's 12th order.",
    );
    expect(
      describeCohort({ any: [contains("tops"), contains("gift-sets")] }),
    ).toBe("Either this order includes Tops or this order includes Gift sets.");
  });

  it("uses store category labels when provided", () => {
    expect(
      describeCohort(contains("bottoms"), (_namespace, key) =>
        key === "bottoms" ? "Pants & shorts" : key,
      ),
    ).toBe("This order includes Pants & shorts.");
    expect(
      cohortCategoryKeys({ all: [contains("tops"), sequence("equals", 1)] }),
    ).toEqual([{ namespace: "merchant", key: "tops" }]);
  });

  it("never shows raw JSON for an unrecognized expression", () => {
    expect(describeCohort({ unexpected: true })).toBe("Custom cohort");
  });
});
