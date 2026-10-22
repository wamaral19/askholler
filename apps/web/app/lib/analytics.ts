import { z } from "zod";
import type { WorkforceRole } from "@holler/domain";

export function canViewCommerceDashboard(
  roles: readonly WorkforceRole[],
): boolean {
  return roles.includes("merchant_admin") || roles.includes("platform_admin");
}

export const dashboardFiltersSchema = z
  .object({
    start: z.iso.date(),
    end: z.iso.date(),
    customerType: z.enum(["all", "new", "repeat"]).default("all"),
    attribution: z
      .enum(["all", "meta", "google", "direct", "unknown"])
      .default("all"),
    sku: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,80}$/)
      .optional(),
    granularity: z.enum(["day", "week", "month"]).default("week"),
  })
  .strict()
  .superRefine((filters, context) => {
    if (filters.start > filters.end)
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "End date must not precede start date",
      });
  });

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export interface DashboardSnapshot {
  readonly filters: DashboardFilters;
  readonly metrics: {
    readonly orders: number;
    readonly revenueMinor: number;
    readonly currency: string;
    readonly newCustomers: number;
    readonly repeatCustomers: number;
    readonly refundedOrders: number;
    readonly repurchaseRate: number;
  };
  readonly attribution: readonly { source: string; orders: number }[];
  /** Filtered orders per period bucket, split into first and repeat orders. */
  readonly series: readonly OrderSeriesPoint[];
  /** Filtered orders by observed source, split into first and repeat orders. */
  readonly sources: readonly SourceSplitRow[];
  /** Products in filtered orders, by revenue. */
  readonly topProducts: readonly TopProductRow[];
  /** Customers whose first order fell in the period, by product in that order. */
  readonly repeatByProduct: readonly RepeatByProductRow[];
  /** How long customers acquired in the period took to place a second order. */
  readonly reorderTiming: ReorderTiming;
  /** Monthly acquisition cohorts in the period and the share ordering again. */
  readonly cohorts: readonly CohortRow[];
  readonly cohortExpression: unknown;
  readonly limitations: readonly string[];
}

export interface RepeatByProductRow {
  readonly product: string;
  readonly sku: string | null;
  /** Customers whose first order included the product. */
  readonly customers: number;
  /** Of those, customers who have ordered again (at any time since). */
  readonly repeatCustomers: number;
}

/** Below this many first-order customers a product's rate is too noisy to rank. */
export const MIN_REPEAT_COHORT = 20;

export interface RepeatLeader {
  readonly product: string;
  readonly rate: number;
  /** Repeat rate across every other ranked product's customers. */
  readonly othersRate: number;
  readonly multiple: number;
}

export const repeatRate = (row: RepeatByProductRow): number =>
  row.customers ? row.repeatCustomers / row.customers : 0;

/**
 * The product whose first-order customers repeat most, when it clearly leads
 * (at least 1.5× everyone else); null when no product stands out.
 */
export function repeatLeader(
  rows: readonly RepeatByProductRow[],
): RepeatLeader | null {
  const ranked = rows.filter((row) => row.customers >= MIN_REPEAT_COHORT);
  if (ranked.length < 2) return null;
  const leader = ranked.reduce((best, row) =>
    repeatRate(row) > repeatRate(best) ? row : best,
  );
  const others = ranked.filter((row) => row !== leader);
  const customers = others.reduce((sum, row) => sum + row.customers, 0);
  const repeats = others.reduce((sum, row) => sum + row.repeatCustomers, 0);
  const othersRate = customers ? repeats / customers : 0;
  const rate = repeatRate(leader);
  if (!othersRate || rate < othersRate * 1.5) return null;
  return {
    product: leader.product,
    rate,
    othersRate,
    multiple: rate / othersRate,
  };
}

export interface OrderSeriesPoint {
  /** First day of the bucket, YYYY-MM-DD (weeks start Monday, UTC). */
  readonly period: string;
  readonly firstOrders: number;
  readonly repeatOrders: number;
  /** Orders whose place in the customer's history is unknown (guests, partial history). */
  readonly otherOrders: number;
  readonly revenueMinor: number;
}

export interface SourceSplitRow {
  readonly source: string;
  readonly firstOrders: number;
  readonly repeatOrders: number;
}

export interface TopProductRow {
  readonly product: string;
  readonly units: number;
  readonly orders: number;
  /** Line totals after discounts, before refunds. */
  readonly revenueMinor: number;
}

