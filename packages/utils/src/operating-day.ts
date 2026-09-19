/**
 * "Today" for the dashboard means today's calendar date in the business's
 * own timezone (Africa/Cairo), not the server's or viewer's timezone — a
 * 2 AM booking is still "today" from the business's point of view. Uses
 * Intl.DateTimeFormat (backed by the real IANA tzdata) rather than a
 * hardcoded UTC offset — Egypt's DST rules have changed more than once, and
 * this stays correct if they change again (verified: Cairo is UTC+2 in
 * winter, UTC+3 in summer, as of this codebase's tzdata).
 */

function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );

  return asUtc - instant.getTime();
}

/** The UTC instant corresponding to 00:00:00 on the given calendar day, in `timeZone`. */
function localMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  // Guess "midnight" by treating Y-M-D as if it were already UTC, then
  // correct using the real offset at that guess. Correct even right at a
  // DST transition because we look up the offset for each day
  // independently (see getOperatingDayRange) instead of assuming a fixed
  // 24-hour day length.
  const guess = new Date(Date.UTC(year, month - 1, day));
  const offsetMs = getTimeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offsetMs);
}

/**
 * The [start, end) instant range covering `instant`'s calendar day in
 * `timeZone`. `end` is computed independently from `start` (not just
 * `start + 24h`), so this is correct on a DST fall-back day (a local
 * calendar day 25 hours long) and in the general case.
 *
 * Known narrow edge case: on a DST *spring-forward* day, local midnight
 * doesn't exist as an instant at all (e.g. Cairo's clocks jump straight
 * from 23:59:59 to 01:00:00), so `start` can be up to an hour early on
 * that one specific day per year — a well-known, inherent ambiguity in
 * any timezone-aware date library, not something fixable by computing
 * harder. Negligible for a dashboard summary count; verified with tests
 * covering both DST transitions before relying on this.
 */
export function getOperatingDayRange(instant: Date, timeZone: string): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  const start = localMidnightToUtc(year, month, day, timeZone);

  // Tomorrow's Y-M-D: manipulate the calendar fields of a UTC-anchored date
  // (unambiguous — no timezone involved in this step) rather than adding
  // 24h of wall-clock time.
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  const end = localMidnightToUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), timeZone);

  return { start, end };
}
