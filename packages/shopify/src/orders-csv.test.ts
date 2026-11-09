import { describe, expect, it } from "vitest";

import {
  mapShopifyCustomersCsv,
  mapShopifyOrdersCsv,
  parseCsv,
  shopifyCsvDate,
} from "./orders-csv";

const COLUMNS = [
  "Name",
  "Email",
  "Financial Status",
  "Fulfillment Status",
  "Currency",
  "Total",
  "Created at",
  "Lineitem quantity",
  "Lineitem name",
  "Lineitem price",
  "Lineitem sku",
  "Lineitem discount",
  "Billing Name",
  "Billing Street",
  "Billing Phone",
  "Notes",
  "Cancelled at",
  "Id",
] as const;
const quote = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const row = (values: Partial<Record<(typeof COLUMNS)[number], string>>) =>
  COLUMNS.map((column) => quote(values[column] ?? "")).join(",");
const order = (
  name: string,
  values: Partial<Record<(typeof COLUMNS)[number], string>>,
) =>
  row({
    Name: name,
    Email: "avery@example.invalid",
    "Financial Status": "paid",
    Currency: "USD",
    Total: "8.00",
    "Created at": "2024-06-01 09:00:00 +0000",
    "Lineitem quantity": "1",
    "Lineitem name": "Sticker",
    "Lineitem price": "8.00",
    ...values,
  });

/** Fictional export: two-line order, guest order, unmatched email, bad rows. */
const ORDERS_CSV = [
  COLUMNS.join(","),
  order("#1001", {
    "Fulfillment Status": "fulfilled",
    Total: "42.50",
    "Created at": "2024-03-05 14:22:31 -0500",
    "Lineitem quantity": "2",
    "Lineitem name": "Travel kit - Navy",
    "Lineitem price": "15.00",
    "Lineitem sku": "KIT-1",
    "Lineitem discount": "3.00",
    "Billing Name": "Avery Synthetic",
    "Billing Street": "1 Example St",
    "Billing Phone": "+12025550142",
    Notes: 'leave, at "door"\nplease',
    Id: "5500000000001",
  }),
  row({
    Name: "#1001",
    Email: "avery@example.invalid",
    "Lineitem quantity": "1",
    "Lineitem name": "Refill pack",
    "Lineitem price": "12.50",
    "Lineitem sku": "REF-1",
    "Lineitem discount": "0.00",
  }),
  order("#1002", {
    Email: "",
    "Billing Name": "Guest Synthetic",
    Id: "5500000000002",
  }),
  order("#1003", {
    Email: "stranger@example.invalid",
    "Financial Status": "refunded",
    "Cancelled at": "2024-05-02 10:00:00 +0000",
    Id: "5500000000003",
  }),
  order("#1004", { "Created at": "not a date", Id: "5500000000004" }),
  order("#1005", {}),
].join("\r\n");

const CUSTOMERS_CSV = [
  "Customer ID,First Name,Last Name,Email,Phone,Total Orders",
  "'7700000000001,Avery,Synthetic,AVERY@example.invalid,+12025550142,1",
].join("\n");

describe("Shopify orders CSV import", () => {
  it("parses quoted fields with commas, quotes, newlines, and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""\nz",2\n')).toEqual([
      ["a", "b"],
      ['x, "y"\nz', "2"],
    ]);
  });

  it("converts Shopify's export timestamps to ISO", () => {
    expect(shopifyCsvDate("2024-03-05 14:22:31 -0500")).toBe(
      "2024-03-05T19:22:31.000Z",
    );
    expect(shopifyCsvDate("2024-03-05T14:22:31Z")).toBe(
      "2024-03-05T14:22:31.000Z",
    );
    expect(shopifyCsvDate("March 5")).toBeNull();
  });

  it("groups line rows into orders and links customers by email", () => {
    const result = mapShopifyOrdersCsv(
      ORDERS_CSV,
      mapShopifyCustomersCsv(CUSTOMERS_CSV),
    );
    expect(result.orders.map((order) => order.name)).toEqual([
      "#1001",
      "#1002",
      "#1003",
    ]);
    expect(result.orders[0]).toEqual({
      id: "gid://shopify/Order/5500000000001",
      name: "#1001",
      createdAt: "2024-03-05T19:22:31.000Z",
      cancelledAt: null,
      financialStatus: "paid",
      fulfillmentStatus: "fulfilled",
      currency: "USD",
      total: "42.50",
      customerId: "gid://shopify/Customer/7700000000001",
      lineItems: [
        {
          title: "Travel kit - Navy",
          sku: "KIT-1",
          quantity: 2,
          unitPrice: "15.00",
          discount: "3.00",
        },
        {
          title: "Refill pack",
          sku: "REF-1",
          quantity: 1,
          unitPrice: "12.50",
          discount: "0.00",
        },
      ],
    });
    expect(result.orders[1]?.customerId).toBeNull();
    expect(result.orders[2]).toMatchObject({
      customerId: null,
      cancelledAt: "2024-05-02T10:00:00.000Z",
    });
    expect(result.ordersWithoutEmail).toBe(1);
    expect(result.unmatchedCustomerOrders).toBe(1);
    expect(result.skipped).toEqual({
      invalid_date: 1,
      missing_order_id: 1,
    });
  });

  it("keeps names, emails, phones, addresses, and notes out of the result", () => {
    const serialized = JSON.stringify(
      mapShopifyOrdersCsv(ORDERS_CSV, mapShopifyCustomersCsv(CUSTOMERS_CSV)),
    );
    for (const value of [
      "example.invalid",
      "Synthetic",
      "Example St",
      "2025550142",
      "door",
    ])
      expect(serialized).not.toContain(value);
  });

  it("names missing columns and a customers export without IDs", () => {
    expect(() => mapShopifyOrdersCsv("Name,Email\n#1,a@b.c")).toThrow(
      /missing columns: Id, Created at/,
    );
    expect(() => mapShopifyCustomersCsv("First Name,Email\nA,a@b.c")).toThrow(
      /Customer ID/,
    );
  });
});
