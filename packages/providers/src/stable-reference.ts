import { createHash } from "node:crypto";

export function stableFakeReference(
  namespace: string,
  idempotencyKey: string,
): string {
  const digest = createHash("sha256")
    .update(`holler.${namespace}.v1\0`, "utf8")
    .update(idempotencyKey, "utf8")
    .digest("hex")
    .slice(0, 24);

  return `fake-${namespace}-${digest}`;
}
