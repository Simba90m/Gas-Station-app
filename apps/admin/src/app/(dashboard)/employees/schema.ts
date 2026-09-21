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
  // .guid() not .uuid() — see assignStationSchema below for why.
  profile_id: z.string().trim().guid("Choose an existing account to promote."),
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

// .guid() (not .uuid()) deliberately — .uuid() enforces RFC 4122
// version/variant nibbles, which this project's own seed data
// (supabase/seed/*.sql) doesn't use: seed ids like
// '10000000-0000-0000-0000-000000000002' are valid, real Postgres `uuid`
// values (that column type only checks the 8-4-4-4-12 hex shape, not
// version bits) but fail .uuid()'s stricter check. .guid() checks the same
// shape without the version/variant constraint, matching what the database
// itself actually accepts.
export const assignStationSchema = z.object({
  station_id: z.string().trim().guid("Choose a station."),
});

export const addCapabilitySchema = z.object({
  service_id: z.string().trim().guid("Choose a service."),
});

// One row of employee_station_schedule
// (supabase/migrations/20240101000310_employee_station_schedule.sql) — a
// single station + weekday + time window. The "not a permanent 1:1
// relationship" model from the product brief: an employee can have several
// of these, at different stations, on the same or different days. Kept
// deliberately simpler than the station/service HourRowInput shape (no
// closed/24h/break toggles) — this MVP only needs a plain start/end time
// per row, matching the brief's own mockup exactly.
export const addStationScheduleSchema = z
  .object({
    // .guid() not .uuid() — see assignStationSchema above for why.
    station_id: z.string().trim().guid("Choose a station."),
    day_of_week: z.coerce.number().int().min(0, "Choose a day.").max(6, "Choose a day."),
    starts_at: z.string().trim().min(1, "Start time is required."),
    ends_at: z.string().trim().min(1, "End time is required."),
  })
  .refine((data) => data.starts_at !== data.ends_at, {
    message: "Start and end time can't be the same.",
    path: ["ends_at"],
  });

export const createShiftSchema = z
  .object({
    // .guid() not .uuid() — see assignStationSchema above for why.
    station_id: z.string().trim().guid("Choose a station."),
    started_at: z.string().trim().min(1, "Start time is required."),
    ended_at: z.string().trim().min(1, "End time is required."),
  })
  .refine((data) => new Date(data.ended_at) > new Date(data.started_at), {
    message: "End time must be after start time (an overnight shift, e.g. 22:00 → 04:00, just ends on the next calendar day).",
    path: ["ended_at"],
  });