export interface ReorderTimingBucket {
  readonly label: string;
  /** Leader-product customers whose second order landed in this bucket. */
  readonly leader: number;
  readonly others: number;
}

export interface ReorderTiming {
  /** The repeat-rate leader, when one clearly leads; else everyone is "others". */
  readonly leaderProduct: string | null;
  /** Customers who placed a second order, per group. */
  readonly leaderCustomers: number;
  readonly otherCustomers: number;
  readonly buckets: readonly ReorderTimingBucket[];
}

export interface CohortRow {
  /** YYYY-MM of the first order. */
  readonly cohort: string;
  readonly customers: number;
  /**
   * Customers ordering again in month 1, 2, … after the first-order month;
   * null for months that have not finished yet.
   */
  readonly retained: readonly (number | null)[];
}

/** First day of the UTC day, Monday-start week, or month containing `at`. */
export function bucketStart(
  at: Date,
  granularity: DashboardFilters["granularity"],
): string {
  const day = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  if (granularity === "month") day.setUTCDate(1);
  if (granularity === "week")
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function nextBucket(
  period: string,
  granularity: DashboardFilters["granularity"],
): string {
  const at = new Date(`${period}T00:00:00.000Z`);
  if (granularity === "month") at.setUTCMonth(at.getUTCMonth() + 1);
  else at.setUTCDate(at.getUTCDate() + (granularity === "week" ? 7 : 1));
  return at.toISOString().slice(0, 10);
}

/** Every bucket from start to end, so empty periods show as zero. */
export function buildOrderSeries(
  orders: readonly {
    orderedAt: Date;
    sequence: number | null;
    totalMinor: number;
  }[],
  filters: Pick<DashboardFilters, "start" | "end" | "granularity">,
): OrderSeriesPoint[] {
  const points = new Map<
    string,
    {
      firstOrders: number;
      repeatOrders: number;
      otherOrders: number;
      revenueMinor: number;
    }
  >();
  const last = bucketStart(
    new Date(`${filters.end}T00:00:00.000Z`),
    filters.granularity,
  );
  for (
    let period = bucketStart(
      new Date(`${filters.start}T00:00:00.000Z`),
      filters.granularity,
    );
    period <= last && points.size < 400;
    period = nextBucket(period, filters.granularity)
  )
    points.set(period, {
      firstOrders: 0,
      repeatOrders: 0,
      otherOrders: 0,
      revenueMinor: 0,
    });
  for (const order of orders) {
    const point = points.get(bucketStart(order.orderedAt, filters.granularity));
    if (!point) continue;
    if (order.sequence === 1) point.firstOrders += 1;
    else if (order.sequence !== null && order.sequence >= 2)
      point.repeatOrders += 1;
    else point.otherOrders += 1;
    point.revenueMinor += order.totalMinor;
  }
  return [...points].map(([period, point]) => ({ period, ...point }));
}

export function splitSources(
  orders: readonly { source: string; sequence: number | null }[],
): SourceSplitRow[] {
  const rows = new Map<string, { firstOrders: number; repeatOrders: number }>();
  for (const order of orders) {
    const row = rows.get(order.source) ?? { firstOrders: 0, repeatOrders: 0 };
    if (order.sequence === 1) row.firstOrders += 1;
    else if (order.sequence !== null && order.sequence >= 2)
      row.repeatOrders += 1;
    rows.set(order.source, row);
  }
  return [...rows]
    .map(([source, row]) => ({ source, ...row }))
    .filter((row) => row.firstOrders + row.repeatOrders > 0)
    .sort(
      (a, b) =>
        b.firstOrders + b.repeatOrders - (a.firstOrders + a.repeatOrders) ||
        a.source.localeCompare(b.source),
    );
}

export function rankProducts(
  lines: readonly {
    product: string;
    orderId: string;
    quantity: number;
    lineMinor: number;
  }[],
  limit = 10,
): TopProductRow[] {
  const rows = new Map<
    string,
    { units: number; orders: Set<string>; revenueMinor: number }
  >();
  for (const line of lines) {
    const row = rows.get(line.product) ?? {
      units: 0,
      orders: new Set<string>(),
      revenueMinor: 0,
    };
    row.units += line.quantity;
    row.orders.add(line.orderId);
    row.revenueMinor += line.lineMinor;
    rows.set(line.product, row);
  }
  return [...rows]
    .map(([product, row]) => ({
      product,
      units: row.units,
      orders: row.orders.size,
      revenueMinor: row.revenueMinor,
    }))
    .sort(
      (a, b) =>
        b.revenueMinor - a.revenueMinor || a.product.localeCompare(b.product),
    )
    .slice(0, limit);
}

export const REORDER_BUCKETS = [
  ["Under 2 wks", 0, 14],
  ["2–3 wks", 14, 21],
  ["3–4 wks", 21, 28],
  ["4–5 wks", 28, 35],
  ["5–6 wks", 35, 42],
  ["6–8 wks", 42, 56],
  ["8–12 wks", 56, 84],
  ["12+ wks", 84, Number.POSITIVE_INFINITY],
] as const;

export function buildReorderTiming(
  customers: readonly { firstProducts: readonly string[]; gapDays: number }[],
  leaderProduct: string | null,
): ReorderTiming {
  const buckets = REORDER_BUCKETS.map(([label]) => ({
    label,
    leader: 0,
    others: 0,
  }));
  let leaderCustomers = 0;
  let otherCustomers = 0;
  for (const customer of customers) {
    const index = REORDER_BUCKETS.findIndex(
      ([, from, to]) => customer.gapDays >= from && customer.gapDays < to,
    );
    if (index < 0) continue;
    if (leaderProduct && customer.firstProducts.includes(leaderProduct)) {
      buckets[index]!.leader += 1;
      leaderCustomers += 1;
    } else {
      buckets[index]!.others += 1;
      otherCustomers += 1;
    }
  }
  return { leaderProduct, leaderCustomers, otherCustomers, buckets };
}

/**
 * Up to `months` months after each cohort's first-order month. A month counts
 * only once it has ended before `now`, so a young cohort shows blanks rather
 * than a misleading zero.
 */
export function buildCohorts(
  rows: readonly { cohort: string; offset: number; customers: number }[],
  now: Date,
  months = 6,
): CohortRow[] {
  const byCohort = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const offsets = byCohort.get(row.cohort) ?? new Map<number, number>();
    offsets.set(row.offset, row.customers);
    byCohort.set(row.cohort, offsets);
  }
  return [...byCohort]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohort, offsets]) => {
      const [year, month] = cohort.split("-").map(Number) as [number, number];
      return {
        cohort,
        customers: offsets.get(0) ?? 0,
        retained: Array.from({ length: months }, (_, index) => {
          const offset = index + 1;
          const monthEnd = Date.UTC(year, month - 1 + offset + 1, 1);
          return monthEnd <= now.getTime() ? (offsets.get(offset) ?? 0) : null;
        }),
      };
    });
}

