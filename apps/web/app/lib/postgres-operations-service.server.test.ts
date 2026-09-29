import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedTestDatabase,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";

import {
  OperationsError,
  PostgresOperationsApplicationService,
  PrefixedSyntheticPhoneDecryptor,
} from "./postgres-operations-service.server";
import type { TenantContext } from "./operations-types";

const databaseUrl = testDatabaseUrl();
const ids = {
  merchantA: "00000000-0000-7000-8000-000000001001",
  merchantB: "00000000-0000-7000-8000-000000001002",
  researcherA: "00000000-0000-7000-8000-000000001003",
  researcherB: "00000000-0000-7000-8000-000000001004",
  customer: "00000000-0000-7000-8000-000000001005",
  order: "00000000-0000-7000-8000-000000001006",
  line: "00000000-0000-7000-8000-000000001007",
  event: "00000000-0000-7000-8000-000000001008",
  script: "00000000-0000-7000-8000-000000001009",
  scriptVersion: "00000000-0000-7000-8000-000000001010",
  field: "00000000-0000-7000-8000-000000001011",
  fieldVersion: "00000000-0000-7000-8000-000000001012",
  set: "00000000-0000-7000-8000-000000001013",
  setVersion: "00000000-0000-7000-8000-000000001014",
  moment: "00000000-0000-7000-8000-000000001015",
  momentVersion: "00000000-0000-7000-8000-000000001016",
  evaluation: "00000000-0000-7000-8000-000000001017",
  assignment: "00000000-0000-7000-8000-000000001018",
  correlation: "00000000-0000-7000-8000-000000001019",
} as const;

const now = new Date("2026-09-18T16:00:00.000Z");
const contextA: TenantContext = {
  merchantId: ids.merchantA,
  merchantIds: [ids.merchantA],
  researcherId: ids.researcherA,
  correlationId: ids.correlation,
  roles: ["researcher"],
};

