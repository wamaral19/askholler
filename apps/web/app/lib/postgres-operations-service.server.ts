import { createHash, randomUUID } from "node:crypto";

import {
  assignmentTransitions,
  auditEvents,
  calls,
  customerPrivate,
  customers,
  interviewObservations,
  interviewResponses,
  interviews,
  merchantResearchFieldSettings,
  merchants,
  orderLineItems,
  orders,
  outboxEvents,
  productCategories,
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
  type HollerDatabase,
} from "@holler/db";
import {
  cohortExpressionSchema,
  interviewObservationTypeSchema,
  readScriptPrompts,
  researchFieldDefinitionV1Schema,
  scriptContentV1Schema,
  type ResearchFieldDefinitionV1,
  type ScriptPrompt,
} from "@holler/domain";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import type {
  EditableFieldValueType,
  FieldDefaultInput,
  InterviewWorkspace,
  LibraryResearchField,
  LibraryScript,
  MomentRunStatus,
  MomentScript,
  OperationsApplicationService,
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
import type { PrototypeResearchField } from "./prototype-data";
import {
  cohortCategoryKeys,
  describeCohort,
  humanizeKey,
} from "./cohort-description";
import {
  canViewCommerceDashboard,
  dashboardFiltersToCohort,
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

export interface SyntheticPhoneDecryptor {
  decrypt(ciphertext: string, keyVersion: string): string | undefined;
}

/** Development/test only. Production must supply a KMS-backed implementation. */
export class PrefixedSyntheticPhoneDecryptor implements SyntheticPhoneDecryptor {
  decrypt(ciphertext: string, keyVersion: string): string | undefined {
    if (keyVersion !== "synthetic-v1") return undefined;
    const prefix = "synthetic:v1:";
    if (!ciphertext.startsWith(prefix)) return undefined;
    const phone = ciphertext.slice(prefix.length);
    return /^\+120255501\d{2}$/.test(phone) ? phone : undefined;
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

const formatMoney = (minor: number, currency: string): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);

const maskPhone = (ciphertext: string | null): string => {
  const match = ciphertext?.match(/(\d{4})$/);
  return match ? `+1 ••• ••• ${match[1]}` : "Unavailable";
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
        options.some((option) => option.length > 80)))
  )
    throw new OperationsError("INVALID_RESEARCH_FIELD", 400);
  return {
    label,
    prompt,
    valueType: input.valueType,
    options: input.valueType === "single_select" ? options : [],
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
    private readonly phoneDecryptor: SyntheticPhoneDecryptor,
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
    return {
      filters,
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
      cohortExpression: dashboardFiltersToCohort(filters),
      limitations: [
        "Discount metrics require normalized discount data and are not shown.",
        "Revenue reflects filtered orders and is not net of partial refunds.",
      ],
    };
  }

  async listMoments(context: TenantContext) {
    await this.requireMerchant(context);
    const rows = await this.db
      .select({
        id: researchMoments.id,
        name: researchMoments.name,
        momentStatus: researchMoments.status,
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
      .where(eq(researchMoments.merchantId, context.merchantId))
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
        cohortSummary: describeCohort(row.cohortExpression, labeler),
        weeklyTarget:
          typeof allocation.weeklyCap === "number" ? allocation.weeklyCap : 0,
        fieldCount: row.fieldCount,
        scriptVersion: `${row.scriptName} v${row.scriptVersion}`,
        completedThisWeek: completed.get(row.id) ?? 0,
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
    const current = (await this.listMoments(context)).find(
      (moment) => moment.id === momentId,
    );
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
    await this.requireMerchant(context);
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
      };
      const wording = (value: ResearchFieldDefinitionV1) =>
        JSON.stringify([
          value.label,
          value.prompt,
          value.valueType,
          value.options ?? [],
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
  }

  async listScripts(context: TenantContext): Promise<readonly LibraryScript[]> {
    await this.requireMerchant(context);
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

  private async currentMomentVersion(
    executor: DbExecutor,
    context: TenantContext,
    momentId: string,
  ) {
    const [row] = await executor
      .select({
        version: researchMomentVersions,
        momentName: researchMoments.name,
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
    await this.requireMerchant(context);
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
        merchantName: merchants.name,
        momentId: researchMoments.id,
        momentName: researchMoments.name,
        momentStatus: researchMoments.status,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        orderSequence: orders.customerOrderSequence,
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
    return rows.map((row) =>
      this.queueDto(
        row,
        assignmentOrders
          .filter((item) => item.assignmentId === row.id)
          .map((item) => item.title ?? item.sku ?? "Product"),
        now,
      ),
    );
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
    if (existing) return this.workspace(context, existing.id);
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
      if (retry) return this.workspace(context, retry.id);
      throw new OperationsError("ASSIGNMENT_CONFLICT", 409);
    }
    return this.workspace(context, interviewId);
  }

  async revealPhone(context: TenantContext, assignmentId: string) {
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
      ? this.phoneDecryptor.decrypt(row.ciphertext!, row.keyVersion!)
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
        purpose: "manual_dial",
        correlationId: context.correlationId,
      },
      occurredAt: now,
    });
    if (!phone) throw new OperationsError("PHONE_REVEAL_DENIED", 403);
    return { phone };
  }

  async getInterview(context: TenantContext, interviewId: string) {
    return this.workspace(context, interviewId);
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
    if (prior[0]?.value === value) return;
    await this.db
      .insert(interviewResponses)
      .values({
        id: stableUuid(`response:${interviewId}:${fieldId}:${value}`),
        merchantId: context.merchantId,
        interviewId,
        researchFieldVersionId: fieldId,
        researchFieldSetVersionId: interview.researchFieldSetVersionId,
        version: (prior[0]?.version ?? 0) + 1,
        value,
        provenance: "human_entered",
        provenanceDetails: { source: "live_interview" },
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

  async completeInterview(
    context: TenantContext,
    interviewId: string,
    outcome: "completed" | "no_answer",
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
      const accepted = new Set(responses.map((row) => row.id));
      if (required.some((row) => !accepted.has(row.id)))
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
          status: outcome === "completed" ? "completed" : "no_answer",
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

  private async requireMerchant(context: TenantContext) {
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
    const expired = await this.db
      .update(researchAssignments)
      .set({
        status: "expired",
        lockVersion: sql`${researchAssignments.lockVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(researchAssignments.merchantId, merchantId),
          or(
            eq(researchAssignments.status, "queued"),
            eq(researchAssignments.status, "claimed"),
          ),
          sql`${researchAssignments.expiresAt} <= ${now}`,
        ),
      )
      .returning({
        id: researchAssignments.id,
        fromStatus: researchAssignments.status,
        lockVersion: researchAssignments.lockVersion,
      });
    if (expired.length)
      await this.db.insert(assignmentTransitions).values(
        expired.map((row) => ({
          id: randomUUID(),
          merchantId,
          assignmentId: row.id,
          fromStatus: row.fromStatus,
          toStatus: "expired",
          occurredAt: now,
          lockVersion: row.lockVersion,
          metadata: { reason: "claim_expired" },
        })),
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
        merchantName: merchants.name,
        momentId: researchMoments.id,
        momentName: researchMoments.name,
        momentStatus: researchMoments.status,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        orderSequence: orders.customerOrderSequence,
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
      .select({ title: orderLineItems.title, sku: orderLineItems.sku })
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
    return this.queueDto(
      row,
      products.map((item) => item.title ?? item.sku ?? "Product"),
      this.now(),
    );
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
      merchantName: string;
      momentId: string;
      momentName: string;
      totalMinor: number;
      currency: string;
      orderSequence: number | null;
      observed: unknown;
    },
    products: string[],
    now: Date,
  ): QueueItem {
    const observed = safeJson(row.observed);
    return {
      id: row.id,
      customerName: row.encryptedGivenName?.startsWith("synthetic:plain:")
        ? row.encryptedGivenName.slice(16)
        : "Synthetic customer",
      maskedPhone: maskPhone(row.encryptedPhone),
      merchant: row.merchantName,
      momentId: row.momentId,
      moment: row.momentName,
      eventAgeMinutes: Math.max(
        0,
        Math.floor((now.getTime() - row.createdAt.getTime()) / 60_000),
      ),
      orderSequence: row.orderSequence ?? 0,
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

  private async requireOwnedInterview(
    context: TenantContext,
    interviewId: string,
  ) {
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
    interviewId: string,
  ): Promise<InterviewWorkspace> {
    const interview = await this.requireOwnedInterview(context, interviewId);
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
          : interview.outcome === "no_answer"
            ? "no_answer"
            : "dialing",
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
