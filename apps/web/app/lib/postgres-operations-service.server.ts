import { createHash, randomUUID } from "node:crypto";

import {
  assignmentTransitions,
  auditEvents,
  calls,
  customerPrivate,
  customers,
  interviewObservations,
  interviewPromptProgress,
  interviewResponses,
  interviews,
  merchantResearchFieldSettings,
  merchants,
  orderLineItems,
  orders,
  outboxEvents,
  productCategories,
  productCategoryAssignments,
  recordings,
  reportRevisions,
  reports,
  researchAssignments,
  researchFields,
  researchFieldSetItems,
  researchFieldSets,
  researchFieldSetVersions,
  researchFieldVersions,
  researchMoments,
  researchMomentVersions,
  scripts,
  scriptVersions,
  transcriptSegments,
  transcripts,
  type HollerDatabase,
} from "@holler/db";
import {
  QUEUE_WINDOW_MS,
  cohortExpressionSchema,
  fieldScope,
  interviewObservationTypeSchema,
  promptScopeSchema,
  readScriptPrompts,
  researchFieldDefinitionV1Schema,
  scriptContentV1Schema,
  type ResearchFieldDefinitionV1,
  type ScriptPrompt,
} from "@holler/domain";
import {
  isEnvelopeCiphertext,
  type CustomerPrivateCipher,
  type CustomerPrivateField,
} from "@holler/providers";
import { shopifyLegacyId } from "@holler/shopify";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import type {
  EditableFieldValueType,
  FieldDefaultInput,
  InterviewOutcome,
  InterviewWorkspace,
  LibraryResearchField,
  LibraryScript,
  MomentRunStatus,
  MomentScript,
  CallReview,
  CallSheetOrder,
  CallSheetProfile,
  CallSheetPrompt,
  CompletedCall,
  CompletedRun,
  OperationsApplicationService,
  PhoneRevealPurpose,
  PromptProgressInput,
  QueueItem,
  ResearchFieldInput,
  SaveMomentInput,
  SaveScriptInput,
  TenantContext,
} from "./operations-types";
import {
  canManageMoments,
  canTransitionMoment,
  momentStatusFromPersisted,
  persistedMomentStatus,
} from "./moment-status";
import type {
  PrototypeResearchField,
  ResearchMomentSummary,
} from "./prototype-data";
import {
  cohortCategoryKeys,
  describeCohort,
  humanizeKey,
} from "./cohort-description";
import {
  buildCohorts,
  buildOrderSeries,
  buildReorderTiming,
  canViewCommerceDashboard,
  dashboardFiltersToCohort,
  rankProducts,
  repeatLeader,
  splitSources,
  type DashboardFilters,
} from "./analytics";

export class OperationsError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(code);
    this.name = "OperationsError";
  }
}

export interface PhoneDecryptInput {
  readonly merchantId: string;
  readonly customerId: string;
  readonly ciphertext: string;
  readonly keyVersion: string;
  /** Defaults to the phone; the call sheet also reads name and city/state. */
  readonly field?: CustomerPrivateField;
}

/** Returns the E.164 phone, or undefined when the value cannot be trusted. */
export interface PhoneDecryptor {
  decrypt(input: PhoneDecryptInput): Promise<string | undefined>;
}

/** Development/test only. Production uses {@link EnvelopePhoneDecryptor}. */
export class PrefixedSyntheticPhoneDecryptor implements PhoneDecryptor {
  async decrypt({
    ciphertext,
    keyVersion,
    field = "phone_e164",
  }: PhoneDecryptInput): Promise<string | undefined> {
    if (field !== "phone_e164")
      return ciphertext.startsWith("synthetic:plain:")
        ? ciphertext.slice("synthetic:plain:".length)
        : undefined;
    if (keyVersion !== "synthetic-v1") return undefined;
    const prefix = "synthetic:v1:";
    if (!ciphertext.startsWith(prefix)) return undefined;
    const phone = ciphertext.slice(prefix.length);
    return /^\+120255501\d{2}$/.test(phone) ? phone : undefined;
  }
}

/** KMS envelope decryption; refuses synthetic fixture values. */
export class EnvelopePhoneDecryptor implements PhoneDecryptor {
  constructor(
    private readonly cipher: CustomerPrivateCipher,
    /** Development only: also accept synthetic fixtures. */
    private readonly synthetic?: PrefixedSyntheticPhoneDecryptor,
  ) {}

  async decrypt(input: PhoneDecryptInput): Promise<string | undefined> {
    if (!isEnvelopeCiphertext(input.ciphertext))
      return this.synthetic?.decrypt(input);
    try {
      return await this.cipher.decrypt(
        { merchantId: input.merchantId, customerId: input.customerId },
        input.field ?? "phone_e164",
        input.ciphertext,
      );
    } catch {
      return undefined;
    }
  }
}

const stableUuid = (value: string): string => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};

const safeJson = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const textValue = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value : fallback;

/** Reports are linked, never embedded: an absolute https URL. */
export function isReportUrl(value: string): boolean {
  if (value.length > 2000) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Managers and the merchant viewer see every finished call, not just their own. */
const seesAllCalls = (context: TenantContext): boolean =>
  canManageMoments(context.roles) || context.viewer === "merchant";

const closedOutcome = (outcome: string | null): InterviewOutcome =>
  outcome === "no_answer" || outcome === "declined" ? outcome : "completed";

/** Seconds from answer to hang-up; null for calls that never connected. */
const callSeconds = (
  answeredAt: Date | null | undefined,
  endedAt: Date | null | undefined,
) =>
  answeredAt && endedAt
    ? Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000))
    : null;

const formatMoney = (minor: number, currency: string): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);

const maskPhone = (
  lastFour: string | null,
  ciphertext: string | null,
): string => {
  // Synthetic fixtures carry their digits in the value itself.
  const digits =
    lastFour ??
    (ciphertext?.startsWith("synthetic:")
      ? ciphertext.match(/(\d{4})$/)?.[1]
      : undefined);
  return digits ? `••• ••• ${digits}` : "Unavailable";
};

type DbTransaction = Parameters<
  Parameters<HollerDatabase["transaction"]>[0]
>[0];
type DbExecutor = HollerDatabase | DbTransaction;

const editableValueTypes: readonly EditableFieldValueType[] = [
  "single_select",
  "long_text",
  "rating_scale",
];

function describeField(
  id: string,
  definition: ResearchFieldDefinitionV1,
): Omit<PrototypeResearchField, "source" | "required"> {
  return {
    id,
    label: definition.label,
    prompt: definition.prompt,
    valueType:
      definition.valueType === "rating_scale"
        ? "rating_scale"
        : definition.valueType === "single_select"
          ? "single_select"
          : "long_text",
    ...(definition.options
      ? { options: definition.options.map((option) => option.label) }
      : {}),
  };
}

function parseFieldInput(input: ResearchFieldInput): ResearchFieldInput {
  const label = input.label.trim();
  const prompt = input.prompt.trim();
  const options = [
    ...new Set(input.options.map((option) => option.trim()).filter(Boolean)),
  ];
  if (
    !label ||
    label.length > 160 ||
    !prompt ||
    prompt.length > 2000 ||
    !editableValueTypes.includes(input.valueType) ||
    (input.valueType === "single_select" &&
      (options.length < 2 ||
        options.length > 20 ||
        options.some((option) => option.length > 80))) ||
    !promptScopeSchema.safeParse(input.scope).success
  )
    throw new OperationsError("INVALID_RESEARCH_FIELD", 400);
  return {
    label,
    prompt,
    valueType: input.valueType,
    options: input.valueType === "single_select" ? options : [],
    scope: input.scope,
  };
}

/** Keeps an option's key when its label survives an edit, so answers align. */
function fieldOptions(
  labels: readonly string[],
  previous: ResearchFieldDefinitionV1["options"],
): { key: string; label: string }[] {
  const used = new Set<string>();
  return labels.map((label, index) => {
    const kept = previous?.find((option) => option.label === label)?.key;
    let key =
      kept ??
      (label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") ||
        `option_${index + 1}`);
    while (used.has(key)) key = `${key}_${index + 1}`;
    used.add(key);
    return { key, label };
  });
}

function parseScriptPrompts(prompts: readonly ScriptPrompt[]): ScriptPrompt[] {
  const parsed = scriptContentV1Schema.safeParse({ prompts });
  if (
    !parsed.success ||
    new Set(parsed.data.prompts.map((prompt) => prompt.id)).size !==
      parsed.data.prompts.length
  )
    throw new OperationsError("INVALID_SCRIPT", 400);
  return parsed.data.prompts;
}

function samePrompts(
  a: readonly ScriptPrompt[],
  b: readonly ScriptPrompt[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (prompt, index) =>
        prompt.id === b[index]?.id &&
        prompt.title === b[index]?.title &&
        prompt.prompt === b[index]?.prompt,
    )
  );
}

export class PostgresOperationsApplicationService implements OperationsApplicationService {
  constructor(
    private readonly db: HollerDatabase,
    private readonly phoneDecryptor: PhoneDecryptor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getDashboard(context: TenantContext, filters: DashboardFilters) {
    await this.requireAdmin(context);
    await this.requireMerchant(context);
    const start = new Date(`${filters.start}T00:00:00.000Z`);
    const end = new Date(`${filters.end}T23:59:59.999Z`);
    const rows = await this.db
      .select({
        id: orders.id,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        sequence: orders.customerOrderSequence,
        financialStatus: orders.financialStatus,
        observed: orders.observedAttribution,
        orderedAt: orders.orderedAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, context.merchantId),
          sql`${orders.orderedAt} >= ${start}`,
          sql`${orders.orderedAt} <= ${end}`,
        ),
      );
    let scoped = rows;
    if (filters.sku) {
      const matching = await this.db
        .select({ id: orderLineItems.orderId })
        .from(orderLineItems)
        .where(
          and(
            eq(orderLineItems.merchantId, context.merchantId),
            eq(orderLineItems.sku, filters.sku),
          ),
        );
      const ids = new Set(matching.map((row) => row.id));
      scoped = scoped.filter((row) => ids.has(row.id));
    }
    scoped = scoped.filter((row) => {
      const source = textValue(
        safeJson(row.observed).source,
        "unknown",
      ).toLowerCase();
      const typeMatches =
        filters.customerType === "all" ||
        (filters.customerType === "new"
          ? row.sequence === 1
          : (row.sequence ?? 0) >= 2);
      return (
        typeMatches &&
        (filters.attribution === "all" || source === filters.attribution)
      );
    });
    const attribution = new Map<string, number>();
    for (const row of scoped) {
      const source = textValue(
        safeJson(row.observed).source,
        "unknown",
      ).toLowerCase();
      attribution.set(source, (attribution.get(source) ?? 0) + 1);
    }
    const repeats = scoped.filter((row) => (row.sequence ?? 0) >= 2).length;
    // Customers acquired in the period, grouped by what their first order
    // contained; a repeat is any later order, even after the period ends.
    const repeatRows = await this.db.execute(sql`
      select coalesce(p.title, oli.title, 'Untitled item') as product,
        min(oli.sku) as sku,
        count(distinct o.customer_id)::int as customers,
        (count(distinct o.customer_id) filter (where c.order_count >= 2))::int as repeat_customers
      from orders o
      join customers c on c.merchant_id = o.merchant_id and c.id = o.customer_id
      join order_line_items oli on oli.merchant_id = o.merchant_id and oli.order_id = o.id
      left join products p on p.merchant_id = oli.merchant_id and p.id = oli.product_id
      where o.merchant_id = ${context.merchantId}
        and o.customer_order_sequence = 1
        and o.ordered_at >= ${start} and o.ordered_at <= ${end}
      group by coalesce(oli.product_id::text, oli.title), coalesce(p.title, oli.title, 'Untitled item')
      order by customers desc
      limit 15
    `);
    const sourceOf = (row: (typeof scoped)[number]) =>
      textValue(safeJson(row.observed).source, "unknown").toLowerCase();
    const repeatByProduct = (
      repeatRows.rows as {
        product: string;
        sku: string | null;
        customers: number;
        repeat_customers: number;
      }[]
    ).map((row) => ({
      product: row.product,
      sku: row.sku,
      customers: row.customers,
      repeatCustomers: row.repeat_customers,
    }));

    const scopedIds = new Set(scoped.map((row) => row.id));
    const lineRows = await this.db.execute(sql`
      select oli.order_id, coalesce(p.title, oli.title, 'Untitled item') as product,
        oli.quantity, (oli.unit_price_minor * oli.quantity - oli.discount_minor)::bigint as line_minor
      from order_line_items oli
      join orders o on o.merchant_id = oli.merchant_id and o.id = oli.order_id
      left join products p on p.merchant_id = oli.merchant_id and p.id = oli.product_id
      where o.merchant_id = ${context.merchantId}
        and o.ordered_at >= ${start} and o.ordered_at <= ${end}
    `);
    const topProducts = rankProducts(
      (
        lineRows.rows as {
          order_id: string;
          product: string;
          quantity: number;
          line_minor: string | number;
        }[]
      )
        .filter((line) => scopedIds.has(line.order_id))
        .map((line) => ({
          product: line.product,
          orderId: line.order_id,
          quantity: line.quantity,
          lineMinor: Number(line.line_minor),
        })),
    );

    // Second orders of customers acquired in the period, at any time since.
    const gapRows = await this.db.execute(sql`
      select extract(epoch from (second_order.ordered_at - first_order.ordered_at)) / 86400 as gap_days,
        array(
          select distinct coalesce(p.title, oli.title, 'Untitled item')
          from order_line_items oli
          left join products p on p.merchant_id = oli.merchant_id and p.id = oli.product_id
          where oli.merchant_id = first_order.merchant_id and oli.order_id = first_order.id
        ) as first_products
      from orders first_order
      join orders second_order on second_order.merchant_id = first_order.merchant_id
        and second_order.customer_id = first_order.customer_id
        and second_order.customer_order_sequence = 2
      where first_order.merchant_id = ${context.merchantId}
        and first_order.customer_order_sequence = 1
        and first_order.ordered_at >= ${start} and first_order.ordered_at <= ${end}
    `);
    const reorderTiming = buildReorderTiming(
      (
        gapRows.rows as {
          gap_days: string | number;
          first_products: string[];
        }[]
      ).map((row) => ({
        gapDays: Number(row.gap_days),
        firstProducts: row.first_products,
      })),
      repeatLeader(repeatByProduct)?.product ?? null,
    );

    const cohortRows = await this.db.execute(sql`
      with firsts as (
        select customer_id, date_trunc('month', ordered_at) as cohort_month
        from orders
        where merchant_id = ${context.merchantId}
          and customer_order_sequence = 1
          and ordered_at >= ${start} and ordered_at <= ${end}
      )
      select to_char(f.cohort_month, 'YYYY-MM') as cohort,
        ((extract(year from date_trunc('month', o.ordered_at)) - extract(year from f.cohort_month)) * 12
          + extract(month from date_trunc('month', o.ordered_at)) - extract(month from f.cohort_month))::int as month_offset,
        count(distinct o.customer_id)::int as customers
      from firsts f
      join orders o on o.merchant_id = ${context.merchantId} and o.customer_id = f.customer_id
      group by 1, 2
    `);
    const cohorts = buildCohorts(
      (
        cohortRows.rows as {
          cohort: string;
          month_offset: number;
          customers: number;
        }[]
      ).map((row) => ({
        cohort: row.cohort,
        offset: row.month_offset,
        customers: row.customers,
      })),
      this.now(),
    );

    return {
      filters,
      series: buildOrderSeries(scoped, filters),
      sources: splitSources(
        scoped.map((row) => ({
          source: sourceOf(row),
          sequence: row.sequence,
        })),
      ),
      topProducts,
      reorderTiming,
      cohorts,
      metrics: {
        orders: scoped.length,
        revenueMinor: scoped.reduce((sum, row) => sum + row.totalMinor, 0),
        currency: scoped[0]?.currency ?? "USD",
        newCustomers: scoped.filter((row) => row.sequence === 1).length,
        repeatCustomers: repeats,
        refundedOrders: scoped.filter(
          (row) => row.financialStatus === "refunded",
        ).length,
        repurchaseRate: scoped.length
          ? Number(((repeats / scoped.length) * 100).toFixed(2))
          : 0,
      },
      attribution: [...attribution]
        .map(([source, orders]) => ({ source, orders }))
        .sort(
          (a, b) => b.orders - a.orders || a.source.localeCompare(b.source),
        ),
      repeatByProduct,
      cohortExpression: dashboardFiltersToCohort(filters),
      limitations: [
        "Discount metrics require normalized discount data and are not shown.",
        "Revenue reflects filtered orders and is not net of partial refunds.",
      ],
    };
  }

