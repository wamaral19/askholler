import { createHash, randomUUID } from "node:crypto";

import { calls, createDatabase, interviews, recordings } from "@holler/db";
import type { DialerProvider } from "@holler/domain";
import {
  createTwilioVoiceToken,
  mapTwilioCallStatus,
  R2PrivateObjectStore,
  transferRecording,
  TwilioDialerProvider,
  verifyTwilioWebhookSignature,
} from "@holler/providers";
import { and, eq, or } from "drizzle-orm";

import type { TenantContext } from "./operations-types";

const INTENT_TTL_SECONDS = 300;
const CALL_SID = /^CA[a-fA-F0-9]{32}$/;
const RECORDING_SID = /^RE[a-fA-F0-9]{32}$/;

type Database = ReturnType<typeof createDatabase>["db"];

export interface CallIntentClaims {
  merchantId: string;
  interviewId: string;
  assignmentId: string;
  researcherId: string;
  nonce: string;
  expiresAt: number;
}

export interface TwilioCallStore {
  reserveIntent(claims: CallIntentClaims): Promise<void>;
  bindIntent(claims: CallIntentClaims, callSid: string): Promise<boolean>;
  grantConsentAndGetCall(
    context: TenantContext,
    interviewId: string,
  ): Promise<string | null>;
  getRecordingForCall(
    context: TenantContext,
    interviewId: string,
  ): Promise<{ callSid: string; recordingSid: string } | null>;
  saveRecording(input: {
    merchantId: string;
    interviewId: string;
    callSid: string;
    recordingSid: string;
    status: string;
  }): Promise<void>;
  updateCall(callSid: string, status: string): Promise<void>;
  updateRecording(recordingSid: string, status: string): Promise<void>;
}

export class PostgresTwilioCallStore implements TwilioCallStore {
  constructor(private readonly db: Database) {}

