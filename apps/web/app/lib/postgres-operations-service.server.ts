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
  merchants,
  orderLineItems,
  orders,
  outboxEvents,
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
  researchFieldDefinitionV1Schema,
} from "@holler/domain";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type {
  InterviewWorkspace,
  OperationsApplicationService,
  QueueItem,
  SaveMomentInput,
  TenantContext,
} from "./operations-types";
import type { PrototypeResearchField } from "./prototype-data";
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
    return [...newest.values()].map((row) => {
      const allocation = safeJson(row.allocationPolicy);
      return {
        id: row.id,
        name: row.name,
        objective: row.objective,
        status: row.publishedAt
          ? row.momentStatus === "active"
            ? ("active" as const)
            : ("paused" as const)
          : ("draft" as const),
        trigger: row.eventType.replaceAll("_", " "),
        cohortSummary: JSON.stringify(row.cohortExpression),
        weeklyTarget:
          typeof allocation.weeklyCap === "number" ? allocation.weeklyCap : 0,
        fieldCount: row.fieldCount,
        scriptVersion: `${row.scriptName} v${row.scriptVersion}`,
        qualifiedThisWeek: 0,
      };
    });
  }

  async listResearchFields(
    context: TenantContext,
  ): Promise<readonly PrototypeResearchField[]> {
    await this.requireMerchant(context);
    const rows = await this.db
      .select({
        id: researchFieldVersions.id,
        definition: researchFieldVersions.definition,
        merchantId: researchFields.merchantId,
      })
      .from(researchFieldVersions)
      .innerJoin(
        researchFields,
        eq(researchFields.id, researchFieldVersions.researchFieldId),
      )
      .where(
        and(
          eq(researchFieldVersions.status, "published"),
          or(
            isNull(researchFields.merchantId),
            eq(researchFields.merchantId, context.merchantId),
          ),
        ),
      )
      .orderBy(asc(researchFields.name), desc(researchFieldVersions.version));
    return rows.flatMap((row) => {
      const parsed = researchFieldDefinitionV1Schema.safeParse(row.definition);
      if (!parsed.success) return [];
      return [
        {
          id: row.id,
          label: parsed.data.label,
          prompt: parsed.data.prompt,
          source: row.merchantId
            ? ("merchant_default" as const)
            : ("platform_default" as const),
          required: parsed.data.required,
          valueType:
            parsed.data.valueType === "rating_scale"
              ? ("rating_scale" as const)
              : parsed.data.valueType === "single_select"
                ? ("single_select" as const)
                : ("long_text" as const),
          ...(parsed.data.options
            ? { options: parsed.data.options.map((option) => option.label) }
            : {}),
        },
      ];
    });
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
    return this.db.transaction(async (tx) => {
      const [script] = await tx
        .select({ id: scriptVersions.id })
        .from(scriptVersions)
        .innerJoin(scripts, eq(scripts.id, scriptVersions.scriptId))
        .where(
          and(
            eq(scriptVersions.status, "published"),
            or(
              isNull(scriptVersions.merchantId),
              eq(scriptVersions.merchantId, context.merchantId),
            ),
            or(
              isNull(scripts.merchantId),
              eq(scripts.merchantId, context.merchantId),
            ),
          ),
        )
        .orderBy(desc(scriptVersions.publishedAt), desc(scriptVersions.version))
        .limit(1);
      if (!script) throw new OperationsError("PINNED_SCRIPT_UNAVAILABLE", 400);

      const selected = [...new Set(input.fieldIds)];
      const customFields = [
        ...new Set(input.customFields.map((field) => field.trim())),
      ];
      if (
        customFields.some((field) => !field || field.length > 160) ||
        customFields.length > 20
      )
        throw new OperationsError("INVALID_FIELD_SET", 400);
      if (!selected.length && !customFields.length)
        throw new OperationsError("FIELD_SET_REQUIRED", 400);
      const validFields = await tx
        .select({ id: researchFieldVersions.id })
        .from(researchFieldVersions)
        .innerJoin(
          researchFields,
          eq(researchFields.id, researchFieldVersions.researchFieldId),
        )
        .where(
          and(
            inArray(researchFieldVersions.id, selected),
            eq(researchFieldVersions.status, "published"),
            or(
              isNull(researchFields.merchantId),
              eq(researchFields.merchantId, context.merchantId),
            ),
          ),
        );
      if (validFields.length !== selected.length)
        throw new OperationsError("INVALID_FIELD_SET", 400);

      const identity = createHash("sha256")
        .update(
          JSON.stringify({
            merchantId: context.merchantId,
            input,
            cohort: cohort.data,
          }),
        )
        .digest("hex");
      for (const [index, label] of customFields.entries()) {
        const fieldId = stableUuid(`custom-field:${identity}:${index}`);
        const fieldVersionId = stableUuid(
          `custom-field-version:${identity}:${index}`,
        );
        const key = `custom_${createHash("sha256").update(label).digest("hex").slice(0, 16)}`;
        await tx
          .insert(researchFields)
          .values({
            id: fieldId,
            merchantId: context.merchantId,
            key,
            name: label,
            status: input.publish ? "published" : "draft",
          })
          .onConflictDoNothing();
        await tx
          .insert(researchFieldVersions)
          .values({
            id: fieldVersionId,
            researchFieldId: fieldId,
            version: 1,
            definition: {
              schemaVersion: 1,
              key,
              label,
              prompt: label,
              valueType: "long_text",
              required: false,
              evidenceExpected: false,
              attributionSemantic: null,
              completionMode: "live",
            },
            status: input.publish ? "published" : "draft",
            publishedAt: input.publish ? this.now() : null,
          })
          .onConflictDoNothing();
        selected.push(fieldVersionId);
      }
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
          selected.map((fieldVersionId, index) => ({
            fieldSetVersionId,
            fieldVersionId,
            source: "research_run",
            required: true,
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
          scriptVersionId: script.id,
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
        momentName: researchMoments.name,
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
    const idempotencyKey = `report.render.requested:${reportId}:1`;
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
          eventType: "report.render.requested",
          payload: {
            reportId,
            reportRevisionId: revisionId,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
            format: "html",
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
        momentName: researchMoments.name,
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
    const content = safeJson(script.content);
    const prompts = Array.isArray(content.prompts) ? content.prompts : [];
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
      script: prompts.map((prompt, index) =>
        typeof prompt === "string"
          ? { id: `prompt-${index + 1}`, title: `Prompt ${index + 1}`, prompt }
          : {
              id: textValue(safeJson(prompt).id, `prompt-${index + 1}`),
              title: textValue(safeJson(prompt).title, `Prompt ${index + 1}`),
              prompt: textValue(safeJson(prompt).prompt, ""),
            },
      ),
      fields: fields.flatMap((field) => {
        const parsed = researchFieldDefinitionV1Schema.safeParse(
          field.definition,
        );
        if (!parsed.success) return [];
        return [
          {
            id: field.id,
            label: parsed.data.label,
            prompt: parsed.data.prompt,
            source:
              field.source === "platform_default" ||
              field.source === "merchant_default"
                ? field.source
                : ("research_run" as const),
            required: field.required,
            valueType:
              parsed.data.valueType === "rating_scale"
                ? ("rating_scale" as const)
                : parsed.data.valueType === "single_select"
                  ? ("single_select" as const)
                  : ("long_text" as const),
            ...(parsed.data.options
              ? { options: parsed.data.options.map((option) => option.label) }
              : {}),
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
