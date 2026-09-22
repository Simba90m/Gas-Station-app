import type { IssueCategory } from "@gas-station/types";

// Owner-facing labels — no raw enum values anywhere in the UI. Shared
// between the list and detail views. Same category list as complaints
// (see supabase/migrations/20240101000000_extensions_and_enums.sql).
export const ISSUE_CATEGORY_LABELS: Record<IssueCategory, string> = {
  SERVICE_QUALITY: "Service quality",
  EMPLOYEE_BEHAVIOR: "Employee behavior",
  WAITING_TIME: "Waiting time",
  CLEANLINESS: "Cleanliness",
  PRODUCT_QUALITY: "Product quality",
  PAYMENT: "Payment",
  OTHER: "Other",
};
