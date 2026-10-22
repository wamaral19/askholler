import { createHash, randomInt, randomUUID } from "node:crypto";

import {
  customers,
  demoSessions,
  merchants,
  orderLineItems,
  orders,
  productCategories,
  productCategoryAssignments,
  products,
  type HollerDatabase,
} from "@holler/db";
import type { CustomerPrivateCipher } from "@holler/providers";
import type { ShopifyOrderIngressV1 } from "@holler/shopify";
import { and, desc, eq, sql } from "drizzle-orm";

// Qualification normally runs in the worker from the outbox. The demo runs it
// inline too (it is idempotent per event and moment version) so a demo never
// depends on a second process; a running worker simply finds the work done.
import { qualifyCommerceEvent } from "../../../../worker/src/qualify-commerce-event";
import { getCustomerPrivateCipher } from "../customer-private.server";
import type {
  OperationsApplicationService,
  TenantContext,
} from "../operations-types";
import {
  customerIdFor,
  ingestShopifyOrder,
  normalizePhoneE164,
  recordShopifyInstall,
  shopifyMerchantId,
  stableUuid,
} from "../shopify-ingestion.server";
import {
  HERO_CATEGORY,
  buildDemoAngle,
  buildSampleFindings,
  type SampleFindings,
} from "./angle";
import {
  validateDemoConfig,
  type DemoConfig,
  type DemoProduct,
} from "./catalog";
import {
  DEMO_HISTORY_DAYS,
  generateDemoDataset,
  observedAttributionFor,
  pickChannel,
  seededRandom,
  type DemoChannel,
} from "./dataset";

/**
 * Development-only sales demos. Every demo runs on one dedicated synthetic
 * merchant that is wiped and re-seeded from the prospect's storefront, so a
 * demo can never touch another merchant's data. Fictional customers carry
 * synthetic contact values; only the prospect's own phone is real, and it is
 * KMS-encrypted like any customer's.
 */

export const DEMO_SHOP_DOMAIN = "holler-sales-demo.myshopify.com";
export const DEMO_MERCHANT_ID = shopifyMerchantId(DEMO_SHOP_DOMAIN);
const DAY_MS = 24 * 60 * 60 * 1000;
const INSERT_BATCH = 500;

export class DemoError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DemoError";
  }
}

export function demoModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HOLLER_DEMO_MODE === "enabled" && env.NODE_ENV !== "production";
}

export interface DemoCheck {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** What must be true for every step of a demo to work. */
export function demoPreflight(context: TenantContext): DemoCheck[] {
  const twilio = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_API_KEY_SID",
    "TWILIO_API_KEY_SECRET",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_TWIML_APP_SID",
    "TWILIO_CALLER_ID",
    "TWILIO_CALL_INTENT_SECRET",
  ].filter((key) => !process.env[key]);
  return [
    {
      label: "Demo workspace access",
      ok: context.merchantIds.includes(DEMO_MERCHANT_ID),
      detail: context.merchantIds.includes(DEMO_MERCHANT_ID)
        ? "You can switch to the demo workspace."
        : `Add ${DEMO_MERCHANT_ID} to your session's merchantIds in HOLLER_SYNTHETIC_WORKFORCE_SESSIONS, then restart the dev server.`,
    },
    {
      label: "Synthetic customer contacts",
      ok: process.env.HOLLER_OPERATIONS_MODE === "synthetic-postgres",
      detail:
        "HOLLER_OPERATIONS_MODE=synthetic-postgres lets fictional demo customers appear in the queue.",
    },
    {
      label: "Encryption for the prospect's phone",
      ok: Boolean(process.env.PII_KMS_KEY_ID),
      detail: "PII_KMS_KEY_ID encrypts the phone number you call.",
    },
    {
      label: "Twilio calling",
      ok: twilio.length === 0,
      detail: twilio.length
        ? `Missing ${twilio.join(", ")}.`
        : "Browser calling is configured.",
    },
  ];
}

/** The demo merchant, acting with every role, for setup the operator authorized. */
export function demoContext(operator: TenantContext): TenantContext {
  return {
    merchantId: DEMO_MERCHANT_ID,
    merchantIds: [DEMO_MERCHANT_ID],
    researcherId: operator.researcherId,
    correlationId: operator.correlationId,
    roles: [
      "platform_admin",
      "merchant_admin",
      "research_manager",
      "researcher",
    ],
  };
}

export function requireDemoOperator(context: TenantContext): void {
  if (!demoModeEnabled())
    throw new DemoError("DEMO_DISABLED", "Demo mode is off.");
  if (!context.roles.includes("platform_admin"))
    throw new DemoError(
      "PLATFORM_ADMIN_REQUIRED",
      "Running demos needs the platform_admin role.",
    );
}

