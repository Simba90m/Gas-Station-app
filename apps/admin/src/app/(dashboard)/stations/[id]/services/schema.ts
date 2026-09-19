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
