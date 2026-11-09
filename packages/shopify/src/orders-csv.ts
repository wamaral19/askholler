/**
 * Maps a merchant's Shopify admin exports (Orders → Export, and optionally
 * Customers → Export) into historical order facts. Exports carry names,
 * emails, phones, and street addresses; none of them leave this module. Email
 * is read only to link an order to its customer's Shopify ID, then discarded.
 */

export interface HistoricalOrderLineV1 {
  readonly title: string;
  readonly sku: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  /** Total discount on the line across all units. */
  readonly discount: string;
}

export interface HistoricalOrderV1 {
  /** Same GID a webhook carries, so a CSV order and its webhook converge. */
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly cancelledAt: string | null;
  readonly financialStatus: string | null;
  readonly fulfillmentStatus: string | null;
  readonly currency: string;
  readonly total: string;
  readonly customerId: string | null;
  readonly lineItems: readonly HistoricalOrderLineV1[];
}

export type HistoricalOrderSkipReason =
  "missing_order_id" | "invalid_date" | "invalid_amount" | "no_line_items";

export interface ShopifyOrdersCsvResult {
  readonly orders: HistoricalOrderV1[];
  readonly skipped: Partial<Record<HistoricalOrderSkipReason, number>>;
  /** Orders with an email that matched no row of the customers export. */
  readonly unmatchedCustomerOrders: number;
  /** Orders with no email at all (guest checkouts, POS without a customer). */
  readonly ordersWithoutEmail: number;
}

const REQUIRED_ORDER_COLUMNS = [
  "Name",
  "Id",
  "Created at",
  "Currency",
  "Total",
  "Lineitem name",
  "Lineitem quantity",
  "Lineitem price",
] as const;

/** RFC 4180 parsing: quoted fields may hold commas, quotes, and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

type CsvRecord = (column: string) => string;

function records(
  text: string,
  required: readonly string[],
  label: string,
): CsvRecord[] {
  const [header, ...rows] = parseCsv(text);
  const index = new Map((header ?? []).map((name, i) => [name.trim(), i]));
  const missing = required.filter((column) => !index.has(column));
  if (missing.length)
    throw new Error(
      `The ${label} export is missing columns: ${missing.join(", ")}`,
    );
  return rows.map((row) => (column) => {
    const i = index.get(column);
    return i === undefined ? "" : (row[i] ?? "").trim();
  });
}

/** "2024-03-05 14:22:31 -0500" (Shopify's export format) to ISO 8601. */
export function shopifyCsvDate(value: string): string | null {
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(?:([+-]\d{2}):?(\d{2})|Z)$/.exec(
      value.trim(),
    );
  if (!match) return null;
  const offset = match[3] ? `${match[3]}:${match[4]}` : "Z";
  const date = new Date(`${match[1]}T${match[2]}${offset}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/;
const amount = (value: string, fallback?: string): string | null => {
  const cleaned = value.replace(/,/g, "") || fallback;
  return cleaned !== undefined && AMOUNT.test(cleaned) ? cleaned : null;
};
const blankToNull = (value: string, maximum: number) =>
  value ? value.slice(0, maximum) : null;
/** Customer exports can prefix IDs with ' so spreadsheets keep every digit. */
const numericId = (value: string) => {
  const digits = value.replace(/^'/, "").trim();
  return /^[1-9][0-9]*$/.test(digits) ? digits : null;
};

/** Lowercased email to Customer GID, from a Shopify customers export. */
export function mapShopifyCustomersCsv(text: string): Map<string, string> {
  const [header] = parseCsv(text);
  const idColumn = ["Customer ID", "ID", "Id"].find((name) =>
    header?.some((column) => column.trim() === name),
  );
  if (!idColumn)
    throw new Error(
      'The customers export has no "Customer ID" column. Export customers again from Shopify admin.',
    );
  const emails = new Map<string, string>();
  for (const get of records(text, ["Email", idColumn], "customers")) {
    const email = get("Email").toLowerCase();
    const id = numericId(get(idColumn));
    if (email && id) emails.set(email, `gid://shopify/Customer/${id}`);
  }
  return emails;
}

/**
 * Groups the export's rows into orders. Shopify writes order-level columns on
 * an order's first row and line item columns on every row.
 */
export function mapShopifyOrdersCsv(
  ordersText: string,
  customerIdsByEmail: ReadonlyMap<string, string> = new Map(),
): ShopifyOrdersCsvResult {
  const groups = new Map<string, CsvRecord[]>();
  for (const get of records(ordersText, REQUIRED_ORDER_COLUMNS, "orders")) {
    const name = get("Name");
    if (!name) continue;
    groups.set(name, [...(groups.get(name) ?? []), get]);
  }

  const orders: HistoricalOrderV1[] = [];
  const skipped: Partial<Record<HistoricalOrderSkipReason, number>> = {};
  const skip = (reason: HistoricalOrderSkipReason) =>
    (skipped[reason] = (skipped[reason] ?? 0) + 1);
  let unmatchedCustomerOrders = 0;
  let ordersWithoutEmail = 0;

  for (const [name, rows] of groups) {
    const first = rows.find((get) => get("Id")) ?? rows[0]!;
    const id = numericId(first("Id"));
    if (!id) {
      skip("missing_order_id");
      continue;
    }
    const createdAt = shopifyCsvDate(first("Created at"));
    const cancelledRaw = first("Cancelled at");
    const cancelledAt = cancelledRaw ? shopifyCsvDate(cancelledRaw) : null;
    if (!createdAt || (cancelledRaw && !cancelledAt)) {
      skip("invalid_date");
      continue;
    }
    const currency = first("Currency").toUpperCase();
    const total = amount(first("Total"));
    if (!/^[A-Z]{3}$/.test(currency) || total === null) {
      skip("invalid_amount");
      continue;
    }

    const lineItems: HistoricalOrderLineV1[] = [];
    let invalidLine = false;
    for (const get of rows) {
      const title = get("Lineitem name");
      const quantity = Number(get("Lineitem quantity"));
      if (!title && !get("Lineitem quantity")) continue;
      const unitPrice = amount(get("Lineitem price"));
      const discount = amount(get("Lineitem discount"), "0");
      if (
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        unitPrice === null ||
        discount === null
      ) {
        invalidLine = true;
        break;
      }
      lineItems.push({
        title: title.slice(0, 500) || "Untitled item",
        sku: blankToNull(get("Lineitem sku"), 255),
        quantity,
        unitPrice,
        discount,
      });
    }
    if (invalidLine) {
      skip("invalid_amount");
      continue;
    }
    if (!lineItems.length) {
      skip("no_line_items");
      continue;
    }

    const email = first("Email").toLowerCase();
    const customerId = email ? (customerIdsByEmail.get(email) ?? null) : null;
    if (!email) ordersWithoutEmail++;
    else if (!customerId) unmatchedCustomerOrders++;

    orders.push({
      id: `gid://shopify/Order/${id}`,
      name: name.slice(0, 64),
      createdAt,
      cancelledAt,
      financialStatus: blankToNull(first("Financial Status"), 80),
      fulfillmentStatus: blankToNull(first("Fulfillment Status"), 80),
      currency,
      total,
      customerId,
      lineItems,
    });
  }
  return { orders, skipped, unmatchedCustomerOrders, ordersWithoutEmail };
}
