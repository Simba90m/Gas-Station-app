import { z } from "zod";

// Deliberately a separate schema object from bookings/schema.ts's
// createCustomerSchema — same phone shape (matches the CHECK constraint on
// profiles.phone), but this one backs the public, unauthenticated
// self-service path and must never be assumed interchangeable with the
// staff-only one (see actions.ts for the authorization difference).
export const publicJoinCustomerSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required.").max(200, "Keep the name under 200 characters."),
  phone: z
    .string()
    .trim()
    .regex(/^\+20(10|11|12|15)[0-9]{8}$/, "Enter a valid Egyptian mobile number, e.g. +201012345678."),
});

export const publicJoinQueueSchema = z.object({
  station_service_id: z.string().trim().guid("Choose a service."),
});

export const publicBookSlotSchema = z.object({
  station_id: z.string().trim().guid("Choose a station."),
  service_id: z.string().trim().guid("Choose a service."),
  start_at: z.string().trim().min(1, "Choose an available time."),
});
