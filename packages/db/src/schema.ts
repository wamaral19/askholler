import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").primaryKey(),
    shopifyShopId: text("shopify_shop_id"),
    shopDomain: text("shop_domain"),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    weeklyInterviewTarget: integer("weekly_interview_target")
      .notNull()
      .default(0),
    status: text("status").notNull(),
    installedAt: timestamp("installed_at", { withTimezone: true }),
    uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("merchants_shopify_shop_id_uidx").on(table.shopifyShopId),
    uniqueIndex("merchants_shop_domain_uidx").on(table.shopDomain),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    shopifyCustomerId: text("shopify_customer_id"),
    orderCount: integer("order_count").notNull().default(0),
    lifetimeRevenueMinor: bigint("lifetime_revenue_minor", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency"),
    firstOrderAt: timestamp("first_order_at", { withTimezone: true }),
    latestOrderAt: timestamp("latest_order_at", { withTimezone: true }),
    historyCompleteness: jsonb("history_completeness").notNull(),
    contactabilityStatus: text("contactability_status")
      .notNull()
      .default("unknown"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customers_merchant_shopify_uidx").on(
      table.merchantId,
      table.shopifyCustomerId,
    ),
    index("customers_merchant_order_count_idx").on(
      table.merchantId,
      table.orderCount,
    ),
  ],
);

export const customerPrivate = pgTable("customer_private", {
  customerId: uuid("customer_id")
    .primaryKey()
    .references(() => customers.id),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  encryptedGivenName: text("encrypted_given_name"),
  encryptedPhoneE164: text("encrypted_phone_e164"),
  keyVersion: text("key_version").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    shopifyProductId: text("shopify_product_id").notNull(),
    title: text("title").notNull(),
    catalogEnrichmentState: text("catalog_enrichment_state")
      .notNull()
      .default("pending"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_merchant_shopify_uidx").on(
      table.merchantId,
      table.shopifyProductId,
    ),
  ],
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    source: text("source").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_categories_identity_uidx").on(
      table.merchantId,
      table.source,
      table.key,
    ),
  ],
);

export const productCategoryAssignments = pgTable(
  "product_category_assignments",
  {
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => productCategories.id),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.categoryId] }),
    index("product_category_assignments_lookup_idx").on(
      table.merchantId,
      table.categoryId,
      table.productId,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    customerId: uuid("customer_id").references(() => customers.id),
    shopifyOrderId: text("shopify_order_id").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
    }).notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    customerOrderSequence: integer("customer_order_sequence"),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    observedAttribution: jsonb("observed_attribution").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("orders_merchant_shopify_uidx").on(
      table.merchantId,
      table.shopifyOrderId,
    ),
    index("orders_customer_time_idx").on(
      table.merchantId,
      table.customerId,
      table.orderedAt,
    ),
  ],
);

export const orderLineItems = pgTable(
  "order_line_items",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    shopifyLineItemId: text("shopify_line_item_id").notNull(),
    productId: uuid("product_id").references(() => products.id),
    shopifyVariantId: text("shopify_variant_id"),
    sku: text("sku"),
    title: text("title"),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("order_line_items_source_uidx").on(
      table.merchantId,
      table.orderId,
      table.shopifyLineItemId,
    ),
    index("order_line_items_product_idx").on(table.merchantId, table.productId),
  ],
);

export const webhookReceipts = pgTable(
  "webhook_receipts",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id").references(() => merchants.id),
    provider: text("provider").notNull(),
    deliveryId: text("delivery_id").notNull(),
    topic: text("topic").notNull(),
    bodySha256: text("body_sha256").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processingStatus: text("processing_status").notNull(),
    errorCode: text("error_code"),
  },
  (table) => [
    uniqueIndex("webhook_receipts_delivery_uidx").on(
      table.provider,
      table.deliveryId,
    ),
  ],
);

export const commerceEvents = pgTable(
  "commerce_events",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    customerId: uuid("customer_id").references(() => customers.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    eventType: text("event_type").notNull(),
    source: text("source").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    schemaVersion: integer("schema_version").notNull(),
    attributes: jsonb("attributes").notNull(),
    observedAttribution: jsonb("observed_attribution").notNull(),
    correlationId: uuid("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("commerce_events_source_uidx").on(
      table.merchantId,
      table.source,
      table.sourceEventId,
    ),
    index("commerce_events_type_time_idx").on(
      table.merchantId,
      table.eventType,
      table.occurredAt,
    ),
  ],
);

