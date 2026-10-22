import { observedAttributionV1Schema } from "@holler/domain";
import { describe, expect, it } from "vitest";

import {
  DEMO_HISTORY_DAYS,
  generateDemoDataset,
  observedAttributionFor,
  repeatRateByFirstProduct,
  type DemoChannel,
} from "./dataset";

const now = new Date("2026-10-21T15:00:00.000Z");
const input = {
  seed: "https://brand.example|A,B,C,D,E,F|1",
  productCount: 6,
  heroIndex: 1,
  targetOrders: 3000,
  now,
};

describe("generateDemoDataset", () => {
  it("is deterministic for a seed", () => {
    expect(generateDemoDataset(input)).toEqual(generateDemoDataset(input));
    expect(generateDemoDataset({ ...input, seed: "other" })).not.toEqual(
      generateDemoDataset(input),
    );
  });

  it("produces at least the target orders, all within the history window and in order", () => {
    const customers = generateDemoDataset(input);
    const orders = customers.flatMap((customer) => customer.orders);
    expect(orders.length).toBeGreaterThanOrEqual(input.targetOrders);
    expect(orders.length).toBeLessThan(input.targetOrders + 10);
    const start = now.getTime() - DEMO_HISTORY_DAYS * 24 * 60 * 60 * 1000;
    for (const customer of customers) {
      const times = customer.orders.map((order) => order.orderedAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
      for (const time of times) {
        expect(time).toBeGreaterThanOrEqual(start);
        expect(time).toBeLessThan(now.getTime());
      }
    }
  });

  it("gives the hero product a clearly higher repeat rate than every other product", () => {
    const rows = repeatRateByFirstProduct(generateDemoDataset(input), 6);
    const hero = rows[input.heroIndex]!;
    for (const row of rows) {
      if (row.productIndex === input.heroIndex) continue;
      expect(row.customers).toBeGreaterThan(50);
      expect(hero.rate).toBeGreaterThan(row.rate * 1.5);
    }
  });

  it("keeps the hero from being the best seller when it is not ranked first", () => {
    const rows = repeatRateByFirstProduct(generateDemoDataset(input), 6);
    expect(rows[0]!.customers).toBeGreaterThan(
      rows[input.heroIndex]!.customers,
    );
  });
});

describe("observedAttributionFor", () => {
  it("produces valid observed attribution for every channel", () => {
    const channels: DemoChannel[] = [
      "meta",
      "google",
      "tiktok",
      "email",
      "sms",
      "direct",
      "unknown",
    ];
    for (const channel of channels)
      expect(() =>
        observedAttributionV1Schema.parse(
          observedAttributionFor(channel, now, "/products/thing"),
        ),
      ).not.toThrow();
  });
});
