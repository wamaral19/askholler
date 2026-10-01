import { z } from "zod";

const safeKey = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);

const fixedColumns = [
  { key: "interview_id", label: "Interview ID" },
  { key: "research_run_id", label: "Research run ID" },
  { key: "order_number", label: "Order number" },
  { key: "shopify_customer_id", label: "Shopify customer ID" },
] as const;
const fixedColumnKeys: ReadonlySet<string> = new Set(
  fixedColumns.map((column) => column.key),
);

export const earshotColumnSchema = z
  .object({
    key: safeKey,
    label: z.string().min(1).max(160),
    valueType: z.enum(["text", "number", "boolean", "date", "url"]),
    fieldVersionId: z.string().min(1).max(160).optional(),
  })
  .strict();

export const earshotRowSchema = z
  .object({
    interviewId: z.string().min(1).max(160),
    researchRunId: z.string().min(1).max(160),
    /**
     * The merchant's own references, so they can open the order and customer
     * in Shopify. Neither is a direct identifier; contact details never appear.
     */
    orderNumber: z.string().trim().min(1).max(64).nullable(),
    shopifyCustomerId: z
      .string()
      .regex(/^[1-9][0-9]{0,19}$/)
      .nullable(),
    values: z.record(
      safeKey,
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
    reviewed: z.literal(true),
  })
  .strict();

export const earshotExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    exportId: z.string().uuid(),
    merchantId: z.string().uuid(),
    periodStart: z.iso.datetime({ offset: true }),
    periodEnd: z.iso.datetime({ offset: true }),
    generatedAt: z.iso.datetime({ offset: true }),
    cohortSnapshot: z.unknown(),
    columns: z.array(earshotColumnSchema).min(1),
    rows: z.array(earshotRowSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.periodStart) >= Date.parse(value.periodEnd)) {
      context.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Earshot period end must follow its start",
      });
    }
    if (
      Date.parse(value.periodEnd) - Date.parse(value.periodStart) !==
      7 * 24 * 60 * 60 * 1000
    ) {
      context.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Earshot exports cover exactly one week",
      });
    }
    const keys = value.columns.map((column) => column.key);
    if (keys.some((key) => fixedColumnKeys.has(key))) {
      context.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Earshot columns cannot shadow a fixed reference column",
      });
    }
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Earshot column keys must be unique",
      });
    }
    // Fixed references come from typed row fields, never from free-form values.
    const allowed = new Set(keys);
    value.rows.forEach((row, index) => {
      for (const key of Object.keys(row.values)) {
        if (!allowed.has(key))
          context.addIssue({
            code: "custom",
            path: ["rows", index, "values", key],
            message: "Row contains an unpinned Earshot column",
          });
      }
    });
  });

export type EarshotExport = z.infer<typeof earshotExportSchema>;

/**
 * A deterministic CSV renderer. Rows carry the merchant's order and customer
 * references; direct identifiers (name, phone, email) are not part of the model.
 */
export function renderEarshotCsv(input: unknown): string {
  const exportModel = earshotExportSchema.parse(input);
  const columns = [...fixedColumns, ...exportModel.columns];
  const lines = [columns.map((column) => csvCell(column.label)).join(",")];
  for (const row of exportModel.rows) {
    const fixed: Record<string, string | null> = {
      interview_id: row.interviewId,
      research_run_id: row.researchRunId,
      order_number: row.orderNumber,
      shopify_customer_id: row.shopifyCustomerId,
    };
    lines.push(
      columns
        .map((column) =>
          csvCell(
            fixedColumnKeys.has(column.key)
              ? fixed[column.key]
              : row.values[column.key],
          ),
        )
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Prevent spreadsheet formula execution without changing ordinary values.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export interface EarshotArtifactStore {
  putPrivate(
    objectKey: string,
    content: string,
    contentType: "text/csv",
  ): Promise<void>;
}

export interface EarshotAuditSink {
  record(event: {
    merchantId: string;
    actorId: string;
    action: "earshot.exported";
    exportId: string;
    objectKey: string;
  }): Promise<void>;
}

export async function publishPrivateEarshot(
  input: unknown,
  actor: { merchantId: string; actorId: string; isAdmin: boolean },
  dependencies: { artifacts: EarshotArtifactStore; audit: EarshotAuditSink },
): Promise<{ exportId: string; objectKey: string }> {
  const model = earshotExportSchema.parse(input);
  if (!actor.isAdmin || actor.merchantId !== model.merchantId)
    throw new Error("EARSHOT_EXPORT_FORBIDDEN");
  const objectKey = `merchants/${model.merchantId}/earshots/${model.exportId}.csv`;
  await dependencies.artifacts.putPrivate(
    objectKey,
    renderEarshotCsv(model),
    "text/csv",
  );
  await dependencies.audit.record({
    merchantId: model.merchantId,
    actorId: actor.actorId,
    action: "earshot.exported",
    exportId: model.exportId,
    objectKey,
  });
  return { exportId: model.exportId, objectKey };
}
