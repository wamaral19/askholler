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
  readonly cohortExpression: unknown;
  readonly limitations: readonly string[];
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