  async reserveIntent(claims: CallIntentClaims): Promise<void> {
    const ref = `intent:${claims.nonce}`;
    const updated = await this.db
      .update(calls)
      .set({
        provider: "twilio",
        providerCallRef: ref,
        status: "authorized",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calls.merchantId, claims.merchantId),
          eq(calls.interviewId, claims.interviewId),
        ),
      )
      .returning({ id: calls.id });
    if (updated.length === 0) {
      await this.db.insert(calls).values({
        id: stableUuid(`twilio:${claims.interviewId}`),
        merchantId: claims.merchantId,
        interviewId: claims.interviewId,
        provider: "twilio",
        providerCallRef: ref,
        status: "authorized",
      });
    }
  }

  async bindIntent(
    claims: CallIntentClaims,
    callSid: string,
  ): Promise<boolean> {
    const intentRef = `intent:${claims.nonce}`;
    const rows = await this.db
      .update(calls)
      .set({
        providerCallRef: callSid,
        errorCode: intentRef,
        status: "dialing",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calls.merchantId, claims.merchantId),
          eq(calls.interviewId, claims.interviewId),
          eq(calls.provider, "twilio"),
          or(
            eq(calls.providerCallRef, intentRef),
            and(
              eq(calls.providerCallRef, callSid),
              eq(calls.errorCode, intentRef),
            ),
          ),
        ),
      )
      .returning({ id: calls.id });
    return rows.length === 1;
  }

  async grantConsentAndGetCall(
    context: TenantContext,
    interviewId: string,
  ): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      const owned = await tx
        .update(interviews)
        .set({ recordingConsent: "granted", updatedAt: new Date() })
        .where(
          and(
            eq(interviews.id, interviewId),
            eq(interviews.merchantId, context.merchantId),
            eq(interviews.researcherId, context.researcherId),
          ),
        )
        .returning({ id: interviews.id });
      if (owned.length !== 1) return null;
      const [call] = await tx
        .select({ ref: calls.providerCallRef })
        .from(calls)
        .where(
          and(
            eq(calls.interviewId, interviewId),
            eq(calls.merchantId, context.merchantId),
            eq(calls.provider, "twilio"),
          ),
        );
      return call?.ref && CALL_SID.test(call.ref) ? call.ref : null;
    });
  }

  async getRecordingForCall(
    context: TenantContext,
    interviewId: string,
  ): Promise<{ callSid: string; recordingSid: string } | null> {
    const [row] = await this.db
      .select({
        recordingSid: recordings.providerRef,
        callSid: calls.providerCallRef,
      })
      .from(recordings)
      .innerJoin(
        interviews,
        and(
          eq(interviews.id, recordings.interviewId),
          eq(interviews.merchantId, recordings.merchantId),
        ),
      )
      .innerJoin(
        calls,
        and(
          eq(calls.interviewId, recordings.interviewId),
          eq(calls.merchantId, recordings.merchantId),
          eq(calls.provider, recordings.provider),
        ),
      )
      .where(
        and(
          eq(recordings.interviewId, interviewId),
          eq(recordings.merchantId, context.merchantId),
          eq(interviews.researcherId, context.researcherId),
          eq(recordings.provider, "twilio"),
        ),
      );
    return row?.recordingSid &&
      row.callSid &&
      RECORDING_SID.test(row.recordingSid) &&
      CALL_SID.test(row.callSid)
      ? { recordingSid: row.recordingSid, callSid: row.callSid }
      : null;
  }

  async saveRecording(input: {
    merchantId: string;
    interviewId: string;
    callSid: string;
    recordingSid: string;
    status: string;
  }): Promise<void> {
    await this.db
      .insert(recordings)
      .values({
        id: stableUuid(`twilio-recording:${input.interviewId}`),
        merchantId: input.merchantId,
        interviewId: input.interviewId,
        provider: "twilio",
        providerRef: input.recordingSid,
        objectKey: `recordings/${input.merchantId}/${input.interviewId}.mp3`,
        status: input.status,
        consentStatus: "granted",
      })
      .onConflictDoUpdate({
        target: [recordings.merchantId, recordings.interviewId],
        set: {
          providerRef: input.recordingSid,
          status: input.status,
          updatedAt: new Date(),
        },
      });
  }

  async updateCall(callSid: string, status: string): Promise<void> {
    const mapped = mapTwilioCallStatus(status);
    const now = new Date();
    await this.db
      .update(calls)
      .set({
        status: mapped,
        ...(mapped === "answered" ? { answeredAt: now } : {}),
        ...(mapped === "completed" ||
        mapped === "failed" ||
        mapped === "no_answer"
          ? { endedAt: now }
          : {}),
        updatedAt: now,
      })
      .where(
        and(eq(calls.provider, "twilio"), eq(calls.providerCallRef, callSid)),
      );
  }

  async updateRecording(recordingSid: string, status: string): Promise<void> {
    const mapped =
      status === "completed"
        ? "ready_for_transfer"
        : status === "absent" || status === "failed"
          ? "failed"
          : "processing";
    await this.db
      .update(recordings)
      .set({ status: mapped, updatedAt: new Date() })
      .where(
        and(
          eq(recordings.provider, "twilio"),
          eq(recordings.providerRef, recordingSid),
        ),
      );
  }

  async getTransferTarget(recordingSid: string): Promise<{
    objectKey: string;
    status: string;
  } | null> {
    const [row] = await this.db
      .select({ objectKey: recordings.objectKey, status: recordings.status })
      .from(recordings)
      .where(
        and(
          eq(recordings.provider, "twilio"),
          eq(recordings.providerRef, recordingSid),
        ),
      );
    return row ?? null;
  }

  async markRecordingStored(recordingSid: string): Promise<void> {
    await this.db
      .update(recordings)
      .set({ status: "stored", updatedAt: new Date() })
      .where(
        and(
          eq(recordings.provider, "twilio"),
          eq(recordings.providerRef, recordingSid),
        ),
      );
  }

  async markRecordingPendingSourceDelete(recordingSid: string): Promise<void> {
    await this.db
      .update(recordings)
      .set({ status: "stored_pending_source_delete", updatedAt: new Date() })
      .where(
        and(
          eq(recordings.provider, "twilio"),
          eq(recordings.providerRef, recordingSid),
        ),
      );
  }
}

export interface TwilioServerDependencies {
  store: TwilioCallStore;
  dialer: Pick<DialerProvider, "startRecording" | "stopRecording">;
  createVoiceToken(identity: string): Promise<string>;
  authToken: string;
  callerId: string;
  appBaseUrl: string;
  intentSecret: string;
  now(): number;
  transferCompletedRecording?(recordingSid: string): Promise<void>;
}

let configured: TwilioServerDependencies | undefined;
export function configureTwilioServerForTests(
  value: TwilioServerDependencies | undefined,
): void {
  configured = value;
}

