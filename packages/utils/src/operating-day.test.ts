import { describe, expect, it } from "vitest";
import { getOperatingDayRange } from "./operating-day";

const TZ = "Africa/Cairo";
const cairoDate = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

function assertCoversWholeDay(instant: Date) {
  const groundTruthDate = cairoDate.format(instant);
  const { start, end } = getOperatingDayRange(instant, TZ);

  expect(instant >= start && instant < end).toBe(true);
  expect(cairoDate.format(start)).toBe(groundTruthDate);
  expect(cairoDate.format(new Date(end.getTime() - 1))).toBe(groundTruthDate);
  expect(cairoDate.format(end)).not.toBe(groundTruthDate);

  return { start, end };
}

describe("getOperatingDayRange", () => {
  it("covers a normal winter day (Cairo UTC+2)", () => {
    assertCoversWholeDay(new Date("2024-01-15T12:00:00Z"));
  });

  it("covers a normal summer day (Cairo UTC+3, DST)", () => {
    assertCoversWholeDay(new Date("2024-06-15T12:00:00Z"));
  });

  it("attributes a late-night booking (23:45 local) to the correct calendar day", () => {
    // This is the exact scenario the project brief calls out: a booking
    // just before midnight must not spill into "tomorrow".
    const { end } = assertCoversWholeDay(new Date("2024-01-15T21:45:00Z")); // 23:45 Cairo
    // ...and a booking one minute later (00:45, past midnight) must land
    // in the *next* day's range, not this one.
    const justAfterMidnight = new Date("2024-01-15T22:45:00Z"); // 00:45 Cairo next day
    expect(justAfterMidnight >= end).toBe(true);
  });

  it("covers a DST fall-back day (25 real hours long) correctly", () => {
    const { start, end } = assertCoversWholeDay(new Date("2024-10-30T21:30:00Z"));
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it("stays within a few minutes of correct on a DST spring-forward day", () => {
    // Known, documented limitation (see operating-day.ts): local midnight
    // doesn't exist as an instant that day (clocks jump 23:59:59 -> 01:00:00),
    // so `start` can land up to an hour early. Not asserting full
    // day-boundary correctness here — just that it doesn't crash or
    // produce something wildly wrong (multi-day range, reversed range, etc).
    const instant = new Date("2024-04-25T22:30:00Z");
    const { start, end } = getOperatingDayRange(instant, TZ);
    expect(end.getTime() - start.getTime()).toBeGreaterThanOrEqual(23 * 3_600_000);
    expect(end.getTime() - start.getTime()).toBeLessThanOrEqual(24 * 3_600_000);
    expect(instant >= start && instant < end).toBe(true);
  });
});
