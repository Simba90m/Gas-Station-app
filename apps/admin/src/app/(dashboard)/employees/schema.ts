import { z } from "zod";

// Matches the CHECK constraint on profiles.phone exactly (Egyptian mobile:
// +20 then 10/11/12/15 then 8 digits) — client-side validation mirrors it
// for early feedback; the database enforces it regardless.
const phoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\+20(10|11|12|15)[0-9]{8}$/.test(v), "Enter a valid Egyptian mobile number, e.g. +201012345678.");

export const promoteToEmployeeSchema = z.object({
  profile_id: z.string().trim().uuid("Choose an existing account to promote."),
  hire_date: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  bio_en: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  bio_ar: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
});

export const employeeDetailsSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required."),
  phone: phoneSchema,
  hire_date: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  bio_en: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  bio_ar: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
});

export const assignStationSchema = z.object({
  station_id: z.string().trim().uuid("Choose a station."),
});

export const addCapabilitySchema = z.object({
  service_id: z.string().trim().uuid("Choose a service."),
});

export const createShiftSchema = z
  .object({
    station_id: z.string().trim().uuid("Choose a station."),
    started_at: z.string().trim().min(1, "Start time is required."),
    ended_at: z.string().trim().min(1, "End time is required."),
  })
  .refine((data) => new Date(data.ended_at) > new Date(data.started_at), {
    message: "End time must be after start time (an overnight shift, e.g. 22:00 → 04:00, just ends on the next calendar day).",
    path: ["ended_at"],
  });
