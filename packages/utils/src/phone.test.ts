import { describe, expect, it } from "vitest";
import { isValidE164, normalizeToE164 } from "./phone";

describe("normalizeToE164", () => {
  it("normalizes an Egyptian number without +20 (national format, default country)", () => {
    expect(normalizeToE164("01012345678")).toBe("+201012345678");
  });

  it("normalizes an Egyptian number that already has +20", () => {
    expect(normalizeToE164("+201012345678")).toBe("+201012345678");
  });

  it("normalizes an Egyptian number with spaces/dashes", () => {
    expect(normalizeToE164("010 1234 5678")).toBe("+201012345678");
    expect(normalizeToE164("+20-10-1234-5678")).toBe("+201012345678");
  });

  it("normalizes a foreign number with another country code, regardless of the selected country hint", () => {
    // A UK mobile, while the country selector is still on Egypt (default) —
    // the leading "+" means the number's own country wins.
    expect(normalizeToE164("+447911123456")).toBe("+447911123456");
  });

  it("normalizes a national-format number against an explicit non-Egypt country hint", () => {
    // A US number in national format, with the country selector set to US.
    expect(normalizeToE164("(415) 555-2671", "US")).toBe("+14155552671");
  });

  it("returns null for an invalid/garbage number", () => {
    expect(normalizeToE164("not a phone number")).toBeNull();
    expect(normalizeToE164("123")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizeToE164("")).toBeNull();
    expect(normalizeToE164("   ")).toBeNull();
  });

  it("rejects a national-format number that doesn't fit the hinted country's own shape", () => {
    // A UK national number typed without "+", while the hint is Egypt —
    // wrong shape for an Egyptian number, so no result.
    expect(normalizeToE164("07911123456", "EG")).toBeNull();
  });
});

describe("isValidE164", () => {
  it("accepts a normalized Egyptian number", () => {
    expect(isValidE164("+201012345678")).toBe(true);
  });

  it("accepts a normalized foreign number", () => {
    expect(isValidE164("+14155552671")).toBe(true);
  });

  it("rejects a non-E.164 string", () => {
    expect(isValidE164("01012345678")).toBe(false);
    expect(isValidE164("+0123456789")).toBe(false); // leading zero after '+' is invalid E.164
    expect(isValidE164("201012345678")).toBe(false); // missing '+'
  });
});