// Children before parents. Tables without merchant_id are reached through
// their merchant-scoped parent.
const RESET_STATEMENTS: readonly string[] = [
  "delete from report_angles where report_revision_id in (select id from report_revisions where merchant_id = $1)",
  "delete from angle_evidence where merchant_id = $1",
  "delete from angle_metrics where merchant_id = $1",
  "delete from report_artifacts where merchant_id = $1",
  "delete from report_revisions where merchant_id = $1",
  "delete from reports where merchant_id = $1",
  "delete from angle_revisions where merchant_id = $1",
  "delete from angles where merchant_id = $1",
  "delete from response_evidence where merchant_id = $1",
  "delete from interview_responses where merchant_id = $1",
  "delete from interview_observations where merchant_id = $1",
  "delete from interview_prompt_progress where merchant_id = $1",
  "delete from transcript_segments where merchant_id = $1",
  "delete from transcripts where merchant_id = $1",
  "delete from recordings where merchant_id = $1",
  "delete from calls where merchant_id = $1",
  "delete from assignment_transitions where merchant_id = $1",
  "delete from interviews where merchant_id = $1",
  "delete from research_assignments where merchant_id = $1",
  "delete from qualification_evaluations where merchant_id = $1",
  "delete from research_moment_versions where merchant_id = $1",
  "delete from research_field_set_items where field_set_version_id in (select v.id from research_field_set_versions v join research_field_sets s on s.id = v.research_field_set_id where s.merchant_id = $1)",
  "delete from research_field_set_versions where research_field_set_id in (select id from research_field_sets where merchant_id = $1)",
  "delete from research_field_sets where merchant_id = $1",
  "delete from merchant_research_field_settings where merchant_id = $1",
  "delete from script_versions where merchant_id = $1",
  "delete from scripts where merchant_id = $1",
  "delete from research_moments where merchant_id = $1",
  "delete from research_field_versions where research_field_id in (select id from research_fields where merchant_id = $1)",
  "delete from research_fields where merchant_id = $1",
  "delete from commerce_events where merchant_id = $1",
  "delete from order_line_items where merchant_id = $1",
  "delete from orders where merchant_id = $1",
  "delete from customer_private where merchant_id = $1",
  "delete from customers where merchant_id = $1",
  "delete from product_category_assignments where merchant_id = $1",
  "delete from product_categories where merchant_id = $1",
  "delete from products where merchant_id = $1",
  "delete from webhook_receipts where merchant_id = $1",
  "delete from outbox_events where merchant_id = $1",
  "delete from durable_jobs where merchant_id = $1",
  "delete from audit_events where merchant_id = $1",
  "delete from deletion_steps where merchant_id = $1",
  "delete from deletion_requests where merchant_id = $1",
  "delete from retention_policies where merchant_id = $1",
  "delete from demo_sessions where merchant_id = $1",
];

/** Removes everything the demo merchant holds except the merchant row and memberships. */
export async function resetDemoMerchant(db: HollerDatabase): Promise<void> {
  stopAllLiveLoops();
  await db.transaction(async (tx) => {
    for (const statement of RESET_STATEMENTS)
      await tx.execute(
        sql.raw(statement.replace("$1", `'${DEMO_MERCHANT_ID}'`)),
      );
  });
}

const shopifyGid = (type: string, id: number | string) =>
  `gid://shopify/${type}/${id}`;
const minor = (price: string) => Math.round(Number(price) * 100);
const productUuid = (product: DemoProduct) =>
  stableUuid(
    `shopify-product:${DEMO_MERCHANT_ID}:${shopifyGid("Product", product.productId)}`,
  );

/** Non-Shopify catalogs have no IDs; give each product stable numeric ones. */
function withShopifyIds(config: DemoConfig): DemoConfig {
  return {
    ...config,
    products: config.products.map((product, index) => ({
      ...product,
      productId: /^\d+$/.test(product.productId)
        ? product.productId
        : String(910_000_000_000 + index),
      variantId: /^\d+$/.test(product.variantId)
        ? product.variantId
        : String(920_000_000_000 + index),
    })),
  };
}

export interface DemoSessionView {
  readonly id: string;
  readonly status: "seeding" | "live" | "ended" | "failed";
  readonly website: string;
  readonly companyName: string;
  readonly config: DemoConfig;
  readonly sample: SampleFindings;
  readonly researchMomentId: string | null;
  readonly liveUntil: string | null;
  readonly liveOrdersSent: number;
  readonly loopRunning: boolean;
  readonly prospectOrderNumber: string | null;
  readonly prospectCustomerId: string | null;
  readonly createdAt: string;
}

