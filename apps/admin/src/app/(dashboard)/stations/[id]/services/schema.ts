import { z } from "zod";

// Owner-facing category choice — see
// supabase/migrations/20240101000300_service_category.sql. Kept as a plain
// enum here (not imported from @gas-station/types) so zod can validate the
// raw FormData string directly, same as every other enum-ish field in this
// file.
export const serviceCategorySchema = z.enum(["BOOKABLE", "INFO", "CONTENT"]);

// .guid() not .uuid() — .uuid() enforces RFC 4122 version/variant nibbles,
// which this project's seed data (supabase/seed/03_services.sql) doesn't
// use: seed ids like '40000000-0000-0000-0000-000000000002' are valid,
// real Postgres `uuid` values that fail .uuid()'s stricter check. .guid()
// checks the same 8-4-4-4-12 hex shape without that constraint, matching
// what the database itself actually accepts (see
// apps/admin/src/app/(dashboard)/employees/schema.ts for the same fix).
export const enableServiceSchema = z.object({
  service_id: z.string().trim().guid("Choose a service."),
});

export const priceOverrideSchema = z.object({
  price_override: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Price must be a positive number, or left blank to use the catalog price."),
});

export const resourceFormSchema = z.object({
  name_en: z.string().trim().min(1, "English name is required."),
  name_ar: z.string().trim().min(1, "Arabic name is required."),
});

/**
 * requires_employee_selection/requires_resource/is_active are checkboxes,
 * validated outside this schema (a missing FormData key for an unchecked
 * box, vs. "on" for checked, isn't worth fighting zod coercion for) — see
 * createServiceAction.
 */
export const createServiceSchema = z.object({
  name_en: z.string().trim().min(1, "English name is required."),
  name_ar: z.string().trim().min(1, "Arabic name is required."),
  description_en: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  description_ar: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  base_price: z.coerce.number().min(0, "Price must be zero or greater."),
  category: serviceCategorySchema,
  // Only a BOOKABLE service needs a duration — station info (Fuel) and
  // café/content items don't. Mirrors the database's own
  // services_bookable_requires_duration_check constraint, checked again
  // here so the owner gets a friendly message instead of a raw DB error.
  duration_minutes: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1), "Duration must be a whole number of minutes, at least 1."),
}).refine((data) => data.category !== "BOOKABLE" || data.duration_minutes !== null, {
  message: "Bookable services need a duration (how long the appointment or queue turn takes).",
  path: ["duration_minutes"],
});

export const updateServiceCategorySchema = z.object({
  category: serviceCategorySchema,
});
