/**
 * Parses a Postgres tstzrange's text representation (as returned by
 * PostgREST for a `range` column, e.g. `["2024-06-15 09:00:00+02","2024-06-15 09:15:00+02")`)
 * into its two timestamp bounds. Returns null if the input isn't in that shape.
 *
 * Shared by apps/admin (bookings list/detail) and apps/mobile (booking
 * confirmation) — both read `bookings.time_range` the same way.
 */
export function parseTimeRange(raw: string): { start: string; end: string } | null {
  const match = raw.match(/^[[(]"?([^",]*)"?,"?([^",]*)"?[\])]$/);
  if (!match || !match[1] || !match[2]) return null;
  return { start: match[1], end: match[2] };
}
