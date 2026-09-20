import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type { CountryCode };

/**
 * One phone-number normalization approach, shared by every profile
 * (customer, employee, manager, owner) and every surface that collects a
 * phone number (admin staff forms, the public QR kiosk flow, and any future
 * one) — this is deliberately the only place phone parsing/validation logic
 * lives in this codebase. Storage is always E.164 (see
 * supabase/migrations/20240101000260_global_phone_and_kiosk.sql for the
 * matching database CHECK constraint) — not Egypt-only, even though Egypt
 * is the default country for the UI (initial market).
 *
 * Imports the package's default entry ("libphonenumber-js"), not the
 * "/min" subpath — same metadata (the default entry already re-exports
 * from libphonenumber-js's own min build internally, so this changes
 * nothing about bundle size or parsing behavior/accuracy) but resolved
 * through the package's plain "." export instead of a deep conditional
 * subpath export, which is what actually failed to resolve for
 * apps/admin's Turbopack build (see apps/admin/package.json for the other
 * half of this fix — why the dependency is declared there too, not just
 * here).
 */

/** Egypt is the initial market — the country selector defaults here, but the user can always change it. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = "EG";

export interface PhoneCountryOption {
  /** ISO 3166-1 alpha-2 code, as libphonenumber-js expects it. */
  code: CountryCode;
  name: string;
  /** Calling code without the leading '+'. */
  callingCode: string;
}

/**
 * Not every ISO country — a curated, ordered list covering the initial
 * market and its neighbors plus a handful of major countries elsewhere, for
 * a dropdown that stays usable on a phone screen. This does NOT limit which
 * numbers normalizeToE164() can parse: pasting a full "+<code>..." number is
 * always parsed by its own country regardless of the selected option (see
 * normalizeToE164 below) — this list only decides what a national-format
 * number (no leading "+") is interpreted against.
 */
export const PHONE_COUNTRY_OPTIONS: PhoneCountryOption[] = [
  { code: "EG", name: "Egypt", callingCode: "20" },
  { code: "SA", name: "Saudi Arabia", callingCode: "966" },
  { code: "AE", name: "United Arab Emirates", callingCode: "971" },
  { code: "KW", name: "Kuwait", callingCode: "965" },
  { code: "QA", name: "Qatar", callingCode: "974" },
  { code: "BH", name: "Bahrain", callingCode: "973" },
  { code: "OM", name: "Oman", callingCode: "968" },
  { code: "JO", name: "Jordan", callingCode: "962" },
  { code: "LB", name: "Lebanon", callingCode: "961" },
  { code: "IQ", name: "Iraq", callingCode: "964" },
  { code: "LY", name: "Libya", callingCode: "218" },
  { code: "SD", name: "Sudan", callingCode: "249" },
  { code: "MA", name: "Morocco", callingCode: "212" },
  { code: "DZ", name: "Algeria", callingCode: "213" },
  { code: "TN", name: "Tunisia", callingCode: "216" },
  { code: "PS", name: "Palestine", callingCode: "970" },
  { code: "TR", name: "Turkey", callingCode: "90" },
  { code: "GB", name: "United Kingdom", callingCode: "44" },
  { code: "US", name: "United States / Canada", callingCode: "1" },
  { code: "DE", name: "Germany", callingCode: "49" },
  { code: "FR", name: "France", callingCode: "33" },
  { code: "IN", name: "India", callingCode: "91" },
  { code: "PK", name: "Pakistan", callingCode: "92" },
];

/**
 * Normalizes a phone number to E.164 (e.g. "+201012345678"), or returns
 * null if it isn't a valid number.
 *
 * - A national-format number ("01012345678") is interpreted against
 *   `countryHint` (defaults to Egypt) — so an Egyptian customer never has
 *   to type "+20" themselves.
 * - A number that already starts with "+" is parsed by its own country
 *   regardless of `countryHint` — pasting a full foreign number always
 *   works, even while the country selector still shows Egypt.
 */
export function normalizeToE164(rawNumber: string, countryHint: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  const trimmed = rawNumber.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, trimmed.startsWith("+") ? undefined : countryHint);
  if (!parsed || !parsed.isValid()) return null;

  return parsed.number;
}

/** Matches the database CHECK constraint on profiles.phone exactly. */
export function isValidE164(value: string): boolean {
  return /^\+[1-9][0-9]{6,14}$/.test(value);
}

export interface SplitPhoneNumber {
  country: CountryCode;
  national: string;
}

/**
 * The inverse of normalizeToE164() — turns a stored E.164 value back into
 * {country, national} for an edit form's country selector + national-number
 * field to start from. Falls back to the default country with an empty
 * national number for a null/unparseable value (a brand-new form, or an
 * already-invalid legacy value neither of which should crash the input).
 */
export function splitE164(e164: string | null | undefined): SplitPhoneNumber {
  if (e164) {
    const parsed = parsePhoneNumberFromString(e164);
    if (parsed) {
      return { country: (parsed.country as CountryCode) ?? DEFAULT_PHONE_COUNTRY, national: parsed.formatNational() };
    }
  }
  return { country: DEFAULT_PHONE_COUNTRY, national: "" };
}
