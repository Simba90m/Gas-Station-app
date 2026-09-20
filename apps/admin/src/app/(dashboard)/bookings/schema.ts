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

// Deliberately z.guid() (any RFC-shaped UUID), not z.uuid() (Zod v4's
// stricter check, which requires the RFC4122 *version 4* nibble
// specifically). Postgres's own `uuid` column type has no such
// requirement — ANY 32-hex-digit dashed string is a valid Postgres UUID —
// and this project's own seed data
// (supabase/seed/05_customers.sql and others) uses hand-crafted ids like
// '30000000-0000-0000-0000-000000000001', which are real, valid rows but
// fail z.uuid()'s stricter check. Using z.uuid() here rejected every
// seeded demo customer with "Choose a customer." even when one was
// genuinely selected — this is the real root cause that was traced and
// fixed, not a state-management bug in the wizard.
export const createManualBookingSchema = z.object({
  customer_id: z.string().trim().guid("Choose a customer."),
  station_id: z.string().trim().guid("Choose a station."),
  service_id: z.string().trim().guid("Choose a service."),
  start_at: z.string().trim().min(1, "Choose an available time."),
  employee_id: z
    .string()
    .trim()
    .guid()
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