describe.skipIf(databaseUrl === undefined)(
  "PostgreSQL operations application service",
  () => {
    let isolated: IsolatedTestDatabase;
    let service: PostgresOperationsApplicationService;

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
      service = new PostgresOperationsApplicationService(
        isolated.db,
        new PrefixedSyntheticPhoneDecryptor(),
        () => now,
      );
      const setupStatements = [
        sql`
        insert into merchants (id, name, timezone, status)
        values (${ids.merchantA}, 'Synthetic Merchant A', 'UTC', 'active'),
               (${ids.merchantB}, 'Synthetic Merchant B', 'UTC', 'active')`,
        sql`insert into customers (id, merchant_id, order_count, history_completeness, contactability_status)
        values (${ids.customer}, ${ids.merchantA}, 1, '{}'::jsonb, 'eligible')`,
        sql`insert into customer_private (customer_id, merchant_id, encrypted_given_name, encrypted_phone_e164, key_version)
        values (${ids.customer}, ${ids.merchantA}, 'synthetic:plain:Avery', 'synthetic:v1:+12025550123', 'synthetic-v1')`,
        sql`insert into orders (id, merchant_id, customer_id, shopify_order_id, ordered_at, source_updated_at, total_minor, currency, customer_order_sequence, observed_attribution)
        values (${ids.order}, ${ids.merchantA}, ${ids.customer}, 'synthetic-order-1', ${now}, ${now}, 12800, 'USD', 1, '{"source":"meta","channel":"paid_social"}'::jsonb)`,
        sql`insert into order_line_items (id, merchant_id, order_id, shopify_line_item_id, sku, title, quantity, unit_price_minor, currency)
        values (${ids.line}, ${ids.merchantA}, ${ids.order}, 'synthetic-line-1', 'SYN-1', 'Synthetic trouser', 1, 12800, 'USD')`,
        sql`insert into commerce_events (id, merchant_id, customer_id, order_id, event_type, source, source_event_id, occurred_at, ingested_at, schema_version, attributes, observed_attribution, correlation_id)
        values (${ids.event}, ${ids.merchantA}, ${ids.customer}, ${ids.order}, 'order_completed', 'synthetic', 'synthetic-event-1', ${now}, ${now}, 1, '{}'::jsonb, '{}'::jsonb, ${ids.correlation})`,
        sql`insert into scripts (id, merchant_id, name, status)
        values (${ids.script}, ${ids.merchantA}, 'Synthetic interview', 'published')`,
        sql`insert into script_versions (id, script_id, merchant_id, version, status, content, checksum, published_at)
        values (${ids.scriptVersion}, ${ids.script}, ${ids.merchantA}, 1, 'published', '{"prompts":[{"id":"intro","title":"Intro","prompt":"Ask the synthetic customer."}]}'::jsonb, 'synthetic-script-v1', ${now})`,
        sql`insert into research_fields (id, merchant_id, key, name, status)
        values (${ids.field}, null, 'discovery_source', 'Discovery source', 'published')`,
        sql`insert into research_field_versions (id, research_field_id, version, definition, status, published_at)
        values (${ids.fieldVersion}, ${ids.field}, 1, '{"schemaVersion":1,"key":"discovery_source","label":"Discovery source","prompt":"Where did you discover us?","valueType":"single_select","options":[{"key":"creator","label":"Creator"}],"required":true,"evidenceExpected":false,"attributionSemantic":"self_reported_discovery","completionMode":"live"}'::jsonb, 'published', ${now})`,
        sql`insert into research_field_sets (id, merchant_id, name) values (${ids.set}, ${ids.merchantA}, 'Synthetic fields')`,
        sql`insert into research_field_set_versions (id, research_field_set_id, version, status, published_at) values (${ids.setVersion}, ${ids.set}, 1, 'published', ${now})`,
        sql`insert into research_field_set_items (field_set_version_id, field_version_id, source, required, display_order) values (${ids.setVersion}, ${ids.fieldVersion}, 'platform_default', true, 0)`,
        sql`insert into research_moments (id, merchant_id, name, status) values (${ids.moment}, ${ids.merchantA}, 'Attribution audit', 'active')`,
        sql`insert into research_moment_versions (id, research_moment_id, merchant_id, version, event_type, objective, cohort_expression, priority, allocation_policy, script_version_id, research_field_set_version_id, active_from, published_at)
        values (${ids.momentVersion}, ${ids.moment}, ${ids.merchantA}, 1, 'order_completed', 'Compare observed and self-reported discovery', '{"predicate":"customer.order_sequence","version":1,"config":{"operator":"equals","value":1}}'::jsonb, 80, '{"weeklyCap":10}'::jsonb, ${ids.scriptVersion}, ${ids.setVersion}, ${now}, ${now})`,
        sql`insert into qualification_evaluations (id, merchant_id, commerce_event_id, research_moment_version_id, engine_version, outcome, reason_codes, input_snapshot, evaluated_at)
        values (${ids.evaluation}, ${ids.merchantA}, ${ids.event}, ${ids.momentVersion}, 'test-v1', 'qualified', array['QUALIFIED'], '{}'::jsonb, ${now})`,
        sql`insert into research_assignments (id, merchant_id, research_moment_version_id, qualification_evaluation_id, commerce_event_id, customer_id, order_id, script_version_id, research_field_set_version_id, priority, status, expires_at)
        values (${ids.assignment}, ${ids.merchantA}, ${ids.momentVersion}, ${ids.evaluation}, ${ids.event}, ${ids.customer}, ${ids.order}, ${ids.scriptVersion}, ${ids.setVersion}, 80, 'queued', ${new Date(now.getTime() + 3_600_000)})`,
      ];
      for (const statement of setupStatements)
        await isolated.db.execute(statement);
    }, 30_000);

    afterAll(async () => isolated?.close());

    it("lists durable moments and saves retry-idempotent draft/published definitions", async () => {
      const [moment] = await service.listMoments(contextA);
      expect(moment).toMatchObject({
        cohortSummary: "The customer's first order.",
        completedThisWeek: 0,
        weeklyTarget: 10,
      });
      expect(await service.listMoments(contextA)).toHaveLength(1);
      const input = {
        name: "Synthetic repeat study",
        objective: "Understand the repeat trigger",
        weeklyTarget: 5,
        cohortExpression: {
          predicate: "customer.order_sequence",
          version: 1,
          config: { operator: "equals", value: 2 },
        },
        fields: [
          { kind: "library", fieldVersionId: ids.fieldVersion, required: true },
        ],
        publish: false,
      } as const;
      const first = await service.saveMoment(contextA, input);
      expect(await service.saveMoment(contextA, input)).toEqual(first);
      await expect(
        service.saveMoment({ ...contextA, merchantId: ids.merchantB }, input),
      ).rejects.toMatchObject({ code: "PINNED_SCRIPT_UNAVAILABLE" });
    });

    it("lists only the merchants the workforce identity may select", async () => {
      expect(await service.listMerchants(contextA)).toEqual([
        { id: ids.merchantA, name: "Synthetic Merchant A" },
      ]);
      expect(
        await service.listMerchants({
          ...contextA,
          merchantIds: [ids.merchantB, ids.merchantA],
        }),
      ).toEqual([
        { id: ids.merchantA, name: "Synthetic Merchant A" },
        { id: ids.merchantB, name: "Synthetic Merchant B" },
      ]);
    });

    it("pauses, completes, and reopens moments; completed moments leave the queue", async () => {
      const manager: TenantContext = { ...contextA, roles: ["merchant_admin"] };
      await expect(
        service.setMomentStatus(contextA, ids.moment, "paused"),
      ).rejects.toMatchObject({ code: "MOMENT_MANAGER_ROLE_REQUIRED" });
      await expect(
        service.setMomentStatus(
          { ...manager, merchantId: ids.merchantB },
          ids.moment,
          "paused",
        ),
      ).rejects.toMatchObject({ code: "RESEARCH_MOMENT_NOT_FOUND" });

      expect(
        await service.setMomentStatus(manager, ids.moment, "paused"),
      ).toMatchObject({ status: "paused" });
      // Paused moments keep the work already waiting for them.
      expect(await service.listQueue(contextA)).toHaveLength(1);
      await expect(
        service.setMomentStatus(manager, ids.moment, "paused"),
      ).rejects.toMatchObject({ code: "INVALID_MOMENT_TRANSITION" });

      await service.setMomentStatus(manager, ids.moment, "completed");
      expect(await service.listQueue(contextA)).toHaveLength(0);
      const audit = await isolated.db.execute(
        sql`select action from audit_events where subject_id = ${ids.moment} order by occurred_at desc limit 1`,
      );
      expect(audit.rows[0]).toMatchObject({
        action: "research_moment.status_changed",
      });

      expect(
        await service.setMomentStatus(manager, ids.moment, "live"),
      ).toMatchObject({ status: "live" });
      expect(await service.listQueue(contextA)).toHaveLength(1);
      const persisted = await isolated.db.execute(
        sql`select status from research_moments where id = ${ids.moment}`,
      );
      // The worker qualifies orders only for "active" moments.
      expect(persisted.rows[0]).toMatchObject({ status: "active" });
    });

    it("returns a masked queue DTO and permits only one concurrent claimant", async () => {
      const [queued] = await service.listQueue(contextA);
      expect(queued).toMatchObject({
        maskedPhone: "+1 ••• ••• 0123",
        lockVersion: 0,
      });
      expect(JSON.stringify(queued)).not.toContain("+12025550123");
      expect(JSON.stringify(queued)).not.toContain("encryptedPhone");
      const contextB = { ...contextA, researcherId: ids.researcherB };
      const results = await Promise.allSettled([
        service.claimAssignment(contextA, ids.assignment, 0),
        service.claimAssignment(contextB, ids.assignment, 0),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const winner = results.find((result) => result.status === "fulfilled");
      const winnerId =
        winner?.status === "fulfilled"
          ? winner.value.claimedByResearcherId
          : undefined;
      expect([ids.researcherA, ids.researcherB]).toContain(winnerId);
      if (winnerId === ids.researcherB) {
        await service.releaseAssignment(contextB, ids.assignment, 1);
        await service.claimAssignment(contextA, ids.assignment, 2);
      }
    });

    it("audits reveal, starts idempotently, persists capture, and completes", async () => {
      await expect(
        service.revealPhone(
          { ...contextA, merchantId: ids.merchantB },
          ids.assignment,
        ),
      ).rejects.toBeInstanceOf(OperationsError);
      await expect(
        service.revealPhone(
          { ...contextA, researcherId: ids.researcherB },
          ids.assignment,
        ),
      ).rejects.toMatchObject({ code: "PHONE_REVEAL_DENIED" });
      await expect(
        service.revealPhone(contextA, ids.assignment),
      ).resolves.toEqual({ phone: "+12025550123" });

      const queue = await service.listQueue(contextA);
      const claimed = queue.find((item) => item.id === ids.assignment)!;
      const interview = await service.startInterview(
        contextA,
        ids.assignment,
        claimed.lockVersion,
      );
      expect(
        await service.startInterview(contextA, ids.assignment, 999),
      ).toEqual(interview);
      expect(interview.fields.map((field) => field.id)).toEqual([
        ids.fieldVersion,
      ]);
      await service.saveResponse(
        contextA,
        interview.id,
        ids.fieldVersion,
        "creator",
      );
      await service.saveResponse(
        contextA,
        interview.id,
        ids.fieldVersion,
        "creator",
      );
      await service.addObservation(
        contextA,
        interview.id,
        "hesitation",
        "Synthetic hesitation",
      );
      await service.addObservation(
        contextA,
        interview.id,
        "hesitation",
        "Synthetic hesitation",
      );
      await service.completeInterview(contextA, interview.id, "completed");
      const [moment] = await service.listMoments(contextA);
      expect(moment?.completedThisWeek).toBe(1);

      const result = await isolated.db.execute(sql`
        select
          (select count(*)::int from interviews where research_assignment_id = ${ids.assignment}) interviews,
          (select count(*)::int from interview_responses where interview_id = ${interview.id}) responses,
          (select count(*)::int from interview_observations where interview_id = ${interview.id}) observations,
          (select count(*)::int from audit_events where subject_id = ${ids.assignment} and action = 'customer_private.phone_revealed' and metadata::text not like '%+12025550123%') safe_reveal_audits,
          (select status from research_assignments where id = ${ids.assignment}) assignment_status
      `);
      expect(result.rows[0]).toEqual({
        interviews: 1,
        responses: 1,
        observations: 1,
        safe_reveal_audits: 1,
        assignment_status: "completed",
      });
    });

    it("creates one report/revision and one safe outbox event atomically", async () => {
      const first = await service.generateReport(contextA, "2026-08");
      expect(await service.generateReport(contextA, "2026-08")).toEqual(first);
      const result = await isolated.db.execute(sql`
        select
          (select count(*)::int from reports where id = ${first.reportId}) reports,
          (select count(*)::int from report_revisions where report_id = ${first.reportId}) revisions,
          (select count(*)::int from outbox_events where aggregate_type = 'report_revision' and event_type = 'render_report') outbox,
          (select count(*)::int from outbox_events where payload::text ~* 'phone|email|transcript|observation|response') unsafe_payloads
      `);
      expect(result.rows[0]).toEqual({
        reports: 1,
        revisions: 1,
        outbox: 1,
        unsafe_payloads: 0,
      });

      await expect(
        service.generateReport(
          { ...contextA, correlationId: "not-a-uuid" },
          "2026-09",
        ),
      ).rejects.toThrow();
      const rollback = await isolated.db.execute(
        sql`select count(*)::int count from reports where display_month = '2026-09'`,
      );
      expect(rollback.rows[0]?.count).toBe(0);
    });

    const managerA: TenantContext = {
      ...contextA,
      roles: ["research_manager"],
    };
    const repeatStudy = {
      objective: "Understand the repeat trigger",
      weeklyTarget: 5,
      cohortExpression: {
        predicate: "customer.order_sequence",
        version: 1,
        config: { operator: "equals", value: 2 },
      },
      publish: true,
    } as const;

    it("keeps an ordered field library with merchant defaults and versioned edits", async () => {
      await expect(
        service.saveResearchField(contextA, undefined, {
          label: "Unauthorized",
          prompt: "?",
          valueType: "long_text",
          options: [],
        }),
      ).rejects.toMatchObject({ code: "MOMENT_MANAGER_ROLE_REQUIRED" });

      const { fieldId } = await service.saveResearchField(managerA, undefined, {
        label: "Texture expectation",
        prompt: "What texture did you expect?",
        valueType: "single_select",
        options: ["Light", "Rich", ""],
      });
      let library = await service.listResearchFields(managerA);
      // Platform fields without saved defaults come first; new fields append.
      expect(library.at(-1)).toMatchObject({
        fieldId,
        options: ["Light", "Rich"],
        includedByDefault: true,
        editable: true,
      });
      expect(library.filter((field) => field.editable)).toHaveLength(1);

      const others = library.filter((field) => field.fieldId !== fieldId);
      await service.saveFieldDefaults(managerA, [
        { fieldId, includedByDefault: true, requiredByDefault: true },
        ...others.map((field) => ({
          fieldId: field.fieldId,
          includedByDefault: field.fieldId !== ids.field,
          requiredByDefault: false,
        })),
      ]);
      library = await service.listResearchFields(managerA);
      expect(library.map((field) => field.fieldId)).toEqual([
        fieldId,
        ...others.map((field) => field.fieldId),
      ]);
      expect(library[0]).toMatchObject({
        required: true,
        includedByDefault: true,
      });
      expect(
        library.find((field) => field.fieldId === ids.field),
      ).toMatchObject({ required: false, includedByDefault: false });
      // Another merchant's defaults are untouched.
      const other = await service.listResearchFields({
        ...managerA,
        merchantId: ids.merchantB,
        merchantIds: [ids.merchantB],
      });
      expect(other.find((field) => field.fieldId === ids.field)).toMatchObject({
        required: true,
        includedByDefault: true,
      });
      // Defaults are per merchant; platform fields stay shared.
      await expect(
        service.saveResearchField(managerA, ids.field, {
          label: "Renamed",
          prompt: "?",
          valueType: "long_text",
          options: [],
        }),
      ).rejects.toMatchObject({ code: "PLATFORM_FIELD_LOCKED" });

      const firstVersionId = library[0]!.id;
      await service.saveResearchField(managerA, fieldId, {
        label: "Texture expectation",
        prompt: "How did the texture compare to what you expected?",
        valueType: "single_select",
        options: ["Rich", "Light", "Balanced"],
      });
      library = await service.listResearchFields(managerA);
      expect(library[0]).toMatchObject({
        fieldId,
        version: 2,
        prompt: "How did the texture compare to what you expected?",
        required: true,
      });
      expect(library[0]!.id).not.toBe(firstVersionId);
      const versions = await isolated.db.execute(sql`
        select status, definition->'options' as options
        from research_field_versions where research_field_id = ${fieldId}
        order by version`);
      expect(versions.rows.map((row) => row.status)).toEqual([
        "superseded",
        "published",
      ]);
      // Option keys survive reordering so answers stay comparable.
      expect(versions.rows[1]?.options).toEqual([
        { key: "rich", label: "Rich" },
        { key: "light", label: "Light" },
        { key: "balanced", label: "Balanced" },
      ]);

      await service.setResearchFieldArchived(managerA, fieldId, true);
      expect(
        (await service.listResearchFields(managerA)).map((f) => f.fieldId),
      ).not.toContain(fieldId);
      await service.setResearchFieldArchived(managerA, fieldId, false);
    });

    it("saves builder-created fields to the library and reuses them by label", async () => {
      const first = await service.saveMoment(contextA, {
        ...repeatStudy,
        name: "Fields study one",
        fields: [
          {
            kind: "library",
            fieldVersionId: ids.fieldVersion,
            required: false,
          },
          {
            kind: "new",
            label: "Reason for switching",
            prompt: "Why did you switch?",
            required: true,
          },
        ],
      });
      const created = (await service.listResearchFields(contextA)).find(
        (field) => field.label === "Reason for switching",
      );
      expect(created).toMatchObject({
        includedByDefault: false,
        prompt: "Why did you switch?",
      });
      const second = await service.saveMoment(contextA, {
        ...repeatStudy,
        name: "Fields study two",
        fields: [
          {
            kind: "new",
            label: "reason for switching",
            prompt: "",
            required: false,
          },
        ],
      });
      const items = await isolated.db.execute(sql`
        select m.research_moment_id as moment_id, i.field_version_id, i.required, i.source, i.display_order
        from research_moment_versions m
        join research_field_set_items i on i.field_set_version_id = m.research_field_set_version_id
        where m.research_moment_id in (${first.id}, ${second.id})
        order by m.research_moment_id = ${second.id}, i.display_order`);
      expect(items.rows).toEqual([
        {
          moment_id: first.id,
          field_version_id: ids.fieldVersion,
          required: false,
          source: "platform_default",
          display_order: 0,
        },
        {
          moment_id: first.id,
          field_version_id: created!.id,
          required: true,
          source: "research_run",
          display_order: 1,
        },
        {
          moment_id: second.id,
          field_version_id: created!.id,
          required: false,
          source: "research_run",
          display_order: 0,
        },
      ]);
    });

    it("adapts scripts per research run without changing the library copy", async () => {
      const [library] = await service.listScripts(managerA);
      expect(library).toMatchObject({ id: ids.script, version: 1 });
      const unchanged = await service.saveMoment(managerA, {
        ...repeatStudy,
        name: "Library script study",
        fields: [
          { kind: "library", fieldVersionId: ids.fieldVersion, required: true },
        ],
        script: {
          baseScriptVersionId: library!.versionId,
          prompts: library!.prompts,
        },
      });
      expect(
        await service.getMomentScript(managerA, unchanged.id),
      ).toMatchObject({
        runSpecific: false,
        scriptName: "Synthetic interview",
      });

      const adapted = await service.saveMoment(managerA, {
        ...repeatStudy,
        name: "Adapted script study",
        fields: [
          { kind: "library", fieldVersionId: ids.fieldVersion, required: true },
        ],
        script: {
          baseScriptVersionId: library!.versionId,
          prompts: [
            { id: "texture", title: "Texture", prompt: "Tell me about it." },
            ...library!.prompts,
          ],
        },
      });
      expect(await service.getMomentScript(managerA, adapted.id)).toMatchObject(
        {
          runSpecific: true,
          scriptVersion: 1,
          prompts: [{ id: "texture" }, { id: "intro" }],
        },
      );

      await expect(
        service.updateMomentScript(contextA, adapted.id, library!.prompts),
      ).rejects.toMatchObject({ code: "MOMENT_MANAGER_ROLE_REQUIRED" });
      const updated = await service.updateMomentScript(managerA, adapted.id, [
        { id: "intro", title: "Intro", prompt: "Open warmly." },
      ]);
      expect(updated).toMatchObject({ runSpecific: true, scriptVersion: 2 });
      const versions = await isolated.db.execute(sql`
        select m.version, m.published_at is not null as published, s.kind, sv.version as script_version,
               sv.based_on_script_version_id
        from research_moment_versions m
        join script_versions sv on sv.id = m.script_version_id
        join scripts s on s.id = sv.script_id
        where m.research_moment_id = ${adapted.id}
        order by m.version`);
      expect(versions.rows).toEqual([
        {
          version: 1,
          published: true,
          kind: "research_run",
          script_version: 1,
          based_on_script_version_id: library!.versionId,
        },
        {
          version: 2,
          published: true,
          kind: "research_run",
          script_version: 2,
          based_on_script_version_id: library!.versionId,
        },
      ]);
      // Run scripts never appear in the library.
      expect(
        (await service.listScripts(managerA)).map((script) => script.id),
      ).toEqual([ids.script]);

      const saved = await service.saveScript(managerA, {
        scriptId: ids.script,
        name: "Synthetic interview",
        prompts: [
          ...library!.prompts,
          { id: "close", title: "Close", prompt: "Thank them." },
        ],
      });
      expect(saved.scriptId).toBe(ids.script);
      expect(await service.listScripts(managerA)).toMatchObject([
        {
          id: ids.script,
          version: 2,
          prompts: [{ id: "intro" }, { id: "close" }],
        },
      ]);
      // The seeded moment keeps the version it launched with.
      expect(await service.getMomentScript(managerA, ids.moment)).toMatchObject(
        { scriptVersion: 1 },
      );
    });
  },
);
