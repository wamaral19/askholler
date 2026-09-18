import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIsolatedTestDatabase,
  persistedCanonicalIds,
  seedPersistedCanonicalFlow,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "./index";

const databaseUrl = testDatabaseUrl();

describe.skipIf(databaseUrl === undefined)(
  "persisted canonical synthetic flow",
  () => {
    let isolated: IsolatedTestDatabase;

    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(databaseUrl!);
    }, 30_000);

    afterAll(async () => {
      await isolated?.close();
    });

    it("migrates an isolated database namespace from zero", async () => {
      const result = await isolated.db.execute(sql`
        select count(*)::int as count
        from information_schema.tables
        where table_schema = 'public'
          and table_type = 'BASE TABLE'
      `);
      expect(result.rows[0]?.count).toBeGreaterThanOrEqual(36);
    });

    it("persists the canonical cardinalities and is retry-idempotent", async () => {
      await seedPersistedCanonicalFlow(isolated.db);
      await seedPersistedCanonicalFlow(isolated.db);

      const result = await isolated.db.execute(sql`
        select
          (select count(*)::int from merchants) as merchants,
          (select count(*)::int from customers) as customers,
          (select count(*)::int from customer_private) as customer_private,
          (select count(*)::int from products) as products,
          (select count(*)::int from product_category_assignments) as category_assignments,
          (select count(*)::int from orders) as orders,
          (select count(*)::int from order_line_items) as line_items,
          (select count(*)::int from webhook_receipts) as receipts,
          (select count(*)::int from commerce_events) as commerce_events,
          (select count(*)::int from qualification_evaluations) as evaluations,
          (select count(*)::int from research_assignments) as assignments,
          (select count(*)::int from interviews) as interviews,
          (select count(*)::int from calls) as calls,
          (select count(*)::int from transcripts) as transcripts,
          (select count(*)::int from transcript_segments) as segments,
          (select count(*)::int from interview_responses) as responses,
          (select count(*)::int from response_evidence) as response_evidence,
          (select count(*)::int from interview_observations) as observations,
          (select count(*)::int from angles) as angles,
          (select count(*)::int from reports) as reports,
          (select count(*)::int from report_artifacts) as report_artifacts,
          (select count(*)::int from audit_events where action = 'customer_private.phone_revealed') as phone_reveal_audits
      `);
      expect(result.rows[0]).toMatchObject({
        merchants: 1,
        customers: 1,
        customer_private: 1,
        products: 3,
        category_assignments: 3,
        orders: 2,
        line_items: 2,
        receipts: 1,
        commerce_events: 1,
        evaluations: 1,
        assignments: 1,
        interviews: 1,
        calls: 1,
        transcripts: 1,
        segments: 6,
        responses: 5,
        response_evidence: 5,
        observations: 1,
        angles: 1,
        reports: 1,
        report_artifacts: 1,
        phone_reveal_audits: 1,
      });
    });

    it("keeps tenant scope, explicit initiation, evidence, and report provenance intact", async () => {
      const result = await isolated.db.execute(sql`
        select
          (select count(*)::int from research_assignments where merchant_id = ${persistedCanonicalIds.merchant}) as tenant_assignments,
          (select count(*)::int from research_assignments where merchant_id = '00000000-0000-7000-8000-000000009999') as foreign_assignments,
          (select count(*)::int from calls c join interviews i on i.id = c.interview_id where i.started_at is not null and i.researcher_id = ${persistedCanonicalIds.researcher}) as explicitly_started_calls,
          (select count(*)::int from angle_evidence ae join interview_responses ir on ir.id = ae.response_id join response_evidence re on re.response_id = ir.id and re.transcript_segment_id = ae.transcript_segment_id join transcript_segments ts on ts.id = re.transcript_segment_id join transcripts t on t.id = ts.transcript_id join interviews i on i.id = t.interview_id where ae.angle_revision_id = ${persistedCanonicalIds.angleRevision}) as proven_angle_evidence,
          (select count(*)::int from report_angles ra join angle_revisions ar on ar.id = ra.angle_revision_id join angle_evidence ae on ae.angle_revision_id = ar.id where ra.report_revision_id = ${persistedCanonicalIds.reportRevision}) as report_evidence_links,
          (select count(*)::int from customer_private where encrypted_phone_e164 like '+%') as plaintext_phones
      `);
      expect(result.rows[0]).toEqual({
        tenant_assignments: 1,
        foreign_assignments: 0,
        explicitly_started_calls: 1,
        proven_angle_evidence: 2,
        report_evidence_links: 2,
        plaintext_phones: 0,
      });
    });
  },
);
