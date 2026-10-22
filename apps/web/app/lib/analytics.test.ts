import { describe, expect, it } from "vitest";
import {
  bucketStart,
  buildCohorts,
  buildOrderSeries,
  buildReorderTiming,
  canViewCommerceDashboard,
  rankProducts,
  repeatLeader,
  splitSources,
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

describe("dashboard aggregation", () => {
  it("buckets weeks from Monday and months from the 1st, in UTC", () => {
    const sunday = new Date("2026-10-18T23:30:00.000Z");
    expect(bucketStart(sunday, "week")).toBe("2026-10-12");
    expect(bucketStart(new Date("2026-10-19T00:00:00.000Z"), "week")).toBe(
      "2026-10-19",
    );
    expect(bucketStart(sunday, "month")).toBe("2026-10-01");
    expect(bucketStart(sunday, "day")).toBe("2026-10-18");
  });

  it("fills empty periods and splits first, repeat, and unknown orders", () => {
    const series = buildOrderSeries(
      [
        {
          orderedAt: new Date("2026-10-05T12:00:00Z"),
          sequence: 1,
          totalMinor: 1000,
        },
        {
          orderedAt: new Date("2026-10-06T12:00:00Z"),
          sequence: 3,
          totalMinor: 2000,
        },
        {
          orderedAt: new Date("2026-10-20T12:00:00Z"),
          sequence: null,
          totalMinor: 500,
        },
      ],
      { start: "2026-10-05", end: "2026-10-21", granularity: "week" },
    );
    expect(series).toEqual([
      {
        period: "2026-10-05",
        firstOrders: 1,
        repeatOrders: 1,
        otherOrders: 0,
        revenueMinor: 3000,
      },
      {
        period: "2026-10-12",
        firstOrders: 0,
        repeatOrders: 0,
        otherOrders: 0,
        revenueMinor: 0,
      },
      {
        period: "2026-10-19",
        firstOrders: 0,
        repeatOrders: 0,
        otherOrders: 1,
        revenueMinor: 500,
      },
    ]);
  });

  it("ranks sources by total orders and products by revenue", () => {
    expect(
      splitSources([
        { source: "meta", sequence: 1 },
        { source: "klaviyo", sequence: 2 },
        { source: "klaviyo", sequence: 3 },
        { source: "unknown", sequence: null },
      ]),
    ).toEqual([
      { source: "klaviyo", firstOrders: 0, repeatOrders: 2 },
      { source: "meta", firstOrders: 1, repeatOrders: 0 },
    ]);
    expect(
      rankProducts([
        { product: "Tee", orderId: "a", quantity: 2, lineMinor: 6800 },
        { product: "Tee", orderId: "b", quantity: 1, lineMinor: 3400 },
        { product: "Kit", orderId: "a", quantity: 1, lineMinor: 12000 },
      ]),
    ).toEqual([
      { product: "Kit", units: 1, orders: 1, revenueMinor: 12000 },
      { product: "Tee", units: 3, orders: 2, revenueMinor: 10200 },
    ]);
  });

  it("splits time to second order between the leader's buyers and everyone else", () => {
    const timing = buildReorderTiming(
      [
        { firstProducts: ["Serum"], gapDays: 30 },
        { firstProducts: ["Serum", "Tee"], gapDays: 3 },
        { firstProducts: ["Tee"], gapDays: 100 },
      ],
      "Serum",
    );
    expect(timing.leaderCustomers).toBe(2);
    expect(timing.otherCustomers).toBe(1);
    expect(
      timing.buckets.find((bucket) => bucket.label === "4–5 wks")?.leader,
    ).toBe(1);
    expect(
      timing.buckets.find((bucket) => bucket.label === "Under 2 wks")?.leader,
    ).toBe(1);
    expect(timing.buckets.at(-1)?.others).toBe(1);
  });

  it("leaves cohort months that have not finished blank", () => {
    const [cohort] = buildCohorts(
      [
        { cohort: "2026-08", offset: 0, customers: 100 },
        { cohort: "2026-08", offset: 1, customers: 20 },
      ],
      new Date("2026-10-21T00:00:00Z"),
      3,
    );
    // September has ended (20), October has not, November has not.
    expect(cohort).toEqual({
      cohort: "2026-08",
      customers: 100,
      retained: [20, null, null],
    });
  });

  it("names a repeat leader only when it clearly leads", () => {
    const row = (
      product: string,
      customers: number,
      repeatCustomers: number,
    ) => ({
      product,
      sku: null,
      customers,
      repeatCustomers,
    });
    expect(
      repeatLeader([row("A", 100, 50), row("B", 100, 20), row("C", 100, 15)])
        ?.product,
    ).toBe("A");
    expect(repeatLeader([row("A", 100, 25), row("B", 100, 20)])).toBeNull();
    // Too few customers to rank.
    expect(repeatLeader([row("A", 10, 9), row("B", 100, 20)])).toBeNull();
  });
});
