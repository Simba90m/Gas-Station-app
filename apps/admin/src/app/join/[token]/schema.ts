import { z } from "zod";
import { isValidE164 } from "@gas-station/utils";

// The same @gas-station/utils function every other phone field in this
// codebase validates against (employees/schema.ts, bookings/schema.ts) —
// one definition of "valid phone", not a second phone-number system for
// the public flow.
const phoneField = z.string().trim().refine(isValidE164, "Enter a valid phone number.");

export const publicPhoneSchema = z.object({
  phone: phoneField,
});

export const publicJoinCustomerSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required.").max(200, "Keep the name under 200 characters."),
  phone: phoneField,
});

export const publicStartWalkInSchema = z.object({
  phone: phoneField,
  full_name: z
    .string()
    .trim()
    .max(200, "Keep the name under 200 characters.")
    .optional()
    .transform((v) => v || null),
  station_service_id: z.string().trim().guid("Choose a service."),
});

export const publicBookSlotSchema = z.object({
  phone: phoneField,
  full_name: z
    .string()
    .trim()
    .max(200, "Keep the name under 200 characters.")
    .optional()
    .transform((v) => v || null),
  station_id: z.string().trim().guid("Choose a station."),
  service_id: z.string().trim().guid("Choose a service."),
  start_at: z.string().trim().min(1, "Choose an available time."),
});