export async function getCurrentDemo(
  db: HollerDatabase,
): Promise<DemoSessionView | null> {
  const [row] = await db
    .select()
    .from(demoSessions)
    .where(eq(demoSessions.merchantId, DEMO_MERCHANT_ID))
    .orderBy(desc(demoSessions.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status as DemoSessionView["status"],
    website: row.website,
    companyName: row.companyName,
    config: row.config as DemoConfig,
    sample: row.sample as SampleFindings,
    researchMomentId: row.researchMomentId,
    liveUntil: row.liveUntil?.toISOString() ?? null,
    liveOrdersSent: row.liveOrdersSent,
    loopRunning: liveLoops().has(row.id),
    prospectOrderNumber: row.prospectOrderNumber,
    prospectCustomerId: row.prospectCustomerId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Wipes the demo merchant, seeds the prospect's catalog with months of
 * synthetic order history, publishes the repeat-purchase angle, and starts a
 * stream of live orders that keeps the research queue full.
 */
export async function startDemo(
  db: HollerDatabase,
  operations: OperationsApplicationService,
  operator: TenantContext,
  input: DemoConfig,
  options: { now?: Date; startLiveOrders?: boolean } = {},
): Promise<string> {
  const now = options.now ?? new Date();
  requireDemoOperator(operator);
  const problems = validateDemoConfig(input);
  if (problems.length)
    throw new DemoError("INVALID_DEMO_CONFIG", problems.join(" "));
  const config = withShopifyIds(input);
  const hero = config.products[config.heroIndex]!;
  const others = config.products.filter(
    (_, index) => index !== config.heroIndex,
  );

  await resetDemoMerchant(db);
  const installedAt = new Date(
    now.getTime() - (DEMO_HISTORY_DAYS + 20) * DAY_MS,
  );
  await recordShopifyInstall(db, DEMO_SHOP_DOMAIN, installedAt);
  await db
    .update(merchants)
    .set({
      name: config.companyName.trim(),
      timezone: "America/New_York",
      status: "active",
      installedAt,
      uninstalledAt: null,
      updatedAt: now,
    })
    .where(eq(merchants.id, DEMO_MERCHANT_ID));

  await seedCatalog(db, config, now);
  await seedHistory(db, config, now);

  const context = demoContext(operator);
  const angle = buildDemoAngle({
    companyName: config.companyName,
    heroTitle: hero.title,
    otherTitles: others.map((product) => product.title),
  });
  const [script] = await operations.listScripts(context);
  const fields = (await operations.listResearchFields(context)).filter(
    (field) => field.includedByDefault,
  );
  const { id: researchMomentId } = await operations.saveMoment(context, {
    name: angle.name,
    objective: angle.objective,
    weeklyTarget: 25,
    cohortExpression: angle.cohortExpression,
    fields: fields.length
      ? fields.map((field) => ({
          kind: "library" as const,
          fieldVersionId: field.id,
          required: false,
        }))
      : [
          {
            kind: "new" as const,
            label: "Why they came back",
            prompt: "Why did they buy again?",
            required: false,
          },
        ],
    ...(script
      ? {
          script: {
            baseScriptVersionId: script.versionId,
            prompts: [...angle.prompts],
          },
        }
      : {}),
    publish: true,
  });
  // General calls take live orders the angle does not; the moment is
  // otherwise created lazily when someone first opens the queue.
  await operations.getGeneralCalls(context);

  const id = randomUUID();
  await db.insert(demoSessions).values({
    id,
    merchantId: DEMO_MERCHANT_ID,
    website: config.website,
    companyName: config.companyName.trim(),
    config,
    sample: buildSampleFindings({
      companyName: config.companyName,
      heroTitle: hero.title,
      otherTitles: others.map((product) => product.title),
    }),
    researchMomentId,
    status: "live",
    liveUntil: new Date(now.getTime() + config.liveMinutes * 60_000),
    createdBy: operator.researcherId,
  });
  if (options.startLiveOrders ?? true)
    startLiveLoop(db, id, config.liveIntervalSeconds);
  return id;
}

async function seedCatalog(
  db: HollerDatabase,
  config: DemoConfig,
  now: Date,
): Promise<void> {
  const hero = config.products[config.heroIndex]!;
  await db.insert(products).values(
    config.products.map((product) => ({
      id: productUuid(product),
      merchantId: DEMO_MERCHANT_ID,
      shopifyProductId: shopifyGid("Product", product.productId),
      title: product.title,
      catalogEnrichmentState: "ready",
      sourceUpdatedAt: now,
    })),
  );
  const categoryId = stableUuid(
    `demo-category:${DEMO_MERCHANT_ID}:${HERO_CATEGORY.key}`,
  );
  await db.insert(productCategories).values({
    id: categoryId,
    merchantId: DEMO_MERCHANT_ID,
    source: HERO_CATEGORY.namespace,
    key: HERO_CATEGORY.key,
    label: hero.title,
  });
  await db.insert(productCategoryAssignments).values({
    merchantId: DEMO_MERCHANT_ID,
    productId: productUuid(hero),
    categoryId,
  });
}

/** Historical orders are bulk-inserted; they are past the queue window anyway. */
async function seedHistory(
  db: HollerDatabase,
  config: DemoConfig,
  now: Date,
): Promise<void> {
  const dataset = generateDemoDataset({
    seed: `${config.website}|${config.products.map((product) => product.sku).join(",")}|${config.heroIndex}`,
    productCount: config.products.length,
    heroIndex: config.heroIndex,
    targetOrders: config.historicalOrders,
    now,
  });
  const installedAt = new Date(
    now.getTime() - (DEMO_HISTORY_DAYS + 20) * DAY_MS,
  );
  const flat = dataset.flatMap((customer) =>
    customer.orders.map((order, index) => ({
      customer,
      order,
      sequence: index + 1,
    })),
  );
  flat.sort(
    (a, b) => a.order.orderedAt.getTime() - b.order.orderedAt.getTime(),
  );

  const customerRows: (typeof customers.$inferInsert)[] = [];
  const orderRows: (typeof orders.$inferInsert)[] = [];
  const lineRows: (typeof orderLineItems.$inferInsert)[] = [];
  const totals = new Map<number, number>();
  flat.forEach(({ customer, order, sequence }, position) => {
    const shopifyOrderId = 4_000_000_000_000 + position + 1;
    const orderId = stableUuid(
      `shopify-order:${DEMO_MERCHANT_ID}:${shopifyGid("Order", shopifyOrderId)}`,
    );
    const customerId = customerIdFor(
      DEMO_MERCHANT_ID,
      shopifyGid("Customer", 3_000_000_000_000 + customer.index),
    );
    let totalMinor = 0;
    order.lines.forEach((line, lineIndex) => {
      const product = config.products[line.productIndex]!;
      const shopifyLineId = shopifyOrderId * 10 + lineIndex;
      totalMinor += minor(product.price) * line.quantity;
      lineRows.push({
        id: stableUuid(
          `shopify-line:${DEMO_MERCHANT_ID}:${shopifyGid("LineItem", shopifyLineId)}`,
        ),
        merchantId: DEMO_MERCHANT_ID,
        orderId,
        shopifyLineItemId: shopifyGid("LineItem", shopifyLineId),
        productId: productUuid(product),
        shopifyVariantId: shopifyGid("ProductVariant", product.variantId),
        sku: product.sku,
        title: product.title,
        variantTitle: product.variantTitle,
        quantity: line.quantity,
        unitPriceMinor: minor(product.price),
        refundedQuantity: order.refunded ? line.quantity : 0,
        currency: "USD",
      });
    });
    totals.set(customer.index, (totals.get(customer.index) ?? 0) + totalMinor);
    orderRows.push({
      id: orderId,
      merchantId: DEMO_MERCHANT_ID,
      customerId,
      shopifyOrderId: shopifyGid("Order", shopifyOrderId),
      sourceOrderNumber: `#${1000 + position + 1}`,
      orderedAt: order.orderedAt,
      sourceUpdatedAt: order.orderedAt,
      totalMinor,
      currency: "USD",
      customerOrderSequence: sequence,
      financialStatus: order.refunded ? "refunded" : "paid",
      fulfillmentStatus: "fulfilled",
      observedAttribution: observedAttributionFor(
        order.channel,
        order.orderedAt,
        `/products/${config.products[order.lines[0]!.productIndex]!.handle}`,
      ),
    });
  });
  for (const customer of dataset) {
    const first = customer.orders[0]!;
    customerRows.push({
      id: customerIdFor(
        DEMO_MERCHANT_ID,
        shopifyGid("Customer", 3_000_000_000_000 + customer.index),
      ),
      merchantId: DEMO_MERCHANT_ID,
      shopifyCustomerId: shopifyGid(
        "Customer",
        3_000_000_000_000 + customer.index,
      ),
      orderCount: customer.orders.length,
      lifetimeRevenueMinor: totals.get(customer.index) ?? 0,
      currency: "USD",
      firstOrderAt: first.orderedAt,
      latestOrderAt: customer.orders.at(-1)!.orderedAt,
      historyCompleteness: {
        state: "complete",
        historyStartAt: installedAt.toISOString(),
        reason: "full_import",
      },
      contactabilityStatus: "no_phone",
    });
  }
  for (let start = 0; start < customerRows.length; start += INSERT_BATCH)
    await db
      .insert(customers)
      .values(customerRows.slice(start, start + INSERT_BATCH));
  for (let start = 0; start < orderRows.length; start += INSERT_BATCH)
    await db
      .insert(orders)
      .values(orderRows.slice(start, start + INSERT_BATCH));
  for (let start = 0; start < lineRows.length; start += INSERT_BATCH)
    await db
      .insert(orderLineItems)
      .values(lineRows.slice(start, start + INSERT_BATCH));
}

/**
 * Stands in for KMS for fictional customers only: values use the synthetic
 * fixture format the synthetic-postgres decryptor accepts (555-01xx phones).
 */
const syntheticContactCipher = {
  async encrypt(_subject: unknown, field: string, value: string) {
    return {
      ciphertext:
        field === "phone_e164"
          ? `synthetic:v1:${value}`
          : `synthetic:plain:${value}`,
      keyVersion: "synthetic-v1",
    };
  },
};

const FIRST_NAMES = [
  "Avery",
  "Jordan",
  "Riley",
  "Morgan",
  "Quinn",
  "Casey",
  "Rowan",
  "Emerson",
  "Harper",
  "Sage",
  "Parker",
  "Dakota",
  "Reese",
  "Hayden",
  "Blake",
  "Finley",
];
const LOCALITIES = [
  "Portland, OR",
  "Austin, TX",
  "Asheville, NC",
  "Madison, WI",
  "Denver, CO",
  "Raleigh, NC",
  "Boise, ID",
  "Columbus, OH",
  "Tucson, AZ",
  "Burlington, VT",
];

async function nextOrderNumber(db: HollerDatabase): Promise<string> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.merchantId, DEMO_MERCHANT_ID));
  return `#${1000 + (row?.count ?? 0) + 1}`;
}

