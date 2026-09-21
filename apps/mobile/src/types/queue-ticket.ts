import type { QueueStatus } from "@gas-station/types";

export interface QueueTicket {
  queueEntryId: string;
  position: number;
  status: QueueStatus;
  rank: number;
  estimatedWaitMinutes: number;
}

// get_queue_ticket_status()'s own return column is queue_position, not
// position — POSITION is a reserved SQL keyword and can't be an unquoted
// RETURNS TABLE column name (see
// supabase/migrations/20240101000260_global_phone_and_kiosk.sql).
// QueueTicket.position (this app's own name for it) is unaffected — same
// convention apps/admin/src/app/join/[token]/actions.ts already uses.
export function ticketFromRow(row: {
  id: string;
  queue_position: number;
  status: QueueStatus;
  rank: number;
  estimated_wait_minutes: number;
}): QueueTicket {
  return {
    queueEntryId: row.id,
    position: row.queue_position,
    status: row.status,
    rank: row.rank,
    estimatedWaitMinutes: row.estimated_wait_minutes,
  };
}