export function parseDashboardFilters(url: URL): DashboardFilters {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const value = {
    start: url.searchParams.get("start") ?? start.toISOString().slice(0, 10),
    end: url.searchParams.get("end") ?? today,
    customerType: url.searchParams.get("customerType") ?? "all",
    attribution: url.searchParams.get("attribution") ?? "all",
    granularity: url.searchParams.get("granularity") ?? "week",
    ...(url.searchParams.get("sku")
      ? { sku: url.searchParams.get("sku") }
      : {}),
  };
  return dashboardFiltersSchema.parse(value);
}

/** Compiles only the finite dashboard controls into the existing validated predicate format. */
export function dashboardFiltersToCohort(filters: DashboardFilters): unknown {
  const predicates: unknown[] = [];
  if (filters.customerType !== "all")
    predicates.push({
      predicate: "customer.order_sequence",
      version: 1,
      config: {
        operator: filters.customerType === "new" ? "equals" : "at_least",
        value: filters.customerType === "new" ? 1 : 2,
      },
    });
  if (filters.attribution !== "all")
    predicates.push({
      predicate: "order.observed_attribution_source",
      version: 1,
      config: { source: filters.attribution },
    });
  if (filters.sku)
    predicates.push({
      predicate: "order.contains_sku",
      version: 1,
      config: { sku: filters.sku },
    });
  return predicates.length === 1
    ? predicates[0]
    : {
        all: predicates.length
          ? predicates
          : [
              {
                predicate: "order.occurred_in_period",
                version: 1,
                config: { start: filters.start, end: filters.end },
              },
            ],
      };
}