interface LiveOrderInput {
  readonly config: DemoConfig;
  readonly shopifyCustomerId: string;
  readonly customerCreatedAt: Date;
  readonly productIndexes: readonly number[];
  readonly channel: DemoChannel;
  readonly contact: {
    phone: string;
    firstName: string;
    locality: string | null;
  };
  readonly orderedAt: Date;
  readonly orderName: string;
}

function liveIngress(input: LiveOrderInput): ShopifyOrderIngressV1 {
  const shopifyOrderId = 5_000_000_000_000 + Date.now() * 10 + randomInt(10);
  const lines = input.productIndexes.map((productIndex, index) => {
    const product = input.config.products[productIndex]!;
    return {
      id: shopifyGid("LineItem", shopifyOrderId * 10 + index),
      productId: shopifyGid("Product", product.productId),
      variantId: shopifyGid("ProductVariant", product.variantId),
      sku: product.sku,
      title: product.title,
      variantTitle: product.variantTitle,
      quantity: 1,
      unitPrice: { amount: product.price, currency: "USD" },
      discount: null,
      refundedQuantity: 0,
    };
  });
  const total =
    input.productIndexes.reduce(
      (sum, index) => sum + minor(input.config.products[index]!.price),
      0,
    ) / 100;
  const at = input.orderedAt.toISOString();
  const firstProduct = input.config.products[input.productIndexes[0]!]!;
  return {
    schemaVersion: 1,
    webhookId: randomUUID(),
    eventId: randomUUID(),
    shopDomain: DEMO_SHOP_DOMAIN,
    apiVersion: "2026-10",
    triggeredAt: at,
    order: {
      id: shopifyGid("Order", shopifyOrderId),
      name: input.orderName,
      createdAt: at,
      updatedAt: at,
      cancelledAt: null,
      test: true,
      financialStatus: "paid",
      fulfillmentStatus: null,
      total: { amount: total.toFixed(2), currency: "USD" },
      customer: {
        id: input.shopifyCustomerId,
        phone: input.contact.phone,
        firstName: input.contact.firstName,
        locality: input.contact.locality,
        createdAt: input.customerCreatedAt.toISOString(),
      },
      lineItems: lines,
      observedAttribution: observedAttributionFor(
        input.channel,
        input.orderedAt,
        `/products/${firstProduct.handle}`,
      ),
    },
  };
}