export const scripts = pgTable("scripts", {
  id: uuid("id").primaryKey(),
  merchantId: uuid("merchant_id").references(() => merchants.id),
  name: text("name").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const scriptVersions = pgTable(
  "script_versions",
  {
    id: uuid("id").primaryKey(),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => scripts.id),
    merchantId: uuid("merchant_id").references(() => merchants.id),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    content: jsonb("content").notNull(),
    checksum: text("checksum").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("script_versions_version_uidx").on(
      table.scriptId,
      table.version,
    ),
  ],
);

export const researchFields = pgTable("research_fields", {
  id: uuid("id").primaryKey(),
  merchantId: uuid("merchant_id").references(() => merchants.id),
  key: text("key").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const researchFieldVersions = pgTable(
  "research_field_versions",
  {
    id: uuid("id").primaryKey(),
    researchFieldId: uuid("research_field_id")
      .notNull()
      .references(() => researchFields.id),
    version: integer("version").notNull(),
    definition: jsonb("definition").notNull(),
    status: text("status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("research_field_versions_version_uidx").on(
      table.researchFieldId,
      table.version,
    ),
  ],
);

export const researchFieldSets = pgTable("research_field_sets", {
  id: uuid("id").primaryKey(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  name: text("name").notNull(),
  ...timestamps,
});

export const researchFieldSetVersions = pgTable(
  "research_field_set_versions",
  {
    id: uuid("id").primaryKey(),
    researchFieldSetId: uuid("research_field_set_id")
      .notNull()
      .references(() => researchFieldSets.id),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("research_field_set_versions_version_uidx").on(
      table.researchFieldSetId,
      table.version,
    ),
  ],
);

export const researchFieldSetItems = pgTable(
  "research_field_set_items",
  {
    fieldSetVersionId: uuid("field_set_version_id")
      .notNull()
      .references(() => researchFieldSetVersions.id),
    fieldVersionId: uuid("field_version_id")
      .notNull()
      .references(() => researchFieldVersions.id),
    source: text("source").notNull(),
    required: boolean("required").notNull(),
    displayOrder: integer("display_order").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.fieldSetVersionId, table.fieldVersionId] }),
  ],
);

export const researchMoments = pgTable("research_moments", {
  id: uuid("id").primaryKey(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  name: text("name").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const researchMomentVersions = pgTable(
  "research_moment_versions",
  {
    id: uuid("id").primaryKey(),
    researchMomentId: uuid("research_moment_id")
      .notNull()
      .references(() => researchMoments.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    version: integer("version").notNull(),
    eventType: text("event_type").notNull(),
    objective: text("objective").notNull(),
    cohortExpression: jsonb("cohort_expression").notNull(),
    priority: integer("priority").notNull(),
    allocationPolicy: jsonb("allocation_policy").notNull(),
    scriptVersionId: uuid("script_version_id")
      .notNull()
      .references(() => scriptVersions.id),
    researchFieldSetVersionId: uuid("research_field_set_version_id")
      .notNull()
      .references(() => researchFieldSetVersions.id),
    activeFrom: timestamp("active_from", { withTimezone: true }),
    activeTo: timestamp("active_to", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("research_moment_versions_version_uidx").on(
      table.researchMomentId,
      table.version,
    ),
  ],
);

export const qualificationEvaluations = pgTable(
  "qualification_evaluations",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    commerceEventId: uuid("commerce_event_id")
      .notNull()
      .references(() => commerceEvents.id),
    researchMomentVersionId: uuid("research_moment_version_id")
      .notNull()
      .references(() => researchMomentVersions.id),
    engineVersion: text("engine_version").notNull(),
    outcome: text("outcome").notNull(),
    reasonCodes: text("reason_codes").array().notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("qualification_evaluations_idempotency_uidx").on(
      table.commerceEventId,
      table.researchMomentVersionId,
      table.engineVersion,
    ),
  ],
);

export const researchAssignments = pgTable(
  "research_assignments",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    researchMomentVersionId: uuid("research_moment_version_id")
      .notNull()
      .references(() => researchMomentVersions.id),
    qualificationEvaluationId: uuid("qualification_evaluation_id")
      .notNull()
      .references(() => qualificationEvaluations.id),
    commerceEventId: uuid("commerce_event_id")
      .notNull()
      .references(() => commerceEvents.id),
    customerId: uuid("customer_id").references(() => customers.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    scriptVersionId: uuid("script_version_id")
      .notNull()
      .references(() => scriptVersions.id),
    researchFieldSetVersionId: uuid("research_field_set_version_id")
      .notNull()
      .references(() => researchFieldSetVersions.id),
    priority: integer("priority").notNull(),
    status: text("status").notNull(),
    assignedResearcherId: uuid("assigned_researcher_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    interviewStartedAt: timestamp("interview_started_at", {
      withTimezone: true,
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lockVersion: integer("lock_version").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("research_assignments_event_moment_uidx").on(
      table.commerceEventId,
      table.researchMomentVersionId,
    ),
    index("research_assignments_queue_idx").on(
      table.merchantId,
      table.status,
      table.priority,
      table.createdAt,
    ),
  ],
);

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    researchAssignmentId: uuid("research_assignment_id")
      .notNull()
      .references(() => researchAssignments.id),
    researcherId: uuid("researcher_id").notNull(),
    scriptVersionId: uuid("script_version_id")
      .notNull()
      .references(() => scriptVersions.id),
    researchFieldSetVersionId: uuid("research_field_set_version_id")
      .notNull()
      .references(() => researchFieldSetVersions.id),
    status: text("status").notNull(),
    outcome: text("outcome"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    recordingConsent: text("recording_consent")
      .notNull()
      .default("not_requested"),
    transcriptStatus: text("transcript_status")
      .notNull()
      .default("not_requested"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("interviews_assignment_uidx").on(table.researchAssignmentId),
    index("interviews_assignment_idx").on(
      table.merchantId,
      table.researchAssignmentId,
    ),
  ],
);

export const assignmentTransitions = pgTable(
  "assignment_transitions",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => researchAssignments.id),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    actorId: uuid("actor_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    lockVersion: integer("lock_version").notNull(),
    metadata: jsonb("metadata").notNull(),
  },
  (table) => [
    uniqueIndex("assignment_transitions_version_uidx").on(
      table.merchantId,
      table.assignmentId,
      table.lockVersion,
    ),
  ],
);

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    objectKey: text("object_key").notNull(),
    status: text("status").notNull(),
    consentStatus: text("consent_status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("recordings_interview_uidx").on(
      table.merchantId,
      table.interviewId,
    ),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id),
    provider: text("provider").notNull(),
    providerCallRef: text("provider_call_ref"),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    errorCode: text("error_code"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("calls_provider_ref_uidx").on(
      table.provider,
      table.providerCallRef,
    ),
  ],
);

export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  interviewId: uuid("interview_id")
    .notNull()
    .references(() => interviews.id),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  revision: integer("revision").notNull().default(1),
  language: text("language").notNull(),
  status: text("status").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id),
    sequence: integer("sequence").notNull(),
    speaker: text("speaker").notNull(),
    startMs: integer("start_ms"),
    endMs: integer("end_ms"),
    text: text("text").notNull(),
    redactionStatus: text("redaction_status").notNull().default("unreviewed"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("transcript_segments_sequence_uidx").on(
      table.transcriptId,
      table.sequence,
    ),
  ],
);

export const interviewResponses = pgTable(
  "interview_responses",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id),
    researchFieldVersionId: uuid("research_field_version_id")
      .notNull()
      .references(() => researchFieldVersions.id),
    researchFieldSetVersionId: uuid("research_field_set_version_id")
      .notNull()
      .references(() => researchFieldSetVersions.id),
    version: integer("version").notNull().default(1),
    value: jsonb("value").notNull(),
    provenance: text("provenance").notNull(),
    provenanceDetails: jsonb("provenance_details").notNull(),
    reviewStatus: text("review_status").notNull(),
    createdBy: uuid("created_by"),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    supersedesResponseId: uuid("supersedes_response_id"),
    conflictsWithResponseId: uuid("conflicts_with_response_id"),
    ...timestamps,
  },
  (table) => [
    index("interview_responses_field_idx").on(
      table.merchantId,
      table.interviewId,
      table.researchFieldVersionId,
    ),
  ],
);