export function getTwilioServerDependencies(): TwilioServerDependencies {
  if (configured) return configured;
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const appBaseUrl = required("APP_BASE_URL").replace(/\/$/, "");
  const accountSid = required("TWILIO_ACCOUNT_SID");
  const authToken = required("TWILIO_AUTH_TOKEN");
  const callerId = required("TWILIO_CALLER_ID");
  const { db } = createDatabase(required("DATABASE_URL"));
  const store = new PostgresTwilioCallStore(db);
  const dialer = new TwilioDialerProvider({
    accountSid,
    authToken,
    fromPhoneE164: callerId,
    callInstructionUrl: `${appBaseUrl}/api/twilio/voice`,
    callStatusCallbackUrl: `${appBaseUrl}/api/twilio/call-status`,
  });
  const objectStore = new R2PrivateObjectStore({
    accountId: required("R2_ACCOUNT_ID"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucket: required("R2_BUCKET"),
  });
  return {
    store,
    dialer,
    createVoiceToken: (identity) =>
      createTwilioVoiceToken(
        {
          accountSid,
          apiKeySid: required("TWILIO_API_KEY_SID"),
          apiKeySecret: required("TWILIO_API_KEY_SECRET"),
          outgoingApplicationSid: required("TWILIO_TWIML_APP_SID"),
          ttlSeconds: INTENT_TTL_SECONDS,
        },
        { identity },
      ),
    authToken,
    callerId,
    appBaseUrl,
    intentSecret: required("TWILIO_CALL_INTENT_SECRET"),
    now: () => Date.now(),
    transferCompletedRecording: async (recordingSid) => {
      const target = await store.getTransferTarget(recordingSid);
      if (!target) throw new Error("TWILIO_RECORDING_NOT_FOUND");
      if (target.status === "stored") return;
      if (target.status === "stored_pending_source_delete") {
        await dialer.deleteRecording(recordingSid);
        await store.markRecordingStored(recordingSid);
        return;
      }
      await transferRecording({
        source: {
          download: (reference) => dialer.downloadRecording(reference),
          delete: (reference) => dialer.deleteRecording(reference),
        },
        destination: objectStore,
        sourceReference: recordingSid,
        destinationKey: target.objectKey,
        afterStored: () => store.markRecordingPendingSourceDelete(recordingSid),
      });
      await store.markRecordingStored(recordingSid);
    },
  };
}

export async function createCallIntent(
  deps: TwilioServerDependencies,
  input: Omit<CallIntentClaims, "nonce" | "expiresAt">,
): Promise<string> {
  const claims: CallIntentClaims = {
    ...input,
    nonce: randomUUID(),
    expiresAt: Math.floor(deps.now() / 1000) + INTENT_TTL_SECONDS,
  };
  await deps.store.reserveIntent(claims);
  const payload = base64Url(JSON.stringify(claims));
  return `${payload}.${await hmac(payload, deps.intentSecret)}`;
}

export async function verifyCallIntent(
  deps: TwilioServerDependencies,
  token: string,
): Promise<CallIntentClaims | null> {
  const [payload, signature, extra] = token.split(".");
  if (
    !payload ||
    !signature ||
    extra ||
    !(await safeEqual(signature, await hmac(payload, deps.intentSecret)))
  )
    return null;
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as CallIntentClaims;
    if (
      !value.nonce ||
      !value.interviewId ||
      !value.assignmentId ||
      !value.merchantId ||
      !value.researcherId ||
      value.expiresAt < Math.floor(deps.now() / 1000)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export async function verifyTwilioRequest(
  request: Request,
  form: URLSearchParams,
  deps: TwilioServerDependencies,
): Promise<boolean> {
  const url = new URL(request.url);
  const externalUrl = `${deps.appBaseUrl}${url.pathname}${url.search}`;
  return verifyTwilioWebhookSignature({
    authToken: deps.authToken,
    url: externalUrl,
    signature: request.headers.get("x-twilio-signature"),
    parameters: form,
  });
}

export function twimlDial(
  destination: string,
  callerId: string,
  statusUrl: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${xml(callerId)}"><Number statusCallback="${xml(statusUrl)}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">${xml(destination)}</Number></Dial></Response>`;
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  ).toString("base64url");
}
async function safeEqual(left: string, right: string): Promise<boolean> {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1)
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
function xml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );
}