async function ingestAndQualify(
  db: HollerDatabase,
  ingress: ShopifyOrderIngressV1,
  cipher: Parameters<typeof ingestShopifyOrder>[4],
  now: Date,
): Promise<void> {
  const body = JSON.stringify(ingress);
  const result = await ingestShopifyOrder(
    db,
    ingress,
    createHash("sha256").update(body).digest("hex"),
    now,
    cipher,
  );
  if (result.outcome === "ingested")
    await qualifyCommerceEvent(
      db,
      {
        merchantId: result.merchantId,
        commerceEventId: result.commerceEventId,
      },
      now,
    );
}

/**
 * One live order: usually a past hero buyer reordering (the angle's cohort),
 * otherwise a first order elsewhere in the catalog (general calls).
 */
export async function sendLiveOrder(
  db: HollerDatabase,
  demoId: string,
  now = new Date(),
): Promise<boolean> {
  const [session] = await db
    .select()
    .from(demoSessions)
    .where(eq(demoSessions.id, demoId));
  if (
    !session ||
    session.status !== "live" ||
    !session.liveUntil ||
    session.liveUntil <= now
  ) {
    if (session?.status === "live")
      await db
        .update(demoSessions)
        .set({ status: "ended", updatedAt: now })
        .where(eq(demoSessions.id, demoId));
    return false;
  }
  const config = session.config as DemoConfig;
  const random = seededRandom(`${demoId}:${session.liveOrdersSent}`);
  const phone = `+120255501${String(randomInt(100)).padStart(2, "0")}`;
  const contact = {
    phone,
    firstName: FIRST_NAMES[randomInt(FIRST_NAMES.length)]!,
    locality: LOCALITIES[randomInt(LOCALITIES.length)]!,
  };
  const orderName = await nextOrderNumber(db);
  const heroIndex = config.heroIndex;

  let ingress: ShopifyOrderIngressV1 | null = null;
  if (random() < 0.65) {
    const result = await db.execute(sql`
      select c.shopify_customer_id, c.first_order_at from customers c
      where c.merchant_id = ${DEMO_MERCHANT_ID}
        and c.contactability_status = 'no_phone'
        and c.latest_order_at < ${new Date(now.getTime() - 14 * DAY_MS)}
        and exists (
          select 1 from order_line_items oli join orders o on o.id = oli.order_id
          where o.customer_id = c.id and oli.merchant_id = c.merchant_id
            and oli.product_id = ${productUuid(config.products[heroIndex]!)}
        )
      order by random() limit 1
    `);
    const returning = result.rows[0] as
      | { shopify_customer_id: string; first_order_at: Date | string }
      | undefined;
    if (returning) {
      const extra =
        random() < 0.3
          ? [
              (heroIndex + 1 + randomInt(config.products.length - 1)) %
                config.products.length,
            ]
          : [];
      ingress = liveIngress({
        config,
        shopifyCustomerId: returning.shopify_customer_id,
        customerCreatedAt: new Date(returning.first_order_at),
        productIndexes: [heroIndex, ...extra],
        channel: pickChannel(random, true),
        contact,
        orderedAt: now,
        orderName,
      });
    }
  }
  if (!ingress) {
    const choices = config.products
      .map((_, index) => index)
      .filter((index) => index !== heroIndex);
    ingress = liveIngress({
      config,
      shopifyCustomerId: shopifyGid(
        "Customer",
        3_500_000_000_000 + Date.now() * 10 + randomInt(10),
      ),
      customerCreatedAt: now,
      productIndexes: [choices[Math.floor(random() * choices.length)]!],
      channel: pickChannel(random, false),
      contact,
      orderedAt: now,
      orderName,
    });
  }
  await ingestAndQualify(db, ingress, syntheticContactCipher, now);
  await db
    .update(demoSessions)
    .set({
      liveOrdersSent: sql`${demoSessions.liveOrdersSent} + 1`,
      updatedAt: now,
    })
    .where(eq(demoSessions.id, demoId));
  return true;
}