export const responseEvidence = pgTable(
  "response_evidence",
  {
    responseId: uuid("response_id")
      .notNull()
      .references(() => interviewResponses.id),
    transcriptSegmentId: uuid("transcript_segment_id")
      .notNull()
      .references(() => transcriptSegments.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    startChar: integer("start_char").notNull(),
    endChar: integer("end_char").notNull(),
    excerptSnapshot: text("excerpt_snapshot"),
  },
  (table) => [
    primaryKey({
      columns: [table.responseId, table.transcriptSegmentId, table.startChar],
    }),
  ],
);

export const interviewObservations = pgTable(
  "interview_observations",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id),
    researcherId: uuid("researcher_id").notNull(),
    source: text("source").notNull().default("researcher_observed"),
    observationType: text("observation_type").notNull(),
    note: text("note").notNull(),
    interviewOffsetSeconds: integer("interview_offset_seconds"),
    interviewOffsetMs: integer("interview_offset_ms"),
    scriptPromptKey: text("script_prompt_key"),
    researchFieldVersionId: uuid("research_field_version_id").references(
      () => researchFieldVersions.id,
    ),
    ...timestamps,
  },
  (table) => [
    index("interview_observations_interview_idx").on(
      table.merchantId,
      table.interviewId,
    ),
  ],
);

