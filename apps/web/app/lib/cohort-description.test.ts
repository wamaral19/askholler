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
