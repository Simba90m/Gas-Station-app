import { z } from "zod";

export const cancelBookingSchema = z.object({
  cancellation_reason: z
    .string()
    .trim()
    .max(500, "Keep the reason under 500 characters.")
    .optional()
    .transform((v) => v || null),
});

export const createManualBookingSchema = z.object({
  customer_id: z.string().trim().uuid("Choose a customer."),
  station_id: z.string().trim().uuid("Choose a station."),
  service_id: z.string().trim().uuid("Choose a service."),
  start_at: z.string().trim().min(1, "Choose an available time."),
  employee_id: z
    .string()
    .trim()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v || null),
  notes: z
    .string()
    .trim()
    .max(500, "Keep notes under 500 characters.")
    .optional()
    .transform((v) => v || null),
});
