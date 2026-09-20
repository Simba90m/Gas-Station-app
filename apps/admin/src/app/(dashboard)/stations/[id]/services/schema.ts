import { z } from "zod";

export const enableServiceSchema = z.object({
  service_id: z.string().trim().uuid("Choose a service."),
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
  duration_minutes: z.coerce.number().int("Duration must be a whole number of minutes.").min(1, "Duration must be at least 1 minute."),
});