/**
 * Places a repeat order for the prospect so they appear at the top of the
 * angle's queue with their real phone, KMS-encrypted. The first call creates
 * their customer with a past order of the hero product; later calls add
 * another repeat order, since the queue only holds an order for five minutes.
 */
export async function addProspectOrder(
  db: HollerDatabase,
  operator: TenantContext,
  input: { firstName: string; phone: string },
  options: {
    now?: Date;
    /** Defaults to the KMS cipher; tests inject a fixture cipher. */
    cipher?: Pick<CustomerPrivateCipher, "encrypt">;
  } = {},
): Promise<{ orderNumber: string; lastFour: string }> {
  const now = options.now ?? new Date();
  requireDemoOperator(operator);
  const cipher = options.cipher ?? getCustomerPrivateCipher();
  if (!cipher)
    throw new DemoError(
      "KMS_REQUIRED",
      "Set PII_KMS_KEY_ID so the prospect's phone can be stored encrypted.",
    );
  const phone = normalizePhoneE164(input.phone);
  if (!phone)
    throw new DemoError(
      "INVALID_PHONE",
      "Enter a phone number like +1 555 123 4567.",
    );
  // Fail before any order is written if KMS can't be reached; local
  // Google credentials expire and need a fresh sign-in.
  try {
    await cipher.encrypt(
      { merchantId: DEMO_MERCHANT_ID, customerId: DEMO_MERCHANT_ID },
      "phone_e164",
      "+10000000000",
    );
  } catch {
    throw new DemoError(
      "KMS_UNAVAILABLE",
      "Couldn't reach Google Cloud KMS to encrypt the phone number. If you're running locally, run `gcloud auth application-default login`, then restart the dev server.",
    );
  }
  const firstName = input.firstName.trim().slice(0, 60);
  if (!firstName)
    throw new DemoError("NAME_REQUIRED", "Enter the prospect's first name.");
  const demo = await getCurrentDemo(db);
  if (!demo || demo.status === "seeding" || demo.status === "failed")
    throw new DemoError("NO_DEMO", "Start a demo first.");
  const config = demo.config;
  const heroIndex = config.heroIndex;

  // The same phone and name keep the same customer across re-sends.
  const prospectKey = createHash("sha256")
    .update(`${demo.id}:${phone}:${firstName}`)
    .digest();
  const shopifyCustomerId = shopifyGid(
    "Customer",
    3_900_000_000_000 + (prospectKey.readUInt32BE(0) % 1_000_000_000),
  );
  const customerId = customerIdFor(DEMO_MERCHANT_ID, shopifyCustomerId);
  const [existing] = await db
    .select({ firstOrderAt: customers.firstOrderAt })
    .from(customers)
    .where(
      and(
        eq(customers.merchantId, DEMO_MERCHANT_ID),
        eq(customers.id, customerId),
      ),
    );
  const contact = { phone, firstName, locality: null };
  const createdAt =
    existing?.firstOrderAt ?? new Date(now.getTime() - 34 * DAY_MS);
  if (!existing)
    await ingestAndQualify(
      db,
      liveIngress({
        config,
        shopifyCustomerId,
        customerCreatedAt: createdAt,
        productIndexes: [heroIndex],
        channel: "meta",
        contact,
        orderedAt: createdAt,
        orderName: await nextOrderNumber(db),
      }),
      cipher,
      now,
    );
  const orderNumber = await nextOrderNumber(db);
  const other = config.products.findIndex((_, index) => index !== heroIndex);
  await ingestAndQualify(
    db,
    liveIngress({
      config,
      shopifyCustomerId,
      customerCreatedAt: createdAt,
      productIndexes: [heroIndex, other],
      channel: "email",
      contact,
      orderedAt: now,
      orderName: orderNumber,
    }),
    cipher,
    now,
  );
  await db
    .update(demoSessions)
    .set({
      prospectCustomerId: customerId,
      prospectOrderNumber: orderNumber,
      updatedAt: now,
    })
    .where(eq(demoSessions.id, demo.id));
  return { orderNumber, lastFour: phone.slice(-4) };
}

