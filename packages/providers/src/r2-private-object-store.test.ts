import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { R2PrivateObjectStore } from "./r2-private-object-store";

const config = {
  accountId: "account-id",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  bucket: "holler-private",
};
const now = () => new Date("2026-09-24T12:34:56.000Z");

describe("R2PrivateObjectStore", () => {
  it("uploads bytes privately with a signed request and content checksum", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const store = new R2PrivateObjectStore(config, { fetch: request, now });
    const bytes = new TextEncoder().encode("recording");

    await expect(
      store.put({ key: "calls/a b.wav", mediaType: "audio/wav", bytes }),
    ).resolves.toEqual({
      checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });

    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://account-id.r2.cloudflarestorage.com/holler-private/calls/a%20b.wav",
    );
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("authorization")).toContain(
      "Credential=access-key/20260924/auto/s3/aws4_request",
    );
    expect(new Headers(init?.headers).get("x-amz-checksum-sha256")).toBe(
      createHash("sha256").update(bytes).digest("base64"),
    );
  });

  it("creates bounded, signed private download URLs", async () => {
    const store = new R2PrivateObjectStore(config, { now });
    const url = new URL(await store.createDownloadUrl("calls/one.wav", 300));

    expect(url.origin + url.pathname).toBe(
      "https://account-id.r2.cloudflarestorage.com/holler-private/calls/one.wav",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      store.createDownloadUrl("calls/one.wav", 604_801),
    ).rejects.toThrow("R2_DOWNLOAD_EXPIRY_INVALID");
  });

  it("makes delete idempotent for a missing object and redacts response bodies", async () => {
    const notFound = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("secret provider response", { status: 404 }),
      );
    const store = new R2PrivateObjectStore(config, { fetch: notFound, now });
    await expect(store.delete("calls/missing.wav")).resolves.toBeUndefined();

    const failed = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("secret provider response", {
        status: 500,
        headers: { "cf-ray": "safe-request-id" },
      }),
    );
    const failingStore = new R2PrivateObjectStore(config, {
      fetch: failed,
      now,
    });
    await expect(failingStore.delete("calls/one.wav")).rejects.toThrow(
      "R2_DELETE_FAILED:500:safe-request-id",
    );
  });
});