  async listMoments(context: TenantContext) {
    // Merchant viewers need this read path so a submitted request remains
    // visible after the form POST and its review/run status is transparent.
    await this.requireMerchant(context, { allowMerchantViewer: true });
    return this.momentSummaries(context, "angle");
  }

  /**
   * The merchant's general calls (orders no angle matched), created on first
   * use and kept on the merchant's default fields; null without any script.
   */
  async getGeneralCalls(
    context: TenantContext,
  ): Promise<ResearchMomentSummary | null> {
    await this.requireMerchant(context);
    await this.ensureGeneralMoment(context);
    return (await this.momentSummaries(context, "general"))[0] ?? null;
  }

  private async momentSummaries(
    context: TenantContext,
    kind: "angle" | "general",
  ): Promise<ResearchMomentSummary[]> {
    const rows = await this.db
      .select({
        id: researchMoments.id,
        name: researchMoments.name,
        momentStatus: researchMoments.status,
        requestedBy: researchMoments.requestedBy,
        reportUrl: researchMoments.reportUrl,
        objective: researchMomentVersions.objective,
        eventType: researchMomentVersions.eventType,
        priority: researchMomentVersions.priority,
        allocationPolicy: researchMomentVersions.allocationPolicy,
        cohortExpression: researchMomentVersions.cohortExpression,
        version: researchMomentVersions.version,
        publishedAt: researchMomentVersions.publishedAt,
        scriptName: scripts.name,
        scriptVersion: scriptVersions.version,
        fieldCount: sql<number>`count(${researchFieldSetItems.fieldVersionId})::int`,
      })
      .from(researchMoments)
      .innerJoin(
        researchMomentVersions,
        and(
          eq(researchMomentVersions.researchMomentId, researchMoments.id),
          eq(researchMomentVersions.merchantId, context.merchantId),
        ),
      )
      .innerJoin(
        scriptVersions,
        eq(scriptVersions.id, researchMomentVersions.scriptVersionId),
      )
      .innerJoin(scripts, eq(scripts.id, scriptVersions.scriptId))
      .leftJoin(
        researchFieldSetItems,
        eq(
          researchFieldSetItems.fieldSetVersionId,
          researchMomentVersions.researchFieldSetVersionId,
        ),
      )
      .where(
        and(
          eq(researchMoments.merchantId, context.merchantId),
          eq(researchMoments.kind, kind),
        ),
      )
      .groupBy(
        researchMoments.id,
        researchMoments.name,
        researchMoments.status,
        researchMomentVersions.id,
        scripts.name,
        scriptVersions.version,
      )
      .orderBy(desc(researchMomentVersions.version));

    const newest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!newest.has(row.id)) newest.set(row.id, row);
    const [labels, completed] = await Promise.all([
      this.categoryLabels(
        context,
        [...newest.values()].flatMap((row) =>
          cohortCategoryKeys(row.cohortExpression),
        ),
      ),
      this.completedInterviewsThisWeek(context),
    ]);
    const labeler = (namespace: string, key: string) =>
      labels.get(`${namespace}:${key}`) ?? humanizeKey(key);
    return [...newest.values()].map((row) => {
      const allocation = safeJson(row.allocationPolicy);
      return {
        id: row.id,
        name: row.name,
        objective: row.objective,
        status: momentStatusFromPersisted(
          row.momentStatus,
          row.publishedAt !== null,
        ),
        trigger: row.eventType.replaceAll("_", " "),
        cohortSummary:
          kind === "general"
            ? "Callable orders that no live angle matched"
            : describeCohort(row.cohortExpression, labeler),
        weeklyTarget:
          typeof allocation.weeklyCap === "number" ? allocation.weeklyCap : 0,
        fieldCount: row.fieldCount,
        scriptVersion: `${row.scriptName} v${row.scriptVersion}`,
        completedThisWeek: completed.get(row.id) ?? 0,
        ...(row.requestedBy ? { requestedByMerchant: true } : {}),
        ...(row.reportUrl ? { reportUrl: row.reportUrl } : {}),
      };
    });
  }

  private async categoryLabels(
    context: TenantContext,
    references: readonly { namespace: string; key: string }[],
  ): Promise<Map<string, string>> {
    if (!references.length) return new Map();
    const rows = await this.db
      .select({
        source: productCategories.source,
        key: productCategories.key,
        label: productCategories.label,
      })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.merchantId, context.merchantId),
          inArray(productCategories.key, [
            ...new Set(references.map((reference) => reference.key)),
          ]),
        ),
      );
    return new Map(rows.map((row) => [`${row.source}:${row.key}`, row.label]));
  }

  /** Completed interviews per moment since the start of the merchant's week. */
  private async completedInterviewsThisWeek(
    context: TenantContext,
  ): Promise<Map<string, number>> {
    const [merchant] = await this.db
      .select({ timezone: merchants.timezone })
      .from(merchants)
      .where(eq(merchants.id, context.merchantId))
      .limit(1);
    const timezone = merchant?.timezone ?? "UTC";
    const now = this.now();
    const rows = await this.db
      .select({
        momentId: researchMomentVersions.researchMomentId,
        completed: sql<number>`count(${interviews.id})::int`,
      })
      .from(interviews)
      .innerJoin(
        researchAssignments,
        and(
          eq(researchAssignments.id, interviews.researchAssignmentId),
          eq(researchAssignments.merchantId, context.merchantId),
        ),
      )
      .innerJoin(
        researchMomentVersions,
        eq(
          researchMomentVersions.id,
          researchAssignments.researchMomentVersionId,
        ),
      )
      .where(
        and(
          eq(interviews.merchantId, context.merchantId),
          eq(interviews.status, "completed"),
          sql`${interviews.endedAt} >= (date_trunc('week', ${now}::timestamptz at time zone ${timezone}) at time zone ${timezone})`,
        ),
      )
      .groupBy(researchMomentVersions.researchMomentId);
    return new Map(rows.map((row) => [row.momentId, row.completed]));
  }

  async listMerchants(context: TenantContext) {
    if (!context.merchantIds.length) return [];
    return this.db
      .select({ id: merchants.id, name: merchants.name })
      .from(merchants)
      .where(
        and(
          inArray(merchants.id, [...context.merchantIds]),
          eq(merchants.status, "active"),
        ),
      )
      .orderBy(asc(merchants.name));
  }

  async setMomentStatus(
    context: TenantContext,
    momentId: string,
    status: MomentRunStatus,
  ) {
    await this.requireMerchant(context);
    if (!canManageMoments(context.roles))
      throw new OperationsError("MOMENT_MANAGER_ROLE_REQUIRED", 403);
    const current = [
      ...(await this.momentSummaries(context, "angle")),
      ...(await this.momentSummaries(context, "general")),
    ].find((moment) => moment.id === momentId);
    if (!current) throw new OperationsError("RESEARCH_MOMENT_NOT_FOUND", 404);
    if (
      current.status === "draft" ||
      !canTransitionMoment(current.status, status)
    )
      throw new OperationsError("INVALID_MOMENT_TRANSITION", 409);
    const from = persistedMomentStatus[current.status];
    const to = persistedMomentStatus[status];
    const now = this.now();
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(researchMoments)
        .set({ status: to, updatedAt: now })
        .where(
          and(
            eq(researchMoments.id, momentId),
            eq(researchMoments.merchantId, context.merchantId),
            eq(researchMoments.status, from),
          ),
        )
        .returning({ id: researchMoments.id });
      // Someone else changed it between our read and write.
      if (!updated.length)
        throw new OperationsError("MOMENT_STATUS_CONFLICT", 409);
      await tx.insert(auditEvents).values({
        id: randomUUID(),
        merchantId: context.merchantId,
        actorId: context.researcherId,
        action: "research_moment.status_changed",
        subjectType: "research_moment",
        subjectId: momentId,
        metadata: {
          from: current.status,
          to: status,
          correlationId: context.correlationId,
        },
        occurredAt: now,
      });
    });
    return { ...current, status };
  }

  async listResearchFields(
    context: TenantContext,
    options: { readonly includeArchived?: boolean } = {},
  ): Promise<readonly LibraryResearchField[]> {
    await this.requireMerchant(context, { allowMerchantViewer: true });
    return this.fieldLibrary(
      this.db,
      context,
      options.includeArchived ?? false,
    );
  }

  async saveResearchField(
    context: TenantContext,
    fieldId: string | undefined,
    input: ResearchFieldInput,
  ) {
    await this.requireManager(context);
    const field = parseFieldInput(input);
    return this.db.transaction(async (tx) => {
      if (!fieldId) {
        const created = await this.createMerchantField(tx, context, field, {
          includedByDefault: true,
          requiredByDefault: false,
        });
        return { fieldId: created.fieldId };
      }
      const [owned] = await tx
        .select({ merchantId: researchFields.merchantId })
        .from(researchFields)
        .where(
          and(
            eq(researchFields.id, fieldId),
            or(
              isNull(researchFields.merchantId),
              eq(researchFields.merchantId, context.merchantId),
            ),
          ),
        )
        .limit(1);
      if (!owned) throw new OperationsError("RESEARCH_FIELD_NOT_FOUND", 404);
      // Platform wording keeps attribution comparable across merchants.
      if (owned.merchantId === null)
        throw new OperationsError("PLATFORM_FIELD_LOCKED", 403);
      const [latest] = await tx
        .select({
          version: researchFieldVersions.version,
          definition: researchFieldVersions.definition,
        })
        .from(researchFieldVersions)
        .where(eq(researchFieldVersions.researchFieldId, fieldId))
        .orderBy(desc(researchFieldVersions.version))
        .limit(1)
        .for("update");
      const previous = researchFieldDefinitionV1Schema.safeParse(
        latest?.definition,
      );
      if (!latest || !previous.success)
        throw new OperationsError("RESEARCH_FIELD_NOT_FOUND", 404);
      const { options: previousOptions, ...unchanged } = previous.data;
      const definition: ResearchFieldDefinitionV1 = {
        ...unchanged,
        label: field.label,
        prompt: field.prompt,
        valueType: field.valueType,
        ...(field.valueType === "single_select"
          ? { options: fieldOptions(field.options, previousOptions) }
          : {}),
        scope: field.scope,
      };
      const wording = (value: ResearchFieldDefinitionV1) =>
        JSON.stringify([
          value.label,
          value.prompt,
          value.valueType,
          value.options ?? [],
          fieldScope(value),
        ]);
      if (wording(definition) === wording(previous.data)) return { fieldId };
      const now = this.now();
      // Pinned field sets keep the version they were built with.
      await tx
        .update(researchFieldVersions)
        .set({ status: "superseded", updatedAt: now })
        .where(
          and(
            eq(researchFieldVersions.researchFieldId, fieldId),
            eq(researchFieldVersions.status, "published"),
          ),
        );
      await tx.insert(researchFieldVersions).values({
        id: randomUUID(),
        researchFieldId: fieldId,
        version: latest.version + 1,
        definition,
        status: "published",
        publishedAt: now,
      });
      await tx
        .update(researchFields)
        .set({ name: field.label, updatedAt: now })
        .where(eq(researchFields.id, fieldId));
      return { fieldId };
    });
  }

  async setResearchFieldArchived(
    context: TenantContext,
    fieldId: string,
    archived: boolean,
  ) {
    await this.requireManager(context);
    const [field] = await this.db
      .select({ merchantId: researchFields.merchantId })
      .from(researchFields)
      .where(
        and(
          eq(researchFields.id, fieldId),
          or(
            isNull(researchFields.merchantId),
            eq(researchFields.merchantId, context.merchantId),
          ),
        ),
      )
      .limit(1);
    if (!field) throw new OperationsError("RESEARCH_FIELD_NOT_FOUND", 404);
    if (field.merchantId === null)
      throw new OperationsError("PLATFORM_FIELD_LOCKED", 403);
    await this.db
      .update(researchFields)
      .set({
        status: archived ? "archived" : "published",
        updatedAt: this.now(),
      })
      .where(eq(researchFields.id, fieldId));
  }

  async saveFieldDefaults(
    context: TenantContext,
    defaults: readonly FieldDefaultInput[],
  ) {
    await this.requireManager(context);
    const ids = defaults.map((item) => item.fieldId);
    if (!ids.length || new Set(ids).size !== ids.length || ids.length > 500)
      throw new OperationsError("INVALID_FIELD_DEFAULTS", 400);
    await this.db.transaction(async (tx) => {
      const visible = new Set(
        (await this.fieldLibrary(tx, context, false)).map(
          (field) => field.fieldId,
        ),
      );
      if (ids.some((id) => !visible.has(id)))
        throw new OperationsError("INVALID_FIELD_DEFAULTS", 400);
      const now = this.now();
      for (const [index, item] of defaults.entries()) {
        const values = {
          includedByDefault: item.includedByDefault,
          requiredByDefault: item.requiredByDefault,
          displayOrder: index,
          updatedAt: now,
        };
        await tx
          .insert(merchantResearchFieldSettings)
          .values({
            merchantId: context.merchantId,
            researchFieldId: item.fieldId,
            ...values,
          })
          .onConflictDoUpdate({
            target: [
              merchantResearchFieldSettings.merchantId,
              merchantResearchFieldSettings.researchFieldId,
            ],
            set: values,
          });
      }
    });
    await this.ensureGeneralMoment(context);
  }

  async listScripts(context: TenantContext): Promise<readonly LibraryScript[]> {
    await this.requireMerchant(context, { allowMerchantViewer: true });
    return this.scriptLibrary(this.db, context);
  }

  async saveScript(context: TenantContext, input: SaveScriptInput) {
    await this.requireManager(context);
    const name = input.name.trim();
    if (!name || name.length > 120)
      throw new OperationsError("INVALID_SCRIPT", 400);
    const prompts = parseScriptPrompts(input.prompts);
    return this.db.transaction(async (tx) => {
      const library = await this.scriptLibrary(tx, context);
      const current = input.scriptId
        ? library.find((script) => script.id === input.scriptId)
        : undefined;
      if (input.scriptId && !current)
        throw new OperationsError("SCRIPT_NOT_FOUND", 404);
      const now = this.now();
      if (current?.editable) {
        if (current.name === name && samePrompts(current.prompts, prompts))
          return { scriptId: current.id };
        await tx
          .update(scriptVersions)
          .set({ status: "superseded", updatedAt: now })
          .where(
            and(
              eq(scriptVersions.scriptId, current.id),
              eq(scriptVersions.status, "published"),
            ),
          );
        await tx
          .update(scripts)
          .set({ name, updatedAt: now })
          .where(eq(scripts.id, current.id));
        await this.insertScriptVersion(tx, context, {
          scriptId: current.id,
          version: current.version + 1,
          prompts,
          basedOnScriptVersionId: null,
        });
        return { scriptId: current.id };
      }
      // New scripts, and edits to platform scripts, become merchant copies.
      const scriptId = randomUUID();
      await tx.insert(scripts).values({
        id: scriptId,
        merchantId: context.merchantId,
        name,
        status: "published",
        kind: "library",
      });
      await this.insertScriptVersion(tx, context, {
        scriptId,
        version: 1,
        prompts,
        basedOnScriptVersionId: current?.versionId ?? null,
      });
      return { scriptId };
    });
  }

  async getMomentScript(
    context: TenantContext,
    momentId: string,
  ): Promise<MomentScript> {
    await this.requireMerchant(context);
    const current = await this.currentMomentVersion(this.db, context, momentId);
    return {
      momentId,
      momentName: current.momentName,
      momentStatus: momentStatusFromPersisted(
        current.momentStatus,
        current.version.publishedAt !== null,
      ),
      scriptName: current.scriptName,
      scriptVersion: current.scriptVersion,
      runSpecific: current.scriptKind === "research_run",
      prompts: readScriptPrompts(current.scriptContent),
    };
  }

  async updateMomentScript(
    context: TenantContext,
    momentId: string,
    input: readonly ScriptPrompt[],
  ): Promise<MomentScript> {
    await this.requireManager(context);
    const prompts = parseScriptPrompts(input);
    await this.db.transaction(async (tx) => {
      // Serializes version bumps for this moment.
      await tx
        .select({ id: researchMoments.id })
        .from(researchMoments)
        .where(
          and(
            eq(researchMoments.id, momentId),
            eq(researchMoments.merchantId, context.merchantId),
          ),
        )
        .for("update");
      const current = await this.currentMomentVersion(tx, context, momentId);
      if (samePrompts(readScriptPrompts(current.scriptContent), prompts))
        return;
      const now = this.now();
      const scriptVersionId = await this.saveRunScript(tx, context, {
        momentId,
        name: `${current.momentName} script`,
        basedOnScriptVersionId:
          current.scriptKind === "research_run"
            ? current.scriptBasedOn
            : current.version.scriptVersionId,
        prompts,
      });
      const { id: previousVersionId, version, ...carried } = current.version;
      const versionId = randomUUID();
      await tx.insert(researchMomentVersions).values({
        ...carried,
        id: versionId,
        version: version + 1,
        scriptVersionId,
        publishedAt: carried.publishedAt ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(auditEvents).values({
        id: randomUUID(),
        merchantId: context.merchantId,
        actorId: context.researcherId,
        action: "research_moment.script_changed",
        subjectType: "research_moment",
        subjectId: momentId,
        metadata: {
          fromMomentVersionId: previousVersionId,
          toMomentVersionId: versionId,
          scriptVersionId,
          correlationId: context.correlationId,
        },
        occurredAt: now,
      });
    });
    return this.getMomentScript(context, momentId);
  }

  async listCompletedRuns(
    context: TenantContext,
  ): Promise<readonly CompletedRun[]> {
    await this.requireMerchant(context, { allowMerchantViewer: true });
    const rows = await this.db
      .select({
        id: researchMoments.id,
        name: researchMoments.name,
        reportUrl: researchMoments.reportUrl,
        updatedAt: researchMoments.updatedAt,
      })
      .from(researchMoments)
      .where(
        and(
          eq(researchMoments.merchantId, context.merchantId),
          eq(researchMoments.kind, "angle"),
          eq(researchMoments.status, "completed"),
        ),
      )
      .orderBy(desc(researchMoments.updatedAt));
    if (!rows.length) return [];
    const momentIds = rows.map((row) => row.id);
    const [versions, counts] = await Promise.all([
      this.db
        .select({
          momentId: researchMomentVersions.researchMomentId,
          objective: researchMomentVersions.objective,
        })
        .from(researchMomentVersions)
        .where(
          and(
            eq(researchMomentVersions.merchantId, context.merchantId),
            inArray(researchMomentVersions.researchMomentId, momentIds),
          ),
        )
        .orderBy(desc(researchMomentVersions.version)),
      this.db
        .select({
          momentId: researchMomentVersions.researchMomentId,
          count: sql<number>`count(*)::int`,
        })
        .from(interviews)
        .innerJoin(
          researchAssignments,
          and(
            eq(researchAssignments.id, interviews.researchAssignmentId),
            eq(researchAssignments.merchantId, interviews.merchantId),
          ),
        )
        .innerJoin(
          researchMomentVersions,
          eq(
            researchMomentVersions.id,
            researchAssignments.researchMomentVersionId,
          ),
        )
        .where(
          and(
            eq(interviews.merchantId, context.merchantId),
            inArray(researchMomentVersions.researchMomentId, momentIds),
            eq(interviews.status, "completed"),
            eq(interviews.outcome, "completed"),
          ),
        )
        .groupBy(researchMomentVersions.researchMomentId),
    ]);
    const objectives = new Map<string, string>();
    for (const version of versions)
      if (!objectives.has(version.momentId))
        objectives.set(version.momentId, version.objective);
    const completed = new Map(counts.map((row) => [row.momentId, row.count]));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      objective: objectives.get(row.id) ?? "",
      completedAt: row.updatedAt.toISOString(),
      completedInterviews: completed.get(row.id) ?? 0,
      reportUrl: row.reportUrl,
    }));
  }

  async setMomentReportUrl(
    context: TenantContext,
    momentId: string,
    reportUrl: string | null,
  ) {
    await this.requireManager(context);
    if (reportUrl !== null && !isReportUrl(reportUrl))
      throw new OperationsError("INVALID_REPORT_URL", 400);
    // updatedAt is left alone: on a completed run it dates the completion.
    const updated = await this.db
      .update(researchMoments)
      .set({ reportUrl })
      .where(
        and(
          eq(researchMoments.id, momentId),
          eq(researchMoments.merchantId, context.merchantId),
          eq(researchMoments.kind, "angle"),
        ),
      )
      .returning({ id: researchMoments.id });
    if (!updated.length)
      throw new OperationsError("RESEARCH_MOMENT_NOT_FOUND", 404);
  }

  private async requireManager(context: TenantContext) {
    await this.requireMerchant(context);
    if (!canManageMoments(context.roles))
      throw new OperationsError("MOMENT_MANAGER_ROLE_REQUIRED", 403);
  }

  /**
   * Newest published version of every field the merchant can use, ordered by
   * the merchant's defaults. Fields without saved defaults (platform fields
   * and fields from before defaults existed) follow, platform first.
   */
  private async fieldLibrary(
    executor: DbExecutor,
    context: TenantContext,
    includeArchived: boolean,
  ): Promise<LibraryResearchField[]> {
    const rows = await executor
      .select({
        id: researchFieldVersions.id,
        fieldId: researchFields.id,
        version: researchFieldVersions.version,
        definition: researchFieldVersions.definition,
        merchantId: researchFields.merchantId,
        fieldStatus: researchFields.status,
        name: researchFields.name,
        includedByDefault: merchantResearchFieldSettings.includedByDefault,
        requiredByDefault: merchantResearchFieldSettings.requiredByDefault,
        displayOrder: merchantResearchFieldSettings.displayOrder,
      })
      .from(researchFieldVersions)
      .innerJoin(
        researchFields,
        eq(researchFields.id, researchFieldVersions.researchFieldId),
      )
      .leftJoin(
        merchantResearchFieldSettings,
        and(
          eq(merchantResearchFieldSettings.researchFieldId, researchFields.id),
          eq(merchantResearchFieldSettings.merchantId, context.merchantId),
        ),
      )
      .where(
        and(
          eq(researchFieldVersions.status, "published"),
          or(
            isNull(researchFields.merchantId),
            eq(researchFields.merchantId, context.merchantId),
          ),
          includeArchived ? undefined : ne(researchFields.status, "archived"),
        ),
      )
      .orderBy(asc(researchFields.name), desc(researchFieldVersions.version));
    const seen = new Set<string>();
    const fields = rows.flatMap((row) => {
      if (seen.has(row.fieldId)) return [];
      const parsed = researchFieldDefinitionV1Schema.safeParse(row.definition);
      if (!parsed.success) return [];
      seen.add(row.fieldId);
      const platform = row.merchantId === null;
      return [
        {
          ...describeField(row.id, parsed.data),
          fieldId: row.fieldId,
          version: row.version,
          source: platform
            ? ("platform_default" as const)
            : ("merchant_default" as const),
          required: row.requiredByDefault ?? parsed.data.required,
          editable: !platform,
          archived: row.fieldStatus === "archived",
          includedByDefault: row.includedByDefault ?? true,
          displayOrder: row.displayOrder ?? Number.MAX_SAFE_INTEGER,
          scope: fieldScope(parsed.data),
        },
      ];
    });
    return fields.sort(
      (a, b) =>
        a.displayOrder - b.displayOrder ||
        Number(b.source === "platform_default") -
          Number(a.source === "platform_default"),
    );
  }

  /** Keeps saved order stable when a new field is appended to the library. */
  private async createMerchantField(
    tx: DbTransaction,
    context: TenantContext,
    field: ReturnType<typeof parseFieldInput>,
    defaults: { includedByDefault: boolean; requiredByDefault: boolean },
  ) {
    const library = await this.fieldLibrary(tx, context, true);
    const now = this.now();
    for (const [index, existing] of library.entries()) {
      if (existing.displayOrder !== Number.MAX_SAFE_INTEGER) continue;
      await tx
        .insert(merchantResearchFieldSettings)
        .values({
          merchantId: context.merchantId,
          researchFieldId: existing.fieldId,
          includedByDefault: existing.includedByDefault,
          requiredByDefault: existing.required,
          displayOrder: index,
        })
        .onConflictDoNothing();
    }
    const fieldId = randomUUID();
    const versionId = randomUUID();
    const key = `custom_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    await tx.insert(researchFields).values({
      id: fieldId,
      merchantId: context.merchantId,
      key,
      name: field.label,
      status: "published",
    });
    const definition: ResearchFieldDefinitionV1 = {
      schemaVersion: 1,
      key,
      label: field.label,
      prompt: field.prompt,
      valueType: field.valueType,
      ...(field.valueType === "single_select"
        ? { options: fieldOptions(field.options, undefined) }
        : {}),
      required: defaults.requiredByDefault,
      evidenceExpected: false,
      attributionSemantic: null,
      completionMode: "live",
      scope: field.scope,
    };
    await tx.insert(researchFieldVersions).values({
      id: versionId,
      researchFieldId: fieldId,
      version: 1,
      definition,
      status: "published",
      publishedAt: now,
    });
    await tx.insert(merchantResearchFieldSettings).values({
      merchantId: context.merchantId,
      researchFieldId: fieldId,
      ...defaults,
      displayOrder: library.length,
    });
    return { fieldId, versionId };
  }

  private async scriptLibrary(
    executor: DbExecutor,
    context: TenantContext,
  ): Promise<LibraryScript[]> {
    const rows = await executor
      .select({
        id: scripts.id,
        name: scripts.name,
        merchantId: scripts.merchantId,
        versionId: scriptVersions.id,
        version: scriptVersions.version,
        content: scriptVersions.content,
      })
      .from(scriptVersions)
      .innerJoin(scripts, eq(scripts.id, scriptVersions.scriptId))
      .where(
        and(
          eq(scripts.kind, "library"),
          ne(scripts.status, "archived"),
          eq(scriptVersions.status, "published"),
          or(
            isNull(scripts.merchantId),
            eq(scripts.merchantId, context.merchantId),
          ),
          or(
            isNull(scriptVersions.merchantId),
            eq(scriptVersions.merchantId, context.merchantId),
          ),
        ),
      )
      .orderBy(asc(scripts.name), desc(scriptVersions.version));
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (seen.has(row.id)) return [];
      seen.add(row.id);
      return [
        {
          id: row.id,
          name: row.name,
          versionId: row.versionId,
          version: row.version,
          prompts: readScriptPrompts(row.content),
          editable: row.merchantId !== null,
        },
      ];
    });
  }

  private async insertScriptVersion(
    tx: DbTransaction,
    context: TenantContext,
    input: {
      scriptId: string;
      version: number;
      prompts: readonly ScriptPrompt[];
      basedOnScriptVersionId: string | null;
      id?: string;
    },
  ): Promise<string> {
    const id = input.id ?? randomUUID();
    const content = { prompts: input.prompts };
    await tx
      .insert(scriptVersions)
      .values({
        id,
        scriptId: input.scriptId,
        merchantId: context.merchantId,
        version: input.version,
        status: "published",
        content,
        checksum: createHash("sha256")
          .update(JSON.stringify(content))
          .digest("hex"),
        basedOnScriptVersionId: input.basedOnScriptVersionId,
        publishedAt: this.now(),
      })
      .onConflictDoNothing();
    return id;
  }

  /** Appends a version to the moment's own script, creating it if needed. */
  private async saveRunScript(
    tx: DbTransaction,
    context: TenantContext,
    input: {
      momentId: string;
      name: string;
      basedOnScriptVersionId: string | null;
      prompts: readonly ScriptPrompt[];
      stableKey?: string;
    },
  ): Promise<string> {
    const [existing] = await tx
      .select({
        id: scripts.id,
        version: sql<number>`coalesce(max(${scriptVersions.version}), 0)::int`,
      })
      .from(scripts)
      .leftJoin(scriptVersions, eq(scriptVersions.scriptId, scripts.id))
      .where(
        and(
          eq(scripts.researchMomentId, input.momentId),
          eq(scripts.merchantId, context.merchantId),
          eq(scripts.kind, "research_run"),
        ),
      )
      .groupBy(scripts.id)
      .limit(1);
    const scriptId =
      existing?.id ??
      (input.stableKey
        ? stableUuid(`run-script:${input.stableKey}`)
        : randomUUID());
    if (!existing)
      await tx
        .insert(scripts)
        .values({
          id: scriptId,
          merchantId: context.merchantId,
          name: input.name,
          status: "published",
          kind: "research_run",
          researchMomentId: input.momentId,
        })
        .onConflictDoNothing();
    return this.insertScriptVersion(tx, context, {
      scriptId,
      version: (existing?.version ?? 0) + 1,
      prompts: input.prompts,
      basedOnScriptVersionId: input.basedOnScriptVersionId,
      ...(input.stableKey
        ? { id: stableUuid(`run-script-version:${input.stableKey}`) }
        : {}),
    });
  }

  /**
   * Creates the merchant's general moment, or gives it a new version when the
   * merchant's default fields changed. Its script starts as the first library
   * script and is edited like any angle's. Returns null without a script.
   */
  private async ensureGeneralMoment(
    context: TenantContext,
  ): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`general-moment:${context.merchantId}`}))`,
      );
      const defaults = (await this.fieldLibrary(tx, context, false))
        .filter((field) => field.includedByDefault)
        .map((field) => ({
          fieldVersionId: field.id,
          required: field.required,
          source:
            field.source === "platform_default"
              ? "platform_default"
              : "merchant_default",
        }));
      const [existing] = await tx
        .select({ id: researchMoments.id })
        .from(researchMoments)
        .where(
          and(
            eq(researchMoments.merchantId, context.merchantId),
            eq(researchMoments.kind, "general"),
          ),
        );
      const fieldSetId = stableUuid(`general-field-set:${context.merchantId}`);
      const now = this.now();
      const insertFieldSetVersion = async (version: number) => {
        const id = randomUUID();
        await tx.insert(researchFieldSetVersions).values({
          id,
          researchFieldSetId: fieldSetId,
          version,
          status: "published",
          publishedAt: now,
        });
        if (defaults.length)
          await tx.insert(researchFieldSetItems).values(
            defaults.map((item, index) => ({
              fieldSetVersionId: id,
              ...item,
              displayOrder: index,
            })),
          );
        return id;
      };

      if (!existing) {
        const [script] = await this.scriptLibrary(tx, context);
        if (!script) return null;
        const momentId = stableUuid(`general-moment:${context.merchantId}`);
        await tx.insert(researchMoments).values({
          id: momentId,
          merchantId: context.merchantId,
          name: "General calls",
          status: "active",
          kind: "general",
        });
        await tx.insert(researchFieldSets).values({
          id: fieldSetId,
          merchantId: context.merchantId,
          name: "General calls fields",
        });
        await tx.insert(researchMomentVersions).values({
          id: randomUUID(),
          researchMomentId: momentId,
          merchantId: context.merchantId,
          version: 1,
          eventType: "order_completed",
          objective:
            "Learn from customers whose orders matched no research angle.",
          // Never evaluated: the worker falls back to it when no angle queues.
          cohortExpression: { all: [] },
          priority: 0,
          allocationPolicy: {},
          scriptVersionId: script.versionId,
          researchFieldSetVersionId: await insertFieldSetVersion(1),
          activeFrom: now,
          publishedAt: now,
        });
        return momentId;
      }

      const current = await this.currentMomentVersion(tx, context, existing.id);
      const pinned = await tx
        .select({
          fieldVersionId: researchFieldSetItems.fieldVersionId,
          required: researchFieldSetItems.required,
        })
        .from(researchFieldSetItems)
        .where(
          eq(
            researchFieldSetItems.fieldSetVersionId,
            current.version.researchFieldSetVersionId,
          ),
        )
        .orderBy(asc(researchFieldSetItems.displayOrder));
      const unchanged =
        pinned.length === defaults.length &&
        pinned.every(
          (item, index) =>
            item.fieldVersionId === defaults[index]!.fieldVersionId &&
            item.required === defaults[index]!.required,
        );
      if (unchanged) return existing.id;
      const [latest] = await tx
        .select({
          version: sql<number>`coalesce(max(${researchFieldSetVersions.version}), 0)::int`,
        })
        .from(researchFieldSetVersions)
        .where(eq(researchFieldSetVersions.researchFieldSetId, fieldSetId));
      const { id: _previous, version, ...carried } = current.version;
      await tx.insert(researchMomentVersions).values({
        ...carried,
        id: randomUUID(),
        version: version + 1,
        researchFieldSetVersionId: await insertFieldSetVersion(
          (latest?.version ?? 0) + 1,
        ),
        createdAt: now,
        updatedAt: now,
      });
      return existing.id;
    });
  }

  private async currentMomentVersion(
    executor: DbExecutor,
    context: TenantContext,
    momentId: string,
  ) {
    const [row] = await executor
      .select({
        version: researchMomentVersions,
        momentName: researchMoments.name,
        momentKind: researchMoments.kind,
        momentStatus: researchMoments.status,
        scriptName: scripts.name,
        scriptKind: scripts.kind,
        scriptVersion: scriptVersions.version,
        scriptContent: scriptVersions.content,
        scriptBasedOn: scriptVersions.basedOnScriptVersionId,
      })
      .from(researchMomentVersions)
      .innerJoin(
        researchMoments,
        eq(researchMoments.id, researchMomentVersions.researchMomentId),
      )
      .innerJoin(
        scriptVersions,
        eq(scriptVersions.id, researchMomentVersions.scriptVersionId),
      )
      .innerJoin(scripts, eq(scripts.id, scriptVersions.scriptId))
      .where(
        and(
          eq(researchMomentVersions.researchMomentId, momentId),
          eq(researchMomentVersions.merchantId, context.merchantId),
          eq(researchMoments.merchantId, context.merchantId),
        ),
      )
      .orderBy(desc(researchMomentVersions.version))
      .limit(1);
    if (!row) throw new OperationsError("RESEARCH_MOMENT_NOT_FOUND", 404);
    return row;
  }

  async saveMoment(context: TenantContext, input: SaveMomentInput) {
    await this.requireMerchant(context, { allowMerchantViewer: true });
    // A merchant's angle is a request: saved as a draft for staff to launch.
    const requestedBy = context.viewer === "merchant" ? "shopify_admin" : null;
    if (requestedBy) input = { ...input, publish: false };
    const cohort = cohortExpressionSchema.safeParse(input.cohortExpression);
    if (
      !cohort.success ||
      !input.name ||
      !input.objective ||
      !Number.isInteger(input.weeklyTarget) ||
      input.weeklyTarget < 1 ||
      input.weeklyTarget > 10_000
    )
      throw new OperationsError("INVALID_RESEARCH_MOMENT", 400);
    if (!input.fields.length)
      throw new OperationsError("FIELD_SET_REQUIRED", 400);
    const newFields = input.fields.flatMap((field) =>
      field.kind === "new" ? [field] : [],
    );
    if (
      input.fields.length > 60 ||
      newFields.length > 20 ||
      newFields.some(
        (field) =>
          !field.label.trim() ||
          field.label.trim().length > 160 ||
          field.prompt.length > 2000,
      )
    )
      throw new OperationsError("INVALID_FIELD_SET", 400);
    const runPrompts = input.script
      ? parseScriptPrompts(input.script.prompts)
      : undefined;
    return this.db.transaction(async (tx) => {
      const library = await this.scriptLibrary(tx, context);
      const [base] = input.script
        ? await tx
            .select({
              id: scriptVersions.id,
              content: scriptVersions.content,
            })
            .from(scriptVersions)
            .innerJoin(scripts, eq(scripts.id, scriptVersions.scriptId))
            .where(
              and(
                eq(scriptVersions.id, input.script.baseScriptVersionId),
                eq(scripts.kind, "library"),
                ne(scriptVersions.status, "draft"),
                or(
                  isNull(scripts.merchantId),
                  eq(scripts.merchantId, context.merchantId),
                ),
              ),
            )
            .limit(1)
        : library.length
          ? [{ id: library[0]!.versionId, content: null }]
          : [];
      if (!base) throw new OperationsError("PINNED_SCRIPT_UNAVAILABLE", 400);

      const fieldLibrary = await this.fieldLibrary(tx, context, true);
      const byVersion = new Map(fieldLibrary.map((field) => [field.id, field]));
      const identity = createHash("sha256")
        .update(
          JSON.stringify({
            merchantId: context.merchantId,
            input,
            cohort: cohort.data,
          }),
        )
        .digest("hex");
      const momentId = stableUuid(`moment:${identity}`);
      const fieldSetId = stableUuid(`field-set:${identity}`);
      const fieldSetVersionId = stableUuid(`field-set-version:${identity}`);
      const momentVersionId = stableUuid(`moment-version:${identity}`);
      await tx
        .insert(researchMoments)
        .values({
          id: momentId,
          merchantId: context.merchantId,
          name: input.name,
          status: input.publish ? "active" : "draft",
          requestedBy,
        })
        .onConflictDoNothing();

      const items: {
        fieldVersionId: string;
        required: boolean;
        source: string;
      }[] = [];
      for (const selection of input.fields) {
        let field: LibraryResearchField | undefined;
        if (selection.kind === "library") {
          field = byVersion.get(selection.fieldVersionId);
          if (!field || field.archived)
            throw new OperationsError("INVALID_FIELD_SET", 400);
        } else {
          // Fields persist in the library; reuse one with the same label so a
          // repeated question keeps one history instead of forking.
          const label = selection.label.trim();
          field = fieldLibrary.find(
            (candidate) =>
              candidate.editable &&
              !candidate.archived &&
              candidate.label.toLowerCase() === label.toLowerCase(),
          );
          if (!field) {
            const created = await this.createMerchantField(
              tx,
              context,
              {
                label,
                prompt: selection.prompt.trim() || label,
                valueType: "long_text",
                options: [],
                scope: selection.scope ?? "order",
              },
              { includedByDefault: false, requiredByDefault: false },
            );
            items.push({
              fieldVersionId: created.versionId,
              required: selection.required,
              source: "research_run",
            });
            continue;
          }
        }
        if (items.some((item) => item.fieldVersionId === field.id))
          throw new OperationsError("INVALID_FIELD_SET", 400);
        items.push({
          fieldVersionId: field.id,
          required: selection.required,
          source:
            field.source === "platform_default"
              ? "platform_default"
              : field.includedByDefault
                ? "merchant_default"
                : "research_run",
        });
      }

      // An unchanged script pins the library version; edits get a run copy.
      const scriptVersionId =
        runPrompts && !samePrompts(readScriptPrompts(base.content), runPrompts)
          ? await this.saveRunScript(tx, context, {
              momentId,
              name: `${input.name} script`,
              basedOnScriptVersionId: base.id,
              prompts: runPrompts,
              stableKey: identity,
            })
          : base.id;

      await tx
        .insert(researchFieldSets)
        .values({
          id: fieldSetId,
          merchantId: context.merchantId,
          name: `${input.name} fields`,
        })
        .onConflictDoNothing();
      await tx
        .insert(researchFieldSetVersions)
        .values({
          id: fieldSetVersionId,
          researchFieldSetId: fieldSetId,
          version: 1,
          status: input.publish ? "published" : "draft",
          publishedAt: input.publish ? this.now() : null,
        })
        .onConflictDoNothing();
      await tx
        .insert(researchFieldSetItems)
        .values(
          items.map((item, index) => ({
            fieldSetVersionId,
            fieldVersionId: item.fieldVersionId,
            source: item.source,
            required: item.required,
            displayOrder: index,
          })),
        )
        .onConflictDoNothing();
      await tx
        .insert(researchMomentVersions)
        .values({
          id: momentVersionId,
          researchMomentId: momentId,
          merchantId: context.merchantId,
          version: 1,
          eventType: "order_completed",
          objective: input.objective,
          cohortExpression: cohort.data,
          priority: 50,
          allocationPolicy: { weeklyCap: input.weeklyTarget },
          scriptVersionId,
          researchFieldSetVersionId: fieldSetVersionId,
          activeFrom: input.publish ? this.now() : null,
          publishedAt: input.publish ? this.now() : null,
        })
        .onConflictDoNothing();
      return { id: momentId };
    });
  }

  async listQueue(context: TenantContext): Promise<readonly QueueItem[]> {
    await this.requireMerchant(context);
    await this.ensureGeneralMoment(context);
    const now = this.now();
    await this.expireAssignments(context.merchantId, now);
    const rows = await this.db
      .select({
        id: researchAssignments.id,
        status: researchAssignments.status,
        priority: researchAssignments.priority,
        claimedBy: researchAssignments.assignedResearcherId,
        lockVersion: researchAssignments.lockVersion,
        createdAt: researchAssignments.createdAt,
        customerId: researchAssignments.customerId,
        encryptedGivenName: customerPrivate.encryptedGivenName,
        encryptedPhone: customerPrivate.encryptedPhoneE164,
        phoneLastFour: customerPrivate.phoneLastFour,
        merchantName: merchants.name,
        momentId: researchMoments.id,
        momentName: researchMoments.name,
        momentKind: researchMoments.kind,
        momentStatus: researchMoments.status,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        orderedAt: orders.orderedAt,
        orderSequence: orders.customerOrderSequence,
        orderNumber: orders.sourceOrderNumber,
        shopifyCustomerId: customers.shopifyCustomerId,
        observed: orders.observedAttribution,
        interviewId: interviews.id,
        encryptedLocality: customerPrivate.encryptedLocality,
        keyVersion: customerPrivate.keyVersion,
        privateDeletedAt: customerPrivate.deletedAt,
        privateExpiresAt: customerPrivate.expiresAt,
        contactabilityStatus: customers.contactabilityStatus,
        customerDeletedAt: customers.deletedAt,
      })
      .from(researchAssignments)
      .innerJoin(merchants, eq(merchants.id, researchAssignments.merchantId))
      .leftJoin(
        interviews,
        and(
          eq(interviews.researchAssignmentId, researchAssignments.id),
          eq(interviews.merchantId, context.merchantId),
          eq(interviews.researcherId, context.researcherId),
        ),
      )
      .innerJoin(
        researchMomentVersions,
        eq(
          researchMomentVersions.id,
          researchAssignments.researchMomentVersionId,
        ),
      )
      .innerJoin(
        researchMoments,
        eq(researchMoments.id, researchMomentVersions.researchMomentId),
      )
      .innerJoin(
        orders,
        and(
          eq(orders.id, researchAssignments.orderId),
          eq(orders.merchantId, context.merchantId),
        ),
      )
      .leftJoin(
        customers,
        and(
          eq(customers.id, researchAssignments.customerId),
          eq(customers.merchantId, context.merchantId),
        ),
      )
      .leftJoin(
        customerPrivate,
        and(
          eq(customerPrivate.customerId, researchAssignments.customerId),
          eq(customerPrivate.merchantId, context.merchantId),
        ),
      )
      .where(
        and(
          eq(researchAssignments.merchantId, context.merchantId),
          or(
            eq(researchAssignments.status, "queued"),
            eq(researchAssignments.status, "claimed"),
            eq(researchAssignments.status, "interview_started"),
          ),
        ),
      )
      .orderBy(
        desc(researchAssignments.priority),
        asc(researchAssignments.createdAt),
      )
      .then((all) =>
        // Completed moments stop feeding the queue; work already claimed stays.
        all.filter(
          (row) => row.status !== "queued" || row.momentStatus !== "completed",
        ),
      );
    const assignmentOrders = rows.length
      ? await this.db
          .select({
            assignmentId: researchAssignments.id,
            orderId: researchAssignments.orderId,
            title: orderLineItems.title,
            sku: orderLineItems.sku,
            quantity: orderLineItems.quantity,
          })
          .from(researchAssignments)
          .innerJoin(
            orderLineItems,
            and(
              eq(orderLineItems.orderId, researchAssignments.orderId),
              eq(orderLineItems.merchantId, context.merchantId),
            ),
          )
          .where(
            and(
              eq(researchAssignments.merchantId, context.merchantId),
              inArray(
                researchAssignments.id,
                rows.map((row) => row.id),
              ),
            ),
          )
      : [];
    const contacts = await this.queueContacts(context, rows, now);
    return rows.map((row) =>
      this.queueDto(
        {
          ...row,
          givenName: contacts.get(row.id)?.givenName ?? null,
          locality: contacts.get(row.id)?.locality ?? null,
        },
        assignmentOrders.filter((item) => item.assignmentId === row.id),
        now,
      ),
    );
  }

  /**
   * First names and "City, ST" for the queue rows; the city tells the
   * researcher the customer's local time. Decrypted under the same customer
   * conditions as the call sheet, and audited once per queue load (the values
   * themselves are never logged).
   */
  private async queueContacts(
    context: TenantContext,
    rows: readonly {
      id: string;
      customerId: string | null;
      encryptedGivenName: string | null;
      encryptedLocality: string | null;
      keyVersion: string | null;
      privateDeletedAt: Date | null;
      privateExpiresAt: Date | null;
      contactabilityStatus: string | null;
      customerDeletedAt: Date | null;
    }[],
    now: Date,
  ): Promise<
    Map<string, { givenName: string | null; locality: string | null }>
  > {
    const contacts = new Map<
      string,
      { givenName: string | null; locality: string | null }
    >();
    let names = 0;
    let localities = 0;
    await Promise.all(
      rows.map(async (row) => {
        if (
          !row.customerId ||
          !row.keyVersion ||
          row.contactabilityStatus === "suppressed" ||
          row.customerDeletedAt ||
          row.privateDeletedAt ||
          (row.privateExpiresAt && row.privateExpiresAt <= now)
        )
          return;
        const decrypt = async (
          field: "given_name" | "locality",
          ciphertext: string | null,
        ) =>
          ciphertext
            ? ((await this.phoneDecryptor.decrypt({
                merchantId: context.merchantId,
                customerId: row.customerId!,
                ciphertext,
                keyVersion: row.keyVersion!,
                field,
              })) ?? null)
            : null;
        const [givenName, locality] = await Promise.all([
          decrypt("given_name", row.encryptedGivenName),
          decrypt("locality", row.encryptedLocality),
        ]);
        if (givenName) names += 1;
        if (locality) localities += 1;
        if (givenName || locality)
          contacts.set(row.id, { givenName, locality });
      }),
    );
    if (contacts.size)
      await this.db.insert(auditEvents).values({
        id: randomUUID(),
        merchantId: context.merchantId,
        actorId: context.researcherId,
        action: "customer_private.queue_names_viewed",
        subjectType: "merchant",
        subjectId: context.merchantId,
        metadata: {
          count: names,
          localityCount: localities,
          purpose: "research_queue",
          correlationId: context.correlationId,
        },
        occurredAt: now,
      });
    return contacts;
  }

  async claimAssignment(
    context: TenantContext,
    assignmentId: string,
    expectedLockVersion: number,
  ) {
    await this.requireMerchant(context);
    const now = this.now();
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(researchAssignments)
        .set({
          status: "claimed",
          assignedResearcherId: context.researcherId,
          claimedAt: now,
          lockVersion: expectedLockVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(researchAssignments.id, assignmentId),
            eq(researchAssignments.merchantId, context.merchantId),
            eq(researchAssignments.status, "queued"),
            eq(researchAssignments.lockVersion, expectedLockVersion),
            sql`${researchAssignments.expiresAt} > ${now}`,
            // A card left on screen past the queue window cannot be claimed.
            sql`${researchAssignments.orderId} in (
              select ${orders.id} from ${orders}
              where ${orders.merchantId} = ${context.merchantId}
                and ${orders.orderedAt} > ${new Date(now.getTime() - QUEUE_WINDOW_MS)}
            )`,
          ),
        )
        .returning();
      if (row)
        await this.transition(
          tx,
          context,
          row.id,
          "queued",
          "claimed",
          row.lockVersion,
          now,
        );
      return row;
    });
    if (!result) throw new OperationsError("ASSIGNMENT_CONFLICT", 409);
    return this.getQueueItem(context, assignmentId);
  }

  async releaseAssignment(
    context: TenantContext,
    assignmentId: string,
    expectedLockVersion: number,
  ) {
    await this.requireMerchant(context);
    const now = this.now();
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(researchAssignments)
        .set({
          status: "queued",
          assignedResearcherId: null,
          claimedAt: null,
          lockVersion: expectedLockVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(researchAssignments.id, assignmentId),
            eq(researchAssignments.merchantId, context.merchantId),
            eq(researchAssignments.status, "claimed"),
            eq(researchAssignments.assignedResearcherId, context.researcherId),
            eq(researchAssignments.lockVersion, expectedLockVersion),
            sql`${researchAssignments.expiresAt} > ${now}`,
          ),
        )
        .returning();
      if (row)
        await this.transition(
          tx,
          context,
          row.id,
          "claimed",
          "queued",
          row.lockVersion,
          now,
        );
      return row;
    });
    if (!result) throw new OperationsError("ASSIGNMENT_CONFLICT", 409);
    return this.getQueueItem(context, assignmentId);
  }

  async startInterview(
    context: TenantContext,
    assignmentId: string,
    expectedLockVersion: number,
  ): Promise<InterviewWorkspace> {
    await this.requireMerchant(context);
    const existing = await this.findInterview(context, assignmentId);
    if (existing) return this.getInterview(context, existing.id);
    const now = this.now();
    const interviewId = stableUuid(
      `interview:${context.merchantId}:${assignmentId}`,
    );
    const started = await this.db.transaction(async (tx) => {
      const [assignment] = await tx
        .update(researchAssignments)
        .set({
          status: "interview_started",
          interviewStartedAt: now,
          lockVersion: expectedLockVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(researchAssignments.id, assignmentId),
            eq(researchAssignments.merchantId, context.merchantId),
            eq(researchAssignments.status, "claimed"),
            eq(researchAssignments.assignedResearcherId, context.researcherId),
            eq(researchAssignments.lockVersion, expectedLockVersion),
            sql`${researchAssignments.expiresAt} > ${now}`,
          ),
        )
        .returning();
      if (!assignment) return undefined;
      await this.transition(
        tx,
        context,
        assignment.id,
        "claimed",
        "interview_started",
        assignment.lockVersion,
        now,
        { interviewId },
      );
      await tx
        .insert(interviews)
        .values({
          id: interviewId,
          merchantId: context.merchantId,
          researchAssignmentId: assignmentId,
          researcherId: context.researcherId,
          scriptVersionId: assignment.scriptVersionId,
          researchFieldSetVersionId: assignment.researchFieldSetVersionId,
          status: "in_progress",
          startedAt: now,
        })
        .onConflictDoNothing();
      await tx
        .insert(calls)
        .values({
          id: stableUuid(`manual-call:${interviewId}`),
          merchantId: context.merchantId,
          interviewId,
          provider: "synthetic_manual",
          providerCallRef: `manual-${interviewId}`,
          status: "manual_dial_ready",
          startedAt: now,
        })
        .onConflictDoNothing();
      return assignment;
    });
    if (!started) {
      const retry = await this.findInterview(context, assignmentId);
      if (retry) return this.getInterview(context, retry.id);
      throw new OperationsError("ASSIGNMENT_CONFLICT", 409);
    }
    return this.getInterview(context, interviewId);
  }

  async revealPhone(
    context: TenantContext,
    assignmentId: string,
    purpose: PhoneRevealPurpose = "manual_dial",
  ) {
    await this.requireMerchant(context);
    const now = this.now();
    const [row] = await this.db
      .select({
        customerId: researchAssignments.customerId,
        status: researchAssignments.status,
        researcherId: researchAssignments.assignedResearcherId,
        expiresAt: researchAssignments.expiresAt,
        contactabilityStatus: customers.contactabilityStatus,
        customerDeletedAt: customers.deletedAt,
        ciphertext: customerPrivate.encryptedPhoneE164,
        keyVersion: customerPrivate.keyVersion,
        privateDeletedAt: customerPrivate.deletedAt,
        privateExpiresAt: customerPrivate.expiresAt,
      })
      .from(researchAssignments)
      .leftJoin(
        customers,
        and(
          eq(customers.id, researchAssignments.customerId),
          eq(customers.merchantId, context.merchantId),
        ),
      )
      .leftJoin(
        customerPrivate,
        and(
          eq(customerPrivate.customerId, researchAssignments.customerId),
          eq(customerPrivate.merchantId, context.merchantId),
        ),
      )
      .where(
        and(
          eq(researchAssignments.id, assignmentId),
          eq(researchAssignments.merchantId, context.merchantId),
        ),
      )
      .limit(1);
    const allowed =
      row &&
      (row.status === "claimed" || row.status === "interview_started") &&
      row.researcherId === context.researcherId &&
      row.expiresAt > now &&
      row.contactabilityStatus !== "suppressed" &&
      !row.customerDeletedAt &&
      !row.privateDeletedAt &&
      (!row.privateExpiresAt || row.privateExpiresAt > now) &&
      row.customerId &&
      row.ciphertext;
    const phone = allowed
      ? await this.phoneDecryptor.decrypt({
          merchantId: context.merchantId,
          customerId: row.customerId!,
          ciphertext: row.ciphertext!,
          keyVersion: row.keyVersion!,
        })
      : undefined;
    await this.db.insert(auditEvents).values({
      id: randomUUID(),
      merchantId: context.merchantId,
      actorId: context.researcherId,
      action: phone
        ? "customer_private.phone_revealed"
        : "customer_private.phone_reveal_denied",
      subjectType: "research_assignment",
      subjectId: assignmentId,
      metadata: {
        result: phone ? "allowed" : "denied",
        purpose,
        correlationId: context.correlationId,
      },
      occurredAt: now,
    });
    if (!phone) throw new OperationsError("PHONE_REVEAL_DENIED", 403);
    return { phone };
  }

  async getInterview(context: TenantContext, interviewId: string) {
    return this.workspace(
      context,
      await this.requireOwnedInterview(context, interviewId),
    );
  }

  async listCompletedCalls(
    context: TenantContext,
  ): Promise<readonly CompletedCall[]> {
    await this.requireMerchant(context, { allowMerchantViewer: true });
    const rows = await this.db
      .select({
        interviewId: interviews.id,
        outcome: interviews.outcome,
        endedAt: interviews.endedAt,
        researcherId: interviews.researcherId,
        momentName: researchMoments.name,
        momentKind: researchMoments.kind,
        orderNumber: orders.sourceOrderNumber,
        answeredAt: calls.answeredAt,
        callEndedAt: calls.endedAt,
        recordingStatus: recordings.status,
        transcriptLines: sql<number>`(select count(*)::int from ${transcriptSegments} where ${transcriptSegments.interviewId} = ${interviews.id} and ${transcriptSegments.merchantId} = ${interviews.merchantId})`,
        promptsCovered: sql<number>`(select count(*)::int from ${interviewPromptProgress} where ${interviewPromptProgress.interviewId} = ${interviews.id} and ${interviewPromptProgress.merchantId} = ${interviews.merchantId} and ${interviewPromptProgress.coveredAt} is not null)`,
      })
      .from(interviews)
      .innerJoin(
        researchAssignments,
        and(
          eq(researchAssignments.id, interviews.researchAssignmentId),
          eq(researchAssignments.merchantId, interviews.merchantId),
        ),
      )
      .innerJoin(
        researchMomentVersions,
        eq(
          researchMomentVersions.id,
          researchAssignments.researchMomentVersionId,
        ),
      )
      .innerJoin(
        researchMoments,
        eq(researchMoments.id, researchMomentVersions.researchMomentId),
      )
      .innerJoin(
        orders,
        and(
          eq(orders.id, researchAssignments.orderId),
          eq(orders.merchantId, interviews.merchantId),
        ),
      )
      .leftJoin(
        calls,
        and(
          eq(calls.interviewId, interviews.id),
          eq(calls.merchantId, interviews.merchantId),
        ),
      )
      .leftJoin(
        recordings,
        and(
          eq(recordings.interviewId, interviews.id),
          eq(recordings.merchantId, interviews.merchantId),
          isNull(recordings.deletedAt),
        ),
      )
      .where(
        and(
          eq(interviews.merchantId, context.merchantId),
          inArray(interviews.status, ["completed", "aborted"]),
          ...(seesAllCalls(context)
            ? []
            : [eq(interviews.researcherId, context.researcherId)]),
        ),
      )
      .orderBy(desc(interviews.endedAt))
      .limit(200);
    return rows.map((row) => ({
      interviewId: row.interviewId,
      outcome: closedOutcome(row.outcome),
      endedAt: row.endedAt?.toISOString() ?? null,
      angle: row.momentKind === "general" ? "" : row.momentName,
      orderNumber: row.orderNumber,
      durationSeconds: callSeconds(row.answeredAt, row.callEndedAt),
      transcriptLines: row.transcriptLines,
      hasRecording: row.recordingStatus?.startsWith("stored") ?? false,
      promptsCovered: row.promptsCovered,
      mine: row.researcherId === context.researcherId,
    }));
  }

  async getCallReview(
    context: TenantContext,
    interviewId: string,
  ): Promise<CallReview> {
    const interview = await this.requireReviewableInterview(
      context,
      interviewId,
    );
    const [call] = await this.db
      .select({ answeredAt: calls.answeredAt, endedAt: calls.endedAt })
      .from(calls)
      .where(
        and(
          eq(calls.interviewId, interviewId),
          eq(calls.merchantId, context.merchantId),
        ),
      )
      .limit(1);
    const [transcript] = await this.db
      .select({ id: transcripts.id, status: transcripts.status })
      .from(transcripts)
      .where(
        and(
          eq(transcripts.interviewId, interviewId),
          eq(transcripts.merchantId, context.merchantId),
          isNull(transcripts.deletedAt),
        ),
      )
      .orderBy(desc(transcripts.createdAt))
      .limit(1);
    const lines = transcript
      ? await this.db
          .select({
            sequence: transcriptSegments.sequence,
            speaker: transcriptSegments.speaker,
            atMs: transcriptSegments.endMs,
            text: transcriptSegments.text,
          })
          .from(transcriptSegments)
          .where(
            and(
              eq(transcriptSegments.transcriptId, transcript.id),
              eq(transcriptSegments.merchantId, context.merchantId),
            ),
          )
          .orderBy(asc(transcriptSegments.sequence))
      : [];
    const [recording] = await this.db
      .select({ status: recordings.status })
      .from(recordings)
      .where(
        and(
          eq(recordings.interviewId, interviewId),
          eq(recordings.merchantId, context.merchantId),
          isNull(recordings.deletedAt),
        ),
      )
      .limit(1);
    return {
      ...(await this.workspace(context, interview)),
      outcome: closedOutcome(interview.outcome),
      endedAt: interview.endedAt?.toISOString() ?? null,
      durationSeconds: callSeconds(call?.answeredAt, call?.endedAt),
      transcriptStatus: !transcript
        ? "none"
        : transcript.status === "completed" || transcript.status === "ready"
          ? "completed"
          : transcript.status === "failed"
            ? "failed"
            : "processing",
      transcript: lines.map((line) => ({
        sequence: line.sequence,
        speaker:
          line.speaker === "researcher" || line.speaker === "customer"
            ? line.speaker
            : "unknown",
        atMs: line.atMs,
        text: line.text,
      })),
      hasRecording: recording?.status.startsWith("stored") ?? false,
    };
  }

  async getRecordingObjectKey(
    context: TenantContext,
    interviewId: string,
  ): Promise<string | null> {
    await this.requireReviewableInterview(context, interviewId);
    const [recording] = await this.db
      .select({ objectKey: recordings.objectKey, status: recordings.status })
      .from(recordings)
      .where(
        and(
          eq(recordings.interviewId, interviewId),
          eq(recordings.merchantId, context.merchantId),
          isNull(recordings.deletedAt),
        ),
      )
      .limit(1);
    if (!recording?.status.startsWith("stored")) return null;
    await this.db.insert(auditEvents).values({
      id: randomUUID(),
      merchantId: context.merchantId,
      actorId: context.researcherId,
      action: "recording.playback_authorized",
      subjectType: "interview",
      subjectId: interviewId,
      metadata: {
        correlationId: context.correlationId,
        ...(context.viewer ? { viewer: context.viewer } : {}),
      },
      occurredAt: this.now(),
    });
    return recording.objectKey;
  }

  async saveResponse(
    context: TenantContext,
    interviewId: string,
    fieldId: string,
    value: string,
  ) {
    const interview = await this.requireOwnedInterview(context, interviewId);
    const [field] = await this.db
      .select({ definition: researchFieldVersions.definition })
      .from(researchFieldSetItems)
      .innerJoin(
        researchFieldVersions,
        eq(researchFieldVersions.id, researchFieldSetItems.fieldVersionId),
      )
      .where(
        and(
          eq(
            researchFieldSetItems.fieldSetVersionId,
            interview.researchFieldSetVersionId,
          ),
          eq(researchFieldSetItems.fieldVersionId, fieldId),
        ),
      )
      .limit(1);
    if (!field) throw new OperationsError("INVALID_RESEARCH_FIELD", 400);
    const definition = researchFieldDefinitionV1Schema.safeParse(
      field.definition,
    );
    if (!definition.success || !this.validResponseValue(definition.data, value))
      throw new OperationsError("INVALID_RESPONSE", 400);
    await this.recordResponse(context, interview, fieldId, value);
  }

  /** Appends an accepted response version unless the value is unchanged. */
  private async recordResponse(
    context: TenantContext,
    interview: { id: string; researchFieldSetVersionId: string },
    fieldId: string,
    value: unknown,
    origin: { provenance: string; source: string } = {
      provenance: "human_entered",
      source: "live_interview",
    },
  ) {
    const interviewId = interview.id;
    const prior = await this.db
      .select({
        id: interviewResponses.id,
        version: interviewResponses.version,
        value: interviewResponses.value,
      })
      .from(interviewResponses)
      .where(
        and(
          eq(interviewResponses.merchantId, context.merchantId),
          eq(interviewResponses.interviewId, interviewId),
          eq(interviewResponses.researchFieldVersionId, fieldId),
          eq(interviewResponses.reviewStatus, "accepted"),
        ),
      )
      .orderBy(desc(interviewResponses.version))
      .limit(1);
    if (JSON.stringify(prior[0]?.value) === JSON.stringify(value)) return;
    await this.db
      .insert(interviewResponses)
      .values({
        id: stableUuid(
          `response:${interviewId}:${fieldId}:${typeof value === "string" ? value : JSON.stringify(value)}`,
        ),
        merchantId: context.merchantId,
        interviewId,
        researchFieldVersionId: fieldId,
        researchFieldSetVersionId: interview.researchFieldSetVersionId,
        version: (prior[0]?.version ?? 0) + 1,
        value,
        provenance: origin.provenance,
        provenanceDetails: { source: origin.source },
        reviewStatus: "accepted",
        createdBy: context.researcherId,
        reviewedBy: context.researcherId,
        reviewedAt: this.now(),
        supersedesResponseId: prior[0]?.id,
      })
      .onConflictDoNothing();
  }

  async addObservation(
    context: TenantContext,
    interviewId: string,
    kind: string,
    detail: string,
  ) {
    await this.requireOwnedInterview(context, interviewId);
    if (
      !interviewObservationTypeSchema.safeParse(kind).success ||
      !detail.trim()
    )
      throw new OperationsError("INVALID_OBSERVATION", 400);
    await this.db
      .insert(interviewObservations)
      .values({
        id: stableUuid(`observation:${interviewId}:${kind}:${detail}`),
        merchantId: context.merchantId,
        interviewId,
        researcherId: context.researcherId,
        source: "researcher_observed",
        observationType: kind,
        note: detail,
      })
      .onConflictDoNothing();
  }

  async savePromptProgress(
    context: TenantContext,
    interviewId: string,
    promptKey: string,
    input: PromptProgressInput,
  ) {
    const interview = await this.requireOwnedInterview(context, interviewId);
    if (interview.status !== "in_progress")
      throw new OperationsError("INTERVIEW_CLOSED", 409);
    await this.applyPromptProgress(context, interview, promptKey, input, {
      provenance: "human_entered",
      source: "live_interview",
    });
  }

  async reviewPromptProgress(
    context: TenantContext,
    interviewId: string,
    promptKey: string,
    input: PromptProgressInput,
  ) {
    const interview = await this.requireReviewableInterview(
      context,
      interviewId,
      "correct",
    );
    await this.applyPromptProgress(context, interview, promptKey, input, {
      provenance: "human_reviewed",
      source: "call_review",
    });
  }

  private async applyPromptProgress(
    context: TenantContext,
    interview: typeof interviews.$inferSelect,
    promptKey: string,
    input: PromptProgressInput,
    origin: { provenance: string; source: string },
  ) {
    const interviewId = interview.id;
    const prompt = (await this.prompts(context, interview)).find(
      (candidate) => candidate.key === promptKey,
    );
    const selected = [...new Set(input.selected)];
    const note = input.note.trim();
    if (
      !prompt ||
      note.length > 5_000 ||
      selected.some((option) => !prompt.options.includes(option))
    )
      throw new OperationsError("INVALID_PROMPT_PROGRESS", 400);
    const now = this.now();
    const values = {
      coveredAt: input.covered ? (prompt.covered ? undefined : now) : null,
      selected,
      note: note || null,
      updatedBy: context.researcherId,
      updatedAt: now,
    };
    await this.db
      .insert(interviewPromptProgress)
      .values({
        interviewId,
        merchantId: context.merchantId,
        promptKey,
        ...values,
        coveredAt: input.covered ? now : null,
      })
      .onConflictDoUpdate({
        target: [
          interviewPromptProgress.interviewId,
          interviewPromptProgress.promptKey,
        ],
        set: values,
        where: eq(interviewPromptProgress.merchantId, context.merchantId),
      });
    // Item answers stay per item on the call sheet; the response record holds
    // one answer per field.
    if (prompt.kind !== "field" || prompt.lineId) return;
    // Mirror structured answers into the reviewed response record. Free text
    // on select rows stays on the call sheet, where privacy erasure redacts it.
    const fieldId = promptKey.slice("field:".length);
    const value =
      prompt.valueType === "rating_scale"
        ? selected.length
          ? Number(selected.at(-1))
          : undefined
        : prompt.options.length
          ? selected.length
            ? selected
            : undefined
          : note || undefined;
    if (value !== undefined)
      await this.recordResponse(context, interview, fieldId, value, origin);
  }

  async completeInterview(
    context: TenantContext,
    interviewId: string,
    outcome: InterviewOutcome,
  ) {
    const current = await this.requireOwnedInterview(context, interviewId);
    if (current.status === "completed" || current.status === "aborted") return;
    if (outcome === "completed") {
      const required = await this.db
        .select({ id: researchFieldSetItems.fieldVersionId })
        .from(researchFieldSetItems)
        .where(
          and(
            eq(
              researchFieldSetItems.fieldSetVersionId,
              current.researchFieldSetVersionId,
            ),
            eq(researchFieldSetItems.required, true),
          ),
        );
      const responses = await this.db
        .select({ id: interviewResponses.researchFieldVersionId })
        .from(interviewResponses)
        .where(
          and(
            eq(interviewResponses.merchantId, context.merchantId),
            eq(interviewResponses.interviewId, interviewId),
            eq(interviewResponses.reviewStatus, "accepted"),
          ),
        );
      // A required field counts once it has an answer or the researcher
      // marked its row covered; details can come from the recording later.
      const covered = await this.db
        .select({ key: interviewPromptProgress.promptKey })
        .from(interviewPromptProgress)
        .where(
          and(
            eq(interviewPromptProgress.merchantId, context.merchantId),
            eq(interviewPromptProgress.interviewId, interviewId),
            sql`${interviewPromptProgress.coveredAt} is not null`,
          ),
        );
      const done = new Set([
        ...responses.map((row) => row.id),
        // Item prompts count once any of their items is covered.
        ...covered.map((row) =>
          row.key.replace(/^field:/, "").replace(/@line:.*$/, ""),
        ),
      ]);
      if (required.some((row) => !done.has(row.id)))
        throw new OperationsError("INTERVIEW_INCOMPLETE", 409);
    }
    const now = this.now();
    await this.db.transaction(async (tx) => {
      const [assignment] = await tx
        .update(researchAssignments)
        .set({
          status: outcome,
          completedAt: outcome === "completed" ? now : null,
          lockVersion: sql`${researchAssignments.lockVersion} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(researchAssignments.id, current.researchAssignmentId),
            eq(researchAssignments.merchantId, context.merchantId),
            eq(researchAssignments.status, "interview_started"),
            eq(researchAssignments.assignedResearcherId, context.researcherId),
          ),
        )
        .returning();
      if (!assignment) throw new OperationsError("ASSIGNMENT_CONFLICT", 409);
      await tx
        .update(interviews)
        .set({
          status: outcome === "completed" ? "completed" : "aborted",
          outcome,
          endedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(interviews.id, interviewId),
            eq(interviews.merchantId, context.merchantId),
          ),
        );
      await tx
        .update(calls)
        .set({
          status: outcome === "no_answer" ? "no_answer" : "completed",
          endedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(calls.interviewId, interviewId),
            eq(calls.merchantId, context.merchantId),
          ),
        );
      await this.transition(
        tx,
        context,
        assignment.id,
        "interview_started",
        outcome,
        assignment.lockVersion,
        now,
      );
      if (outcome === "declined" && assignment.customerId)
        await this.suppressCustomer(tx, context, assignment.customerId, now);
    });
  }

  /**
   * The customer asked not to be contacted: never queue them again, and
   * cancel any other open work for them. Permanent unless an operator
   * reverses it in the database.
   */
  private async suppressCustomer(
    tx: DbTransaction,
    context: TenantContext,
    customerId: string,
    now: Date,
  ) {
    await tx
      .update(customers)
      .set({ contactabilityStatus: "suppressed", updatedAt: now })
      .where(
        and(
          eq(customers.id, customerId),
          eq(customers.merchantId, context.merchantId),
        ),
      );
    const open = await tx
      .select({
        id: researchAssignments.id,
        status: researchAssignments.status,
      })
      .from(researchAssignments)
      .where(
        and(
          eq(researchAssignments.merchantId, context.merchantId),
          eq(researchAssignments.customerId, customerId),
          inArray(researchAssignments.status, ["queued", "no_answer"]),
        ),
      )
      .for("update");
    for (const { id, status } of open) {
      const [cancelled] = await tx
        .update(researchAssignments)
        .set({
          status: "cancelled",
          lockVersion: sql`${researchAssignments.lockVersion} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(researchAssignments.id, id),
            eq(researchAssignments.merchantId, context.merchantId),
          ),
        )
        .returning({ lockVersion: researchAssignments.lockVersion });
      await this.transition(
        tx,
        context,
        id,
        status,
        "cancelled",
        cancelled!.lockVersion,
        now,
        { reason: "customer_suppressed" },
      );
    }
    await tx.insert(auditEvents).values({
      id: randomUUID(),
      merchantId: context.merchantId,
      actorId: context.researcherId,
      action: "customer.contact_suppressed",
      subjectType: "customer",
      subjectId: customerId,
      metadata: {
        reason: "customer_request",
        correlationId: context.correlationId,
      },
      occurredAt: now,
    });
  }

  async generateReport(context: TenantContext, period: string) {
    await this.requireMerchant(context);
    if (!/^\d{4}-\d{2}$/.test(period))
      throw new OperationsError("INVALID_REPORT_PERIOD", 400);
    const start = new Date(`${period}-01T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()))
      throw new OperationsError("INVALID_REPORT_PERIOD", 400);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );
    const reportId = stableUuid(`report:${context.merchantId}:${period}`);
    const revisionId = stableUuid(`report-revision:${reportId}:1`);
    const idempotencyKey = `render_report:${revisionId}`;
    await this.db.transaction(async (tx) => {
      await tx
        .insert(reports)
        .values({
          id: reportId,
          merchantId: context.merchantId,
          periodStart: start,
          periodEnd: end,
          displayMonth: period,
          status: "generating",
        })
        .onConflictDoNothing();
      await tx
        .insert(reportRevisions)
        .values({
          id: revisionId,
          reportId,
          merchantId: context.merchantId,
          revision: 1,
          title: `Disco ${period}`,
          executiveSummary: "Pending generation",
          methodology: "Pending generation",
          sampleNotes: "Pending generation",
          templateVersion: "disco-html-v1",
          status: "generating",
        })
        .onConflictDoNothing();
      await tx
        .insert(outboxEvents)
        .values({
          id: stableUuid(`outbox:${idempotencyKey}`),
          merchantId: context.merchantId,
          aggregateType: "report_revision",
          aggregateId: revisionId,
          eventType: "render_report",
          payload: {
            merchantId: context.merchantId,
            reportRevisionId: revisionId,
          },
          schemaVersion: 1,
          idempotencyKey,
          correlationId: context.correlationId,
        })
        .onConflictDoNothing();
    });
    return { reportId };
  }

  /**
   * The merchant viewer (Shopify admin session) is refused unless the caller
   * opts in; only read paths and angle requests do.
   */
  private async requireMerchant(
    context: TenantContext,
    options: { readonly allowMerchantViewer?: boolean } = {},
  ) {
    if (context.viewer === "merchant" && !options.allowMerchantViewer)
      throw new OperationsError("WORKFORCE_ACCESS_REQUIRED", 403);
    const [merchant] = await this.db
      .select({ id: merchants.id })
      .from(merchants)
      .where(
        and(
          eq(merchants.id, context.merchantId),
          eq(merchants.status, "active"),
        ),
      )
      .limit(1);
    if (!merchant) throw new OperationsError("MERCHANT_ACCESS_DENIED", 403);
  }

  private async requireAdmin(context: TenantContext) {
    if (!canViewCommerceDashboard(context.roles))
      throw new OperationsError("ADMIN_ROLE_REQUIRED", 403);
  }

  private async expireAssignments(merchantId: string, now: Date) {
    const expire = async (
      condition: ReturnType<typeof and>,
      reason: "claim_expired" | "queue_window_passed",
    ) => {
      const expired = await this.db
        .update(researchAssignments)
        .set({
          status: "expired",
          lockVersion: sql`${researchAssignments.lockVersion} + 1`,
          updatedAt: now,
        })
        .where(and(eq(researchAssignments.merchantId, merchantId), condition))
        .returning({
          id: researchAssignments.id,
          lockVersion: researchAssignments.lockVersion,
        });
      if (expired.length)
        await this.db.insert(assignmentTransitions).values(
          expired.map((row) => ({
            id: randomUUID(),
            merchantId,
            assignmentId: row.id,
            fromStatus: reason === "claim_expired" ? "claimed" : "queued",
            toStatus: "expired",
            occurredAt: now,
            lockVersion: row.lockVersion,
            metadata: { reason },
          })),
        );
    };
    await expire(
      and(
        or(
          eq(researchAssignments.status, "queued"),
          eq(researchAssignments.status, "claimed"),
        ),
        sql`${researchAssignments.expiresAt} <= ${now}`,
      ),
      "claim_expired",
    );
    // Unclaimed orders leave the queue once the moment has passed.
    await expire(
      and(
        eq(researchAssignments.status, "queued"),
        sql`${researchAssignments.orderId} in (
          select ${orders.id} from ${orders}
          where ${orders.merchantId} = ${merchantId}
            and ${orders.orderedAt} <= ${new Date(now.getTime() - QUEUE_WINDOW_MS)}
        )`,
      ),
      "queue_window_passed",
    );
  }

  private async getQueueItem(context: TenantContext, id: string) {
    const item = (await this.listQueue(context)).find(
      (candidate) => candidate.id === id,
    );
    if (!item) throw new OperationsError("ASSIGNMENT_NOT_FOUND", 404);
    return item;
  }

  private async getAssignmentItem(
    context: TenantContext,
    id: string,
  ): Promise<QueueItem> {
    const [row] = await this.db
      .select({
        id: researchAssignments.id,
        status: researchAssignments.status,
        priority: researchAssignments.priority,
        claimedBy: researchAssignments.assignedResearcherId,
        lockVersion: researchAssignments.lockVersion,
        createdAt: researchAssignments.createdAt,
        encryptedGivenName: customerPrivate.encryptedGivenName,
        encryptedPhone: customerPrivate.encryptedPhoneE164,
        phoneLastFour: customerPrivate.phoneLastFour,
        merchantName: merchants.name,
        momentId: researchMoments.id,
        momentName: researchMoments.name,
        momentKind: researchMoments.kind,
        momentStatus: researchMoments.status,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        orderedAt: orders.orderedAt,
        orderSequence: orders.customerOrderSequence,
        orderNumber: orders.sourceOrderNumber,
        shopifyCustomerId: customers.shopifyCustomerId,
        observed: orders.observedAttribution,
      })
      .from(researchAssignments)
      .innerJoin(merchants, eq(merchants.id, researchAssignments.merchantId))
      .innerJoin(
        researchMomentVersions,
        eq(
          researchMomentVersions.id,
          researchAssignments.researchMomentVersionId,
        ),
      )
      .innerJoin(
        researchMoments,
        eq(researchMoments.id, researchMomentVersions.researchMomentId),
      )
      .innerJoin(
        orders,
        and(
          eq(orders.id, researchAssignments.orderId),
          eq(orders.merchantId, context.merchantId),
        ),
      )
      .leftJoin(
        customers,
        and(
          eq(customers.id, researchAssignments.customerId),
          eq(customers.merchantId, context.merchantId),
        ),
      )
      .leftJoin(
        customerPrivate,
        and(
          eq(customerPrivate.customerId, researchAssignments.customerId),
          eq(customerPrivate.merchantId, context.merchantId),
        ),
      )
      .where(
        and(
          eq(researchAssignments.id, id),
          eq(researchAssignments.merchantId, context.merchantId),
        ),
      )
      .limit(1);
    if (!row) throw new OperationsError("ASSIGNMENT_NOT_FOUND", 404);
    const products = await this.db
      .select({
        title: orderLineItems.title,
        sku: orderLineItems.sku,
        quantity: orderLineItems.quantity,
      })
      .from(orderLineItems)
      .innerJoin(
        researchAssignments,
        eq(researchAssignments.orderId, orderLineItems.orderId),
      )
      .where(
        and(
          eq(researchAssignments.id, id),
          eq(orderLineItems.merchantId, context.merchantId),
        ),
      );
    return this.queueDto(row, products, this.now());
  }

  private queueDto(
    row: {
      id: string;
      status: string;
      priority: number;
      claimedBy: string | null;
      lockVersion: number;
      createdAt: Date;
      encryptedGivenName: string | null;
      encryptedPhone: string | null;
      phoneLastFour: string | null;
      merchantName: string;
      momentId: string;
      momentName: string;
      momentKind: string;
      totalMinor: number;
      currency: string;
      orderedAt: Date;
      orderSequence: number | null;
      orderNumber: string | null;
      shopifyCustomerId: string | null;
      observed: unknown;
      interviewId?: string | null;
      /** Decrypted first name, when the caller is allowed to show it. */
      givenName?: string | null;
      /** Decrypted "City, ST", when the caller is allowed to show it. */
      locality?: string | null;
    },
    lines: readonly {
      title: string | null;
      sku: string | null;
      quantity: number;
    }[],
    now: Date,
  ): QueueItem {
    const observed = safeJson(row.observed);
    const products = lines.map((item) => item.title ?? item.sku ?? "Product");
    return {
      id: row.id,
      customerName:
        row.givenName ??
        (row.encryptedGivenName?.startsWith("synthetic:plain:")
          ? row.encryptedGivenName.slice(16)
          : "Customer"),
      itemCount: lines.reduce((sum, item) => sum + item.quantity, 0),
      maskedPhone: maskPhone(row.phoneLastFour, row.encryptedPhone),
      merchant: row.merchantName,
      momentId: row.momentId,
      // Orders no angle matched carry no angle name.
      moment: row.momentKind === "general" ? "" : row.momentName,
      general: row.momentKind === "general",
      eventAgeMinutes: Math.max(
        0,
        Math.floor((now.getTime() - row.createdAt.getTime()) / 60_000),
      ),
      locality: row.locality ?? null,
      orderedAt: row.orderedAt.toISOString(),
      orderSequence: row.orderSequence ?? 0,
      orderNumber: row.orderNumber,
      shopifyCustomerId: row.shopifyCustomerId
        ? shopifyLegacyId(row.shopifyCustomerId)
        : null,
      orderTotal: formatMoney(row.totalMinor, row.currency),
      products,
      observedAttribution:
        [observed.source, observed.channel].filter(Boolean).join(" / ") ||
        "Unknown",
      priority: row.priority >= 75 ? "urgent" : "standard",
      status:
        row.status === "interview_started"
          ? "dialing"
          : row.status === "completed"
            ? "reached"
            : row.status === "no_answer"
              ? "claimed"
              : (row.status as "queued" | "claimed"),
      ...(row.claimedBy ? { claimedByResearcherId: row.claimedBy } : {}),
      ...(row.interviewId ? { interviewId: row.interviewId } : {}),
      lockVersion: row.lockVersion,
    };
  }

  private async findInterview(context: TenantContext, assignmentId: string) {
    const [row] = await this.db
      .select()
      .from(interviews)
      .where(
        and(
          eq(interviews.merchantId, context.merchantId),
          eq(interviews.researchAssignmentId, assignmentId),
          eq(interviews.researcherId, context.researcherId),
        ),
      )
      .limit(1);
    return row;
  }

  /** A finished call, open to the researcher who made it or a manager. */
  private async requireReviewableInterview(
    context: TenantContext,
    interviewId: string,
    access: "read" | "correct" = "read",
  ) {
    await this.requireMerchant(context, {
      allowMerchantViewer: access === "read",
    });
    const [row] = await this.db
      .select()
      .from(interviews)
      .where(
        and(
          eq(interviews.id, interviewId),
          eq(interviews.merchantId, context.merchantId),
          inArray(interviews.status, ["completed", "aborted"]),
          ...(seesAllCalls(context)
            ? []
            : [eq(interviews.researcherId, context.researcherId)]),
        ),
      )
      .limit(1);
    if (!row) throw new OperationsError("INTERVIEW_ACCESS_DENIED", 403);
    return row;
  }

  private async requireOwnedInterview(
    context: TenantContext,
    interviewId: string,
  ) {
    if (context.viewer === "merchant")
      throw new OperationsError("WORKFORCE_ACCESS_REQUIRED", 403);
    const [row] = await this.db
      .select()
      .from(interviews)
      .innerJoin(
        researchAssignments,
        and(
          eq(researchAssignments.id, interviews.researchAssignmentId),
          eq(researchAssignments.merchantId, context.merchantId),
        ),
      )
      .where(
        and(
          eq(interviews.id, interviewId),
          eq(interviews.merchantId, context.merchantId),
          eq(interviews.researcherId, context.researcherId),
          eq(researchAssignments.assignedResearcherId, context.researcherId),
        ),
      )
      .limit(1);
    if (!row) throw new OperationsError("INTERVIEW_ACCESS_DENIED", 403);
    return row.interviews;
  }

  private async workspace(
    context: TenantContext,
    interview: typeof interviews.$inferSelect,
  ): Promise<InterviewWorkspace> {
    const interviewId = interview.id;
    const assignment = await this.getAssignmentItem(
      context,
      interview.researchAssignmentId,
    );
    const [script] = await this.db
      .select({
        name: scripts.name,
        version: scriptVersions.version,
        content: scriptVersions.content,
      })
      .from(scriptVersions)
      .innerJoin(scripts, eq(scripts.id, scriptVersions.scriptId))
      .where(eq(scriptVersions.id, interview.scriptVersionId))
      .limit(1);
    if (!script) throw new OperationsError("PINNED_SCRIPT_UNAVAILABLE", 404);
    const fields = await this.db
      .select({
        id: researchFieldVersions.id,
        definition: researchFieldVersions.definition,
        source: researchFieldSetItems.source,
        required: researchFieldSetItems.required,
      })
      .from(researchFieldSetItems)
      .innerJoin(
        researchFieldVersions,
        eq(researchFieldVersions.id, researchFieldSetItems.fieldVersionId),
      )
      .where(
        eq(
          researchFieldSetItems.fieldSetVersionId,
          interview.researchFieldSetVersionId,
        ),
      )
      .orderBy(asc(researchFieldSetItems.displayOrder));
    const [fieldSet] = await this.db
      .select({ version: researchFieldSetVersions.version })
      .from(researchFieldSetVersions)
      .where(
        eq(researchFieldSetVersions.id, interview.researchFieldSetVersionId),
      )
      .limit(1);
    const answered = await this.db
      .select({ id: interviewResponses.researchFieldVersionId })
      .from(interviewResponses)
      .where(
        and(
          eq(interviewResponses.merchantId, context.merchantId),
          eq(interviewResponses.interviewId, interviewId),
          eq(
            interviewResponses.researchFieldSetVersionId,
            interview.researchFieldSetVersionId,
          ),
          eq(interviewResponses.reviewStatus, "accepted"),
        ),
      );
    return {
      id: interview.id,
      assignment,
      scriptName: script.name,
      scriptVersion: script.version,
      fieldSetVersion: fieldSet?.version ?? 1,
      script: readScriptPrompts(script.content),
      fields: fields.flatMap((field) => {
        const parsed = researchFieldDefinitionV1Schema.safeParse(
          field.definition,
        );
        if (!parsed.success) return [];
        return [
          {
            ...describeField(field.id, parsed.data),
            source:
              field.source === "platform_default" ||
              field.source === "merchant_default"
                ? field.source
                : ("research_run" as const),
            required: field.required,
          },
        ];
      }),
      answeredFieldIds: [...new Set(answered.map((row) => row.id))],
      status:
        interview.status === "completed"
          ? "completed"
          : interview.outcome === "no_answer" ||
              interview.outcome === "declined"
            ? interview.outcome
            : "dialing",
      ...(await this.callSheet(context, interview)),
      prompts: (await this.prompts(context, interview)).map(
        ({ valueType: _valueType, ...prompt }) => prompt,
      ),
    };
  }

  /** Script prompts, then research fields, with the saved call-sheet state. */
  private async prompts(
    context: TenantContext,
    interview: {
      id: string;
      researchAssignmentId: string;
      scriptVersionId: string;
      researchFieldSetVersionId: string;
    },
  ): Promise<(CallSheetPrompt & { valueType: string | null })[]> {
    // Item prompts repeat once per line of the order being called about.
    const lines = await this.db
      .select({ id: orderLineItems.id })
      .from(orderLineItems)
      .innerJoin(
        researchAssignments,
        and(
          eq(researchAssignments.orderId, orderLineItems.orderId),
          eq(researchAssignments.id, interview.researchAssignmentId),
        ),
      )
      .where(eq(orderLineItems.merchantId, context.merchantId))
      .orderBy(asc(orderLineItems.shopifyLineItemId));
    const [script] = await this.db
      .select({ content: scriptVersions.content })
      .from(scriptVersions)
      .where(eq(scriptVersions.id, interview.scriptVersionId))
      .limit(1);
    const fields = await this.db
      .select({
        id: researchFieldVersions.id,
        definition: researchFieldVersions.definition,
        required: researchFieldSetItems.required,
      })
      .from(researchFieldSetItems)
      .innerJoin(
        researchFieldVersions,
        eq(researchFieldVersions.id, researchFieldSetItems.fieldVersionId),
      )
      .where(
        eq(
          researchFieldSetItems.fieldSetVersionId,
          interview.researchFieldSetVersionId,
        ),
      )
      .orderBy(asc(researchFieldSetItems.displayOrder));
    const progress = await this.db
      .select()
      .from(interviewPromptProgress)
      .where(
        and(
          eq(interviewPromptProgress.merchantId, context.merchantId),
          eq(interviewPromptProgress.interviewId, interview.id),
        ),
      );
    const saved = new Map(progress.map((row) => [row.promptKey, row]));
    const withState = (
      prompt: Omit<
        CallSheetPrompt,
        "covered" | "selected" | "note" | "lineId"
      > & {
        valueType: string | null;
      },
    ) =>
      (prompt.scope === "item" && lines.length
        ? lines.map((line) => ({
            ...prompt,
            key: `${prompt.key}@line:${line.id}`,
            lineId: line.id,
          }))
        : [{ ...prompt, lineId: null }]
      ).map((row) => {
        const progress = saved.get(row.key);
        return {
          ...row,
          covered: Boolean(progress?.coveredAt),
          selected: Array.isArray(progress?.selected)
            ? progress.selected.filter(
                (option): option is string =>
                  typeof option === "string" && row.options.includes(option),
              )
            : [],
          note: progress?.note ?? "",
        };
      });
    return [
      ...readScriptPrompts(script?.content).flatMap((prompt) =>
        withState({
          key: `script:${prompt.id}`,
          kind: "script",
          scope: prompt.scope ?? "order",
          title: prompt.title,
          prompt: prompt.prompt,
          options: [],
          required: false,
          valueType: null,
        }),
      ),
      ...fields.flatMap((field) => {
        const parsed = researchFieldDefinitionV1Schema.safeParse(
          field.definition,
        );
        if (!parsed.success) return [];
        const definition = parsed.data;
        return withState({
          key: `field:${field.id}`,
          kind: "field",
          scope: fieldScope(definition),
          title: definition.label,
          prompt: definition.prompt,
          options:
            definition.valueType === "rating_scale"
              ? ["1", "2", "3", "4", "5"]
              : (definition.options?.map((option) => option.label) ?? []),
          required: field.required,
          valueType: definition.valueType,
        });
      }),
    ];
  }

  /**
   * Profile and order history for the call sheet. Name and city/state are
   * decrypted only while this researcher's interview is in progress, under
   * the same conditions as a phone reveal, and every decryption is audited.
   */
  private async callSheet(
    context: TenantContext,
    interview: { id: string; researchAssignmentId: string; status: string },
  ): Promise<{
    profile: CallSheetProfile;
    pastOrders: CallSheetOrder[];
    currentOrder: CallSheetOrder | null;
  }> {
    const now = this.now();
    const [row] = await this.db
      .select({
        orderId: researchAssignments.orderId,
        customerId: researchAssignments.customerId,
        shopifyCustomerId: customers.shopifyCustomerId,
        orderCount: customers.orderCount,
        lifetimeRevenueMinor: customers.lifetimeRevenueMinor,
        currency: customers.currency,
        firstOrderAt: customers.firstOrderAt,
        historyCompleteness: customers.historyCompleteness,
        contactabilityStatus: customers.contactabilityStatus,
        customerDeletedAt: customers.deletedAt,
        encryptedGivenName: customerPrivate.encryptedGivenName,
        encryptedLocality: customerPrivate.encryptedLocality,
        keyVersion: customerPrivate.keyVersion,
        privateDeletedAt: customerPrivate.deletedAt,
        privateExpiresAt: customerPrivate.expiresAt,
      })
      .from(researchAssignments)
      .leftJoin(
        customers,
        and(
          eq(customers.id, researchAssignments.customerId),
          eq(customers.merchantId, context.merchantId),
        ),
      )
      .leftJoin(
        customerPrivate,
        and(
          eq(customerPrivate.customerId, researchAssignments.customerId),
          eq(customerPrivate.merchantId, context.merchantId),
        ),
      )
      .where(
        and(
          eq(researchAssignments.id, interview.researchAssignmentId),
          eq(researchAssignments.merchantId, context.merchantId),
        ),
      )
      .limit(1);
    if (!row) throw new OperationsError("ASSIGNMENT_NOT_FOUND", 404);

    const readable =
      interview.status === "in_progress" &&
      row.customerId !== null &&
      row.keyVersion !== null &&
      row.contactabilityStatus !== "suppressed" &&
      !row.customerDeletedAt &&
      !row.privateDeletedAt &&
      (!row.privateExpiresAt || row.privateExpiresAt > now);
    const decrypt = async (
      field: "given_name" | "locality",
      ciphertext: string | null,
    ) =>
      readable && ciphertext
        ? ((await this.phoneDecryptor.decrypt({
            merchantId: context.merchantId,
            customerId: row.customerId!,
            ciphertext,
            keyVersion: row.keyVersion!,
            field,
          })) ?? null)
        : null;
    const [firstName, locality] = await Promise.all([
      decrypt("given_name", row.encryptedGivenName),
      decrypt("locality", row.encryptedLocality),
    ]);
    if (firstName !== null || locality !== null)
      await this.db.insert(auditEvents).values({
        id: randomUUID(),
        merchantId: context.merchantId,
        actorId: context.researcherId,
        action: "customer_private.profile_viewed",
        subjectType: "research_assignment",
        subjectId: interview.researchAssignmentId,
        metadata: {
          fields: [
            ...(firstName !== null ? ["given_name"] : []),
            ...(locality !== null ? ["locality"] : []),
          ],
          purpose: "call_sheet",
          correlationId: context.correlationId,
        },
        occurredAt: now,
      });

    const orderRows = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, context.merchantId),
          row.customerId
            ? eq(orders.customerId, row.customerId)
            : eq(orders.id, row.orderId),
        ),
      )
      .orderBy(desc(orders.orderedAt));
    const lineRows = orderRows.length
      ? await this.db
          .select()
          .from(orderLineItems)
          .where(
            and(
              eq(orderLineItems.merchantId, context.merchantId),
              inArray(
                orderLineItems.orderId,
                orderRows.map((order) => order.id),
              ),
            ),
          )
          .orderBy(asc(orderLineItems.shopifyLineItemId))
      : [];
    const productIds = [
      ...new Set(lineRows.flatMap((line) => line.productId ?? [])),
    ];
    const categoryRows = productIds.length
      ? await this.db
          .select({
            productId: productCategoryAssignments.productId,
            label: productCategories.label,
          })
          .from(productCategoryAssignments)
          .innerJoin(
            productCategories,
            eq(productCategories.id, productCategoryAssignments.categoryId),
          )
          .where(
            and(
              eq(productCategoryAssignments.merchantId, context.merchantId),
              inArray(productCategoryAssignments.productId, productIds),
            ),
          )
      : [];
    const categories = new Map<string, string[]>();
    for (const category of categoryRows)
      categories.set(category.productId, [
        ...(categories.get(category.productId) ?? []),
        category.label,
      ]);

    const toOrder = (order: (typeof orderRows)[number]): CallSheetOrder => {
      const lines = lineRows
        .filter((line) => line.orderId === order.id)
        .map((line) => {
          const gross = line.unitPriceMinor * line.quantity;
          return {
            id: line.id,
            product: line.title ?? line.sku ?? "Product",
            categories: line.productId
              ? (categories.get(line.productId) ?? [])
              : [],
            variant: line.variantTitle,
            sku: line.sku,
            quantity: line.quantity,
            unitPrice: formatMoney(line.unitPriceMinor, line.currency),
            discount:
              line.discountMinor > 0
                ? formatMoney(line.discountMinor, line.currency)
                : null,
            lineTotal: formatMoney(gross - line.discountMinor, line.currency),
            refundedQuantity: line.refundedQuantity,
            returnStatus:
              line.refundedQuantity <= 0
                ? ("kept" as const)
                : line.refundedQuantity >= line.quantity
                  ? ("returned" as const)
                  : ("partially_returned" as const),
          };
        });
      const discountMinor = lineRows
        .filter((line) => line.orderId === order.id)
        .reduce((sum, line) => sum + line.discountMinor, 0);
      const observed = safeJson(order.observedAttribution);
      return {
        id: order.id,
        orderNumber: order.sourceOrderNumber,
        orderedAt: order.orderedAt.toISOString(),
        total: formatMoney(order.totalMinor, order.currency),
        discountTotal:
          discountMinor > 0 ? formatMoney(discountMinor, order.currency) : null,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        attribution:
          [observed.source, observed.channel].filter(Boolean).join(" / ") ||
          "Unknown",
        lines,
      };
    };
    const history =
      (row.historyCompleteness as { state?: string } | null)?.state ===
      "complete";
    const current = orderRows.find((order) => order.id === row.orderId);
    return {
      profile: {
        firstName,
        locality,
        shopifyCustomerId: row.shopifyCustomerId
          ? shopifyLegacyId(row.shopifyCustomerId)
          : null,
        customerSince: row.firstOrderAt?.toISOString() ?? null,
        orderCount: row.orderCount ?? orderRows.length,
        lifetimeValue:
          row.lifetimeRevenueMinor !== null && row.currency
            ? formatMoney(row.lifetimeRevenueMinor, row.currency)
            : null,
        historyComplete: history,
      },
      // History is what came before the order being called about.
      pastOrders: orderRows
        .filter(
          (order) =>
            order.id !== row.orderId &&
            (!current || order.orderedAt < current.orderedAt),
        )
        .map(toOrder),
      currentOrder:
        orderRows.filter((order) => order.id === row.orderId).map(toOrder)[0] ??
        null,
    };
  }

  private async transition(
    tx: DbTransaction,
    context: TenantContext,
    assignmentId: string,
    fromStatus: string,
    toStatus: string,
    lockVersion: number,
    occurredAt: Date,
    metadata: Record<string, unknown> = {},
  ) {
    await tx.insert(assignmentTransitions).values({
      id: randomUUID(),
      merchantId: context.merchantId,
      assignmentId,
      fromStatus,
      toStatus,
      actorId: context.researcherId,
      occurredAt,
      lockVersion,
      metadata,
    });
  }

  private validResponseValue(
    definition: {
      valueType: string;
      options?: readonly { key: string; label: string }[] | undefined;
    },
    value: string,
  ): boolean {
    if (!value.trim() || value.length > 10_000) return false;
    if (definition.valueType === "single_select")
      return Boolean(
        definition.options?.some(
          (option) => option.key === value || option.label === value,
        ),
      );
    if (definition.valueType === "rating_scale") {
      const rating = Number(value);
      return Number.isInteger(rating) && rating >= 1 && rating <= 5;
    }
    if (definition.valueType === "integer") return /^-?\d+$/.test(value);
    if (definition.valueType === "boolean")
      return value === "true" || value === "false";
    return true;
  }
}