export async function endDemo(
  db: HollerDatabase,
  now = new Date(),
): Promise<void> {
  stopAllLiveLoops();
  await db
    .update(demoSessions)
    .set({ status: "ended", liveUntil: now, updatedAt: now })
    .where(
      and(
        eq(demoSessions.merchantId, DEMO_MERCHANT_ID),
        eq(demoSessions.status, "live"),
      ),
    );
}

/** Extends (or restarts) the live order stream for the current demo. */
export async function resumeLiveOrders(
  db: HollerDatabase,
  minutes: number,
  now = new Date(),
): Promise<void> {
  const demo = await getCurrentDemo(db);
  if (!demo || demo.status === "seeding" || demo.status === "failed")
    throw new DemoError("NO_DEMO", "Start a demo first.");
  await db
    .update(demoSessions)
    .set({
      status: "live",
      liveUntil: new Date(now.getTime() + minutes * 60_000),
      updatedAt: now,
    })
    .where(eq(demoSessions.id, demo.id));
  startLiveLoop(db, demo.id, demo.config.liveIntervalSeconds);
}

/**
 * Live loops are in-process timers, kept on globalThis so dev-server module
 * reloads do not start duplicates. A restarted server resumes the loop the
 * next time the demo console loads.
 */
function liveLoops(): Map<string, ReturnType<typeof setInterval>> {
  const holder = globalThis as {
    __hollerDemoLoops?: Map<string, ReturnType<typeof setInterval>>;
  };
  holder.__hollerDemoLoops ??= new Map();
  return holder.__hollerDemoLoops;
}

export function startLiveLoop(
  db: HollerDatabase,
  demoId: string,
  intervalSeconds: number,
): void {
  const loops = liveLoops();
  if (loops.has(demoId)) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!(await sendLiveOrder(db, demoId))) stopLiveLoop(demoId);
    } catch (error) {
      // Never log order contents; the code is enough to diagnose.
      console.error("demo.live_order_failed", {
        code: (error as { code?: string }).code ?? "unknown",
      });
    } finally {
      busy = false;
    }
  };
  loops.set(demoId, setInterval(tick, intervalSeconds * 1000));
  void tick();
}

function stopLiveLoop(demoId: string): void {
  const loops = liveLoops();
  const timer = loops.get(demoId);
  if (timer) clearInterval(timer);
  loops.delete(demoId);
}

function stopAllLiveLoops(): void {
  for (const id of [...liveLoops().keys()]) stopLiveLoop(id);
}

