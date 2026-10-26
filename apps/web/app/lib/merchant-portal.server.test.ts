import {
  createIsolatedTestDatabase,
  persistedCanonicalIds as ids,
  seedPersistedCanonicalFlow,
  testDatabaseUrl,
  type IsolatedTestDatabase,
} from "@holler/testkit";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyShopifyChargeStatus,
  createMerchantCharge,
  listMerchantCharges,
  recordShopifyCharge,
  resetChargesOnUninstall,
  withdrawMerchantCharge,
} from "./merchant-billing.server";
import {
  formatChargeAmount,
  nextChargeState,
  parseDollarAmount,
} from "./merchant-charges";
import type { TenantContext } from "./operations-types";
import {
  PostgresOperationsApplicationService,
  PrefixedSyntheticPhoneDecryptor,
} from "./postgres-operations-service.server";

const databaseUrl = testDatabaseUrl();
const merchantActor = "00000000-0000-7000-8000-000000009201";

describe("merchant charge rules", () => {
  it("parses dollar amounts into cents and rejects the rest", () => {
    expect(parseDollarAmount("4800")).toBe(480_000);
    expect(parseDollarAmount("$1,250.50")).toBe(125_050);
    expect(parseDollarAmount("0")).toBeNull();
    expect(parseDollarAmount("12.345")).toBeNull();
    expect(parseDollarAmount("100000.01")).toBeNull();
    expect(parseDollarAmount("ten")).toBeNull();
  });

  it("maps Shopify statuses, returning expired approvals to pending", () => {
    expect(nextChargeState("one_time", "ACTIVE")).toEqual({
      status: "paid",
      relink: false,
    });
    expect(nextChargeState("monthly", "active")).toEqual({
      status: "active",
      relink: false,
    });
    expect(nextChargeState("monthly", "DECLINED")?.status).toBe("declined");
    expect(nextChargeState("monthly", "EXPIRED")).toEqual({
      status: "pending",
      relink: true,
    });
    expect(nextChargeState("monthly", "FROZEN")).toBeNull();
  });

  it("formats monthly amounts per month", () => {
    expect(
      formatChargeAmount({
        kind: "monthly",
        amountMinor: 250_000,
        currency: "USD",
      }),
    ).toBe("$2,500.00 / month");
  });
});

