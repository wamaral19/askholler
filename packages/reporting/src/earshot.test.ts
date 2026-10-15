import { describe, expect, it, vi } from "vitest";
import {
  earshotExportSchema,
  publishPrivateEarshot,
  renderEarshotCsv,
} from "./earshot";

const model = {
  schemaVersion: 1 as const,
  exportId: "00000000-0000-7000-8000-000000000801",
  merchantId: "00000000-0000-7000-8000-000000000001",
  periodStart: "2026-09-14T00:00:00.000Z",
  periodEnd: "2026-09-21T00:00:00.000Z",
  generatedAt: "2026-09-21T12:00:00.000Z",
  cohortSnapshot: {
    predicate: "customer.order_sequence",
    version: 1,
    config: { operator: "equals", value: 2 },
  },
  columns: [
    {
      key: "discovery_source",
      label: "Discovery source",
      valueType: "text" as const,
      fieldVersionId: "field-v1",
    },
    {
      key: "transcript_reference",
      label: "Transcript reference",
      valueType: "url" as const,
    },
  ],
  rows: [
    {
      interviewId: "interview-opaque-1",
      researchRunId: "run-opaque-1",
      orderNumber: "#1042",
      shopifyCustomerId: "900000000101",
      reviewed: true as const,
      values: {
        discovery_source: "Creator, video",
        transcript_reference: '=HYPERLINK("bad")',
      },
    },
  ],
};

describe("Earshot exports", () => {
  it("renders pinned columns deterministically and neutralizes spreadsheet formulas", () => {
    const csv = renderEarshotCsv(model);
    expect(renderEarshotCsv(structuredClone(model))).toBe(csv);
    expect(csv).toContain('"Creator, video"');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("customer_name");
  });

  it("leads every row with the merchant's order and customer references", () => {
    const [header, row] = renderEarshotCsv(model).split("\r\n");
    expect(header).toBe(
      '"Interview ID","Research run ID","Order number","Shopify customer ID","Discovery source","Transcript reference"',
    );
    expect(row).toMatch(
      /^"interview-opaque-1","run-opaque-1","#1042","900000000101",/,
    );

    const guest = renderEarshotCsv({
      ...model,
      rows: [{ ...model.rows[0], shopifyCustomerId: null }],
    }).split("\r\n")[1];
    expect(guest).toMatch(/^"interview-opaque-1","run-opaque-1","#1042","",/);
  });

  it("requires reference fields and keeps them out of free-form values", () => {
    const { orderNumber: _omit, ...withoutOrder } = model.rows[0]!;
    expect(
      earshotExportSchema.safeParse({ ...model, rows: [withoutOrder] }).success,
    ).toBe(false);
    expect(
      earshotExportSchema.safeParse({
        ...model,
        rows: [
          { ...model.rows[0], shopifyCustomerId: "gid://shopify/Customer/1" },
        ],
      }).success,
    ).toBe(false);
    expect(
      earshotExportSchema.safeParse({
        ...model,
        rows: [
          {
            ...model.rows[0],
            values: { ...model.rows[0]!.values, order_number: "#9999" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      earshotExportSchema.safeParse({
        ...model,
        columns: [
          ...model.columns,
          { key: "order_number", label: "Order", valueType: "text" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unpinned fields and unreviewed rows", () => {
    expect(
      earshotExportSchema.safeParse({
        ...model,
        rows: [
          {
            ...model.rows[0],
            values: { private_email: "synthetic@example.invalid" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      earshotExportSchema.safeParse({
        ...model,
        rows: [{ ...model.rows[0], reviewed: false }],
      }).success,
    ).toBe(false);
  });

  it("requires a same-tenant admin and audits private delivery", async () => {
    const artifacts = { putPrivate: vi.fn(async () => undefined) };
    const audit = { record: vi.fn(async () => undefined) };
    await expect(
      publishPrivateEarshot(
        model,
        { merchantId: model.merchantId, actorId: "admin", isAdmin: false },
        { artifacts, audit },
      ),
    ).rejects.toThrow("EARSHOT_EXPORT_FORBIDDEN");
    const result = await publishPrivateEarshot(
      model,
      { merchantId: model.merchantId, actorId: "admin", isAdmin: true },
      { artifacts, audit },
    );
    expect(result.objectKey).toContain(`/earshots/${model.exportId}.csv`);
    expect(artifacts.putPrivate).toHaveBeenCalledWith(
      result.objectKey,
      expect.any(String),
      "text/csv",
    );
    expect(audit.record).toHaveBeenCalledOnce();
  });
});
