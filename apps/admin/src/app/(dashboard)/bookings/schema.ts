import { z } from "zod";

export const cancelBookingSchema = z.object({
  cancellation_reason: z
    .string()
    .trim()
    .max(500, "Keep the reason under 500 characters.")
    .optional()
    .transform((v) => v || null),
});

// Matches the CHECK constraint on profiles.phone exactly (Egyptian mobile:
// +20 then 10/11/12/15 then 8 digits) — same pattern as employees/schema.ts's
// phoneSchema, duplicated here (not exported there) rather than required,
// since a walk-in customer needs a real, valid phone number to create
// their account with — unlike an employee's phone, it can't be optional
// here.
export const createCustomerSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required."),
  phone: z
    .string()
    .trim()
    .regex(/^\+20(10|11|12|15)[0-9]{8}$/, "Enter a valid Egyptian mobile number, e.g. +201012345678."),
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