describe.skipIf(databaseUrl === undefined)("merchant portal", () => {
  let isolated: IsolatedTestDatabase;
  let service: PostgresOperationsApplicationService;
  const merchant: TenantContext = {
    merchantId: ids.merchant,
    merchantIds: [ids.merchant],
    researcherId: merchantActor,
    correlationId: "00000000-0000-7000-8000-000000009202",
    roles: [],
    viewer: "merchant",
  };
  const manager: TenantContext = {
    merchantId: ids.merchant,
    merchantIds: [ids.merchant],
    researcherId: "00000000-0000-7000-8000-000000009203",
    correlationId: "00000000-0000-7000-8000-000000009204",
    roles: ["research_manager"],
  };

  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(databaseUrl!);
    // The canonical flow ends with a completed, transcribed interview.
    await seedPersistedCanonicalFlow(isolated.db);
    service = new PostgresOperationsApplicationService(
      isolated.db,
      new PrefixedSyntheticPhoneDecryptor(),
    );
  }, 30_000);

  afterAll(async () => isolated?.close());

  it("shows the merchant every finished call and its review, read-only", async () => {
    const [call] = await service.listCompletedCalls(merchant);
    expect(call).toMatchObject({ interviewId: ids.interview, mine: false });
    const review = await service.getCallReview(merchant, ids.interview);
    expect(review.transcript.length).toBeGreaterThan(0);
    // Finished calls never decrypt the customer's name for anyone.
    expect(review.profile.firstName).toBeNull();
    const prompt = review.prompts[0]!;
    await expect(
      service.reviewPromptProgress(merchant, ids.interview, prompt.key, {
        covered: true,
        selected: [],
        note: "merchant edit",
      }),
    ).rejects.toMatchObject({ code: "WORKFORCE_ACCESS_REQUIRED" });
  });

  it("keeps the merchant out of the queue, phone numbers, and live calls", async () => {
    await expect(service.listQueue(merchant)).rejects.toMatchObject({
      code: "WORKFORCE_ACCESS_REQUIRED",
    });
    await expect(
      service.revealPhone(merchant, ids.assignment),
    ).rejects.toMatchObject({ code: "WORKFORCE_ACCESS_REQUIRED" });
    await expect(
      service.getInterview(merchant, ids.interview),
    ).rejects.toMatchObject({ code: "WORKFORCE_ACCESS_REQUIRED" });
    await expect(
      service.generateReport(merchant, "2026-10"),
    ).rejects.toMatchObject({ code: "WORKFORCE_ACCESS_REQUIRED" });
  });

  it("audits the merchant's recording playback as the merchant viewer", async () => {
    await isolated.db.execute(sql`
      insert into recordings (id, merchant_id, interview_id, provider, provider_ref, object_key, status, consent_status)
      values (gen_random_uuid(), ${ids.merchant}, ${ids.interview}, 'twilio', ${`RE${"b".repeat(32)}`},
              'recordings/merchant.mp3', 'stored', 'granted')`);
    expect(await service.getRecordingObjectKey(merchant, ids.interview)).toBe(
      "recordings/merchant.mp3",
    );
    const [event] = (
      await isolated.db.execute(sql`
        select actor_id, metadata->>'viewer' as viewer from audit_events
        where action = 'recording.playback_authorized' and subject_id = ${ids.interview}`)
    ).rows;
    expect(event).toEqual({ actor_id: merchantActor, viewer: "merchant" });
  });

  it("saves a merchant's angle as a draft request, even when asked to publish", async () => {
    const [field] = await service.listResearchFields(merchant);
    const { id } = await service.saveMoment(merchant, {
      name: "Why customers come back",
      objective: "Hear what brings second-order customers back.",
      weeklyTarget: 5,
      cohortExpression: {
        predicate: "customer.order_sequence",
        version: 1,
        config: { operator: "equals", value: 2 },
      },
      fields: [{ kind: "library", fieldVersionId: field!.id, required: true }],
      publish: true,
    });
    const requested = (await service.listMoments(manager)).find(
      (moment) => moment.id === id,
    );
    expect(requested).toMatchObject({
      status: "draft",
      requestedByMerchant: true,
    });
    expect(
      (await service.listMoments(merchant)).find((item) => item.id === id),
    ).toMatchObject({
      status: "draft",
      requestedByMerchant: true,
    });
  });

  it("lists completed runs with the report link staff set", async () => {
    expect(await service.listCompletedRuns(merchant)).toEqual([]);
    await service.setMomentStatus(manager, ids.moment, "completed");
    await expect(
      service.setMomentReportUrl(manager, ids.moment, "javascript:alert(1)"),
    ).rejects.toMatchObject({ code: "INVALID_REPORT_URL" });
    await expect(
      service.setMomentReportUrl(
        merchant,
        ids.moment,
        "https://reports.example/run",
      ),
    ).rejects.toMatchObject({ code: "WORKFORCE_ACCESS_REQUIRED" });
    await service.setMomentReportUrl(
      manager,
      ids.moment,
      "https://reports.example/run",
    );
    const [run] = await service.listCompletedRuns(merchant);
    expect(run).toMatchObject({
      id: ids.moment,
      name: "Second purchase into skincare",
      completedInterviews: 1,
      reportUrl: "https://reports.example/run",
    });
  });

  it("tracks a charge from request through approval, uninstall, and decline", async () => {
    const charge = await createMerchantCharge(isolated.db, {
      merchantId: ids.merchant,
      kind: "monthly",
      description: "Monthly research",
      amountMinor: 250_000,
      createdBy: manager.researcherId,
    });
    expect(charge.status).toBe("pending");
    const gid = "gid://shopify/AppSubscription/1";
    await recordShopifyCharge(isolated.db, ids.merchant, charge.id, gid);
    await applyShopifyChargeStatus(isolated.db, ids.merchant, gid, "ACTIVE");
    expect(
      (await listMerchantCharges(isolated.db, ids.merchant))[0],
    ).toMatchObject({ status: "active", shopifyChargeId: gid });
    await expect(
      withdrawMerchantCharge(isolated.db, ids.merchant, charge.id),
    ).rejects.toMatchObject({ code: "CHARGE_NOT_PENDING" });

    // Uninstalling cancels Shopify's subscription; a reinstall asks again.
    await resetChargesOnUninstall(isolated.db, ids.merchant);
    expect(
      (await listMerchantCharges(isolated.db, ids.merchant))[0],
    ).toMatchObject({ status: "pending", shopifyChargeId: null });
    // Statuses for the old Shopify charge no longer apply.
    await applyShopifyChargeStatus(isolated.db, ids.merchant, gid, "CANCELLED");
    expect(
      (await listMerchantCharges(isolated.db, ids.merchant))[0]?.status,
    ).toBe("pending");

    const regid = "gid://shopify/AppSubscription/2";
    await recordShopifyCharge(isolated.db, ids.merchant, charge.id, regid);
    await applyShopifyChargeStatus(
      isolated.db,
      ids.merchant,
      regid,
      "DECLINED",
    );
    expect(
      (await listMerchantCharges(isolated.db, ids.merchant))[0]?.status,
    ).toBe("declined");
  });

  it("lets staff withdraw a charge the merchant has not approved", async () => {
    const charge = await createMerchantCharge(isolated.db, {
      merchantId: ids.merchant,
      kind: "one_time",
      description: "Q4 project",
      amountMinor: 480_000,
      createdBy: manager.researcherId,
    });
    await withdrawMerchantCharge(isolated.db, ids.merchant, charge.id);
    const charges = await listMerchantCharges(isolated.db, ids.merchant);
    expect(charges.find((item) => item.id === charge.id)?.status).toBe(
      "cancelled",
    );
    await expect(
      createMerchantCharge(isolated.db, {
        merchantId: ids.merchant,
        kind: "one_time",
        description: " ",
        amountMinor: 100,
        createdBy: manager.researcherId,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CHARGE" });
  });
});