/** Restarts the loop after a dev-server restart if the demo should still be live. */
export async function ensureLiveLoop(
  db: HollerDatabase,
  demo: DemoSessionView,
  now = new Date(),
): Promise<boolean> {
  if (
    demo.status !== "live" ||
    !demo.liveUntil ||
    new Date(demo.liveUntil) <= now
  )
    return false;
  startLiveLoop(db, demo.id, demo.config.liveIntervalSeconds);
  return true;
}

export interface DemoQueueStats {
  readonly ordersTotal: number;
  readonly queued: number;
  readonly queuedForAngle: number;
}

export async function demoQueueStats(
  db: HollerDatabase,
  demo: DemoSessionView,
): Promise<DemoQueueStats> {
  const result = await db.execute(sql`
    select
      (select count(*)::int from orders where merchant_id = ${DEMO_MERCHANT_ID}) as orders_total,
      (select count(*)::int from research_assignments ra
        join orders o on o.id = ra.order_id
        where ra.merchant_id = ${DEMO_MERCHANT_ID} and ra.status in ('queued', 'claimed')
          and o.ordered_at > now() - interval '5 minutes') as queued,
      (select count(*)::int from research_assignments ra
        join orders o on o.id = ra.order_id
        join research_moment_versions v on v.id = ra.research_moment_version_id
        where ra.merchant_id = ${DEMO_MERCHANT_ID} and ra.status in ('queued', 'claimed')
          and o.ordered_at > now() - interval '5 minutes'
          and v.research_moment_id = ${demo.researchMomentId}) as queued_for_angle
  `);
  const row = result.rows[0] as {
    orders_total: number;
    queued: number;
    queued_for_angle: number;
  };
  return {
    ordersTotal: row.orders_total,
    queued: row.queued,
    queuedForAngle: row.queued_for_angle,
  };
}

export interface DemoReportFacts {
  /** Median days from first to second order. */
  readonly heroReorderDays: number | null;
  readonly othersReorderDays: number | null;
  /** Last-click source of hero repeat buyers' first orders. */
  readonly heroFirstOrderSources: readonly {
    source: string;
    customers: number;
  }[];
  /** The newest interview from the prospect's order, else any finished call. */
  readonly interviewId: string | null;
}

export async function demoReportFacts(
  db: HollerDatabase,
  demo: DemoSessionView,
): Promise<DemoReportFacts> {
  const hero = demo.config.products[demo.config.heroIndex]!;
  const heroProductId = productUuid(hero);
  const timing = await db.execute(sql`
    with firsts as (
      select o.customer_id,
        bool_or(oli.product_id = ${heroProductId}) as hero
      from orders o
      join order_line_items oli on oli.merchant_id = o.merchant_id and oli.order_id = o.id
      where o.merchant_id = ${DEMO_MERCHANT_ID} and o.customer_order_sequence = 1
      group by o.customer_id
    ), gaps as (
      select f.hero, extract(epoch from (second.ordered_at - first.ordered_at)) / 86400 as days
      from firsts f
      join orders first on first.merchant_id = ${DEMO_MERCHANT_ID}
        and first.customer_id = f.customer_id and first.customer_order_sequence = 1
      join orders second on second.merchant_id = ${DEMO_MERCHANT_ID}
        and second.customer_id = f.customer_id and second.customer_order_sequence = 2
    )
    select hero, percentile_cont(0.5) within group (order by days) as median
    from gaps group by hero
  `);
  const median = (hero: boolean) => {
    const row = (
      timing.rows as { hero: boolean; median: number | string | null }[]
    ).find((candidate) => candidate.hero === hero);
    return row?.median == null ? null : Math.round(Number(row.median));
  };
  const sources = await db.execute(sql`
    select coalesce(lower(o.observed_attribution->>'source'), 'unknown') as source,
      count(distinct o.customer_id)::int as customers
    from orders o
    join customers c on c.merchant_id = o.merchant_id and c.id = o.customer_id
    where o.merchant_id = ${DEMO_MERCHANT_ID}
      and o.customer_order_sequence = 1
      and c.order_count >= 2
      and exists (
        select 1 from order_line_items oli
        where oli.merchant_id = o.merchant_id and oli.order_id = o.id
          and oli.product_id = ${heroProductId}
      )
    group by 1 order by 2 desc
  `);
  const interview = await db.execute(sql`
    select i.id from interviews i
    join research_assignments ra on ra.id = i.research_assignment_id
    where i.merchant_id = ${DEMO_MERCHANT_ID}
      and i.status in ('reached', 'completed')
    order by (ra.customer_id = ${demo.prospectCustomerId ?? DEMO_MERCHANT_ID}) desc,
      i.created_at desc
    limit 1
  `);
  return {
    heroReorderDays: median(true),
    othersReorderDays: median(false),
    heroFirstOrderSources: sources.rows as {
      source: string;
      customers: number;
    }[],
    interviewId: (interview.rows[0] as { id: string } | undefined)?.id ?? null,
  };
}
