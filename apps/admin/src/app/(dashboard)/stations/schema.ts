import { z } from "zod";

/** Shared by createStationAction and updateStationAction. */
export const stationFormSchema = z.object({
  name_en: z.string().trim().min(1, "English name is required."),
  name_ar: z.string().trim().min(1, "Arabic name is required."),
  address_en: z.string().trim().min(1, "English address is required."),
  address_ar: z.string().trim().min(1, "Arabic address is required."),
  latitude: z.coerce.number().min(-90, "Latitude must be between -90 and 90.").max(90, "Latitude must be between -90 and 90."),
  longitude: z.coerce
    .number()
    .min(-180, "Longitude must be between -180 and 180.")
    .max(180, "Longitude must be between -180 and 180."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  description_en: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  description_ar: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
});

export type HoursMode = "closed" | "24h" | "custom";

export interface HourRowInput {
  day_of_week: number;
  mode: HoursMode;
  opens_at: string;
  closes_at: string;
}

export const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * Shared by upsertStationHoursAction and upsertServiceHoursAction
 * (stations/[id]/services/actions.ts) — same row shape, same rules.
 * Returns an error message, or undefined if every row is valid.
 */
export function validateHourRows(rows: HourRowInput[]): string | undefined {
  for (const row of rows) {
    if (row.mode === "custom" && (!row.opens_at || !row.closes_at)) {
      return "Set both an opening and closing time, or choose Closed / 24 hours instead.";
    }
    if (row.mode === "custom" && row.opens_at === row.closes_at) {
      return "Opening and closing time can't be the same — for 24 hours, use the 24 Hours option instead.";
    }
  }
  return undefined;
}
