import { z } from "zod";
import { isValidE164 } from "@gas-station/utils";

// The same @gas-station/utils function every other phone field in this
// codebase validates against (employees/schema.ts, bookings/schema.ts) —
// one definition of "valid phone", not a second phone-number system for
// the public flow.
const phoneField = z.string().trim().refine(isValidE164, "Enter a valid phone number.");

// Supabase's own SMS/email OTP codes are 6 digits.
const otpCodeField = z
  .string()
  .trim()
  .regex(/^[0-9]{6}$/, "Enter the 6-digit code.");

export const publicPhoneSchema = z.object({
  phone: phoneField,
});

// Step 1: phone + (for a genuinely new phone) full name, sent together so
// handle_new_user() has everything it needs at auth.users INSERT time —
// see supabase/migrations/20240101000070_auth_handlers.sql. full_name is
// ignored by Supabase for an existing user (a login OTP never re-runs that
// trigger), so it's harmless to always send it once collected.
export const publicSendPhoneOtpSchema = z.object({
  phone: phoneField,
  full_name: z
    .string()
    .trim()
    .max(200, "Keep the name under 200 characters.")
    .optional()
    .transform((v) => v || null),
});

export const publicVerifyPhoneOtpSchema = z.object({
  phone: phoneField,
  code: otpCodeField,
});

export const publicSendEmailOtpSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address."),
});

export const publicVerifyEmailOtpSchema = z.object({
  email: z.string().trim().email(),
  code: otpCodeField,
});

// No phone/full_name here anymore — the customer is identified by their
// own verified session (auth.uid()), not passed in from the client. See
// join/[token]/actions.ts.
export const publicStartWalkInSchema = z.object({
  station_service_id: z.string().trim().guid("Choose a service."),
});

export const publicBookSlotSchema = z.object({
  station_id: z.string().trim().guid("Choose a station."),
  service_id: z.string().trim().guid("Choose a service."),
  start_at: z.string().trim().min(1, "Choose an available time."),
});