export const angles = pgTable(
  "angles",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    reportingPeriodStart: timestamp("reporting_period_start", {
      withTimezone: true,
    }).notNull(),
    reportingPeriodEnd: timestamp("reporting_period_end", {
      withTimezone: true,
    }).notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    index("angles_period_idx").on(
      table.merchantId,
      table.reportingPeriodStart,
      table.reportingPeriodEnd,
    ),
  ],
);

export const angleRevisions = pgTable(
  "angle_revisions",
  {
    id: uuid("id").primaryKey(),
    angleId: uuid("angle_id")
      .notNull()
      .references(() => angles.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    researchQuestion: text("research_question").notNull(),
    cohortDefinition: jsonb("cohort_definition").notNull(),
    recommendedAction: text("recommended_action"),
    caveat: text("caveat").notNull(),
    status: text("status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("angle_revisions_version_uidx").on(
      table.angleId,
      table.revision,
    ),
  ],
);

export const angleEvidence = pgTable(
  "angle_evidence",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    angleRevisionId: uuid("angle_revision_id")
      .notNull()
      .references(() => angleRevisions.id),
    responseId: uuid("response_id")
      .notNull()
      .references(() => interviewResponses.id),
    transcriptSegmentId: uuid("transcript_segment_id")
      .notNull()
      .references(() => transcriptSegments.id),
    displayOrder: integer("display_order").notNull(),
  },
  (table) => [
    uniqueIndex("angle_evidence_order_uidx").on(
      table.angleRevisionId,
      table.displayOrder,
    ),
  ],
);

export const angleMetrics = pgTable("angle_metrics", {
  id: uuid("id").primaryKey(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id),
  angleRevisionId: uuid("angle_revision_id")
    .notNull()
    .references(() => angleRevisions.id),
  name: text("name").notNull(),
  population: text("population").notNull(),
  numerator: bigint("numerator", { mode: "number" }),
  denominator: bigint("denominator", { mode: "number" }),
  value: text("value").notNull(),
  unit: text("unit").notNull(),
  cohortSnapshot: jsonb("cohort_snapshot").notNull(),
  calculationVersion: text("calculation_version").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
});

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    displayMonth: text("display_month").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("reports_period_uidx").on(
      table.merchantId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const reportRevisions = pgTable(
  "report_revisions",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    executiveSummary: text("executive_summary").notNull(),
    methodology: text("methodology").notNull(),
    sampleNotes: text("sample_notes").notNull(),
    templateVersion: text("template_version").notNull(),
    status: text("status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("report_revisions_version_uidx").on(
      table.reportId,
      table.revision,
    ),
  ],
);

export const reportAngles = pgTable(
  "report_angles",
  {
    reportRevisionId: uuid("report_revision_id")
      .notNull()
      .references(() => reportRevisions.id),
    angleRevisionId: uuid("angle_revision_id")
      .notNull()
      .references(() => angleRevisions.id),
    section: text("section").notNull(),
    displayOrder: integer("display_order").notNull(),
    promotedToExecutiveSummary: boolean(
      "promoted_to_executive_summary",
    ).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reportRevisionId, table.angleRevisionId] }),
  ],
);

export const reportArtifacts = pgTable(
  "report_artifacts",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    reportRevisionId: uuid("report_revision_id")
      .notNull()
      .references(() => reportRevisions.id),
    format: text("format").notNull(),
    contentSha256: text("content_sha256").notNull(),
    objectKey: text("object_key"),
    inlineContent: text("inline_content"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("report_artifacts_render_uidx").on(
      table.merchantId,
      table.reportRevisionId,
      table.format,
      table.contentSha256,
    ),
  ],
);

export const durableJobs = pgTable(
  "durable_jobs",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    jobType: text("job_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("durable_jobs_idempotency_uidx").on(
      table.merchantId,
      table.jobType,
      table.idempotencyKey,
    ),
    index("durable_jobs_poll_idx").on(
      table.status,
      table.availableAt,
      table.createdAt,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    metadata: jsonb("metadata").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_subject_idx").on(
      table.merchantId,
      table.subjectType,
      table.subjectId,
      table.occurredAt,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    merchantId: uuid("merchant_id").references(() => merchants.id),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("outbox_events_idempotency_uidx").on(table.idempotencyKey),
  ],
);
