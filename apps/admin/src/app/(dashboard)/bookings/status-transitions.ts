import type { BookingStatus } from "@gas-station/types";

// Mirrors validate_booking_status_transition() in
// supabase/migrations/20240101000230_booking_engine.sql exactly — forward
// movement (including skipping steps) allowed, never backward, terminal
// states final, NO_SHOW only from CONFIRMED/CHECKED_IN. Kept here purely to
// decide which buttons to show; the database trigger is what actually
// enforces it regardless of what this UI offers.
const VALID_NEXT_STATUS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "COMPLETED", "NO_SHOW", "CANCELLED"],
  CHECKED_IN: ["IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function nextStatusOptions(current: BookingStatus): BookingStatus[] {
  return VALID_NEXT_STATUS[current] ?? [];
}
