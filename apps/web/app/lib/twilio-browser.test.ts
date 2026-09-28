import { describe, expect, it } from "vitest";

import { callErrorMessage, mayStartRecording } from "./twilio-browser";

describe("Twilio browser calling", () => {
  it("only permits recording after connection and explicit consent", () => {
    expect(mayStartRecording("connecting", true)).toBe(false);
    expect(mayStartRecording("connected", false)).toBe(false);
    expect(mayStartRecording("connected", true)).toBe(true);
    expect(mayStartRecording("ended", true)).toBe(false);
  });

  it("does not expose non-error values in the interface", () => {
    expect(callErrorMessage({ secret: "do not render" })).toBe(
      "The call could not be completed. Please try again.",
    );
  });
});
