import { describe, expect, it } from "vitest";
import {
  canViewCommerceDashboard,
  dashboardFiltersSchema,
  dashboardFiltersToCohort,
  parseDashboardFilters,
} from "./analytics";

describe("dashboard filters", () => {
  it("is restricted to merchant and platform administrators", () => {
    expect(canViewCommerceDashboard(["researcher"])).toBe(false);
    expect(canViewCommerceDashboard(["analyst"])).toBe(false);
    expect(canViewCommerceDashboard(["merchant_admin"])).toBe(true);
    expect(canViewCommerceDashboard(["platform_admin"])).toBe(true);
  });

  it("accepts only the fixed filter vocabulary", () => {
    expect(() =>
      parseDashboardFilters(
        new URL(
          "https://holler.invalid/admin/dashboard?attribution=meta&customerType=repeat&sku=SKU-1&start=2026-09-01&end=2026-09-30",
        ),
      ),
    ).not.toThrow();
    expect(() =>
      parseDashboardFilters(
        new URL(
          "https://holler.invalid/admin/dashboard?attribution=meta%27%20OR%201%3D1&start=2026-09-01&end=2026-09-30",
        ),
      ),
    ).toThrow();
    expect(
      dashboardFiltersSchema.safeParse({
        start: "2026-10-01",
        end: "2026-09-01",
        customerType: "all",
        attribution: "all",
        granularity: "week",
      }).success,
    ).toBe(false);
  });

  it("compiles controls to versioned predicates rather than query text", () => {
    const filters = dashboardFiltersSchema.parse({
      start: "2026-09-01",
      end: "2026-09-30",
      customerType: "repeat",
      attribution: "meta",
      sku: "SKU-1",
      granularity: "week",
    });
    expect(dashboardFiltersToCohort(filters)).toEqual({
      all: [
        {
          predicate: "customer.order_sequence",
          version: 1,
          config: { operator: "at_least", value: 2 },
        },
        {
          predicate: "order.observed_attribution_source",
          version: 1,
          config: { source: "meta" },
        },
        {
          predicate: "order.contains_sku",
          version: 1,
          config: { sku: "SKU-1" },
        },
      ],
    });
  });
});
