import { z } from "zod";
import { isValidE164 } from "@gas-station/utils";

// The PhoneInput component (components/ui/phone-input.tsx) already
// normalizes to E.164 before this ever runs — this just matches the
// database CHECK constraint on profiles.phone exactly (E.164, any country,
// not Egypt-only) as a final guard, the same @gas-station/utils function
// both layers share so there's exactly one definition of "valid phone" in
// this codebase.
const phoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || isValidE164(v), "Enter a valid phone number.");

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
