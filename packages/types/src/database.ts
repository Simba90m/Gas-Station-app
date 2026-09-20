/**
 * Hand-written, scoped-to-what's-used database types — NOT the full schema.
 *
 * The real source of truth is supabase/migrations/. Once Docker is
 * available, run `pnpm db:types` to replace this file with the real
 * generated one (see packages/types/src/index.ts and README.md); until
 * then, every table/column below was checked by hand against its migration
 * file and only covers the tables Phase 3 (admin dashboard + station
 * management) actually queries. Extend it table-by-table as later phases
 * need more, the same way `supabase gen types` would.
 *
 * Shape matches exactly what `@supabase/postgrest-js`'s GenericSchema /
 * GenericTable require (Tables/Views/Functions at the schema level; Row/
 * Insert/Update/Relationships per table) — this isn't optional decoration,
 * `createClient<Database>()` silently infers every query's row type as
 * `never` if the shape doesn't structurally match, which is exactly what
 * happened here until this was fixed. Swapping in the real generated file
 * later is a drop-in replacement for consumers.
 */

import type { UserRole } from "./roles";

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type ComplaintStatus = "NEW" | "IN_REVIEW" | "INVESTIGATING" | "RESOLVED" | "CLOSED";

export type QueueStatus = "WAITING" | "CALLED" | "IN_SERVICE" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export type IssueCategory =
  | "SERVICE_QUALITY"
  | "EMPLOYEE_BEHAVIOR"
  | "WAITING_TIME"
  | "CLEANLINESS"
  | "PRODUCT_QUALITY"
  | "PAYMENT"
  | "OTHER";

export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

export type ResourceStatus = "AVAILABLE" | "MAINTENANCE" | "INACTIVE";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          phone: string | null;
          preferred_locale: "en" | "ar";
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        // Created only by the handle_new_user trigger — never inserted by
        // the app — but still typed as a real (if unused) Insert shape to
        // match what the real generator would produce.
        Insert: {
          id: string;
          role?: UserRole;
          full_name: string;
          phone?: string | null;
          preferred_locale?: "en" | "ar";
          avatar_url?: string | null;
          is_active?: boolean;
        };
        // role/is_active are intentionally not updatable directly — see
        // the column GRANT in supabase/migrations/20240101000110_rls_identity.sql
        // (only set_profile_role()/set_profile_active() can change them).
        Update: {
          full_name?: string;
          phone?: string | null;
          preferred_locale?: "en" | "ar";
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      stations: {
        Row: {
          id: string;
          name_en: string;
          name_ar: string;
          description_en: string | null;
          description_ar: string | null;
          address_en: string;
          address_ar: string;
          latitude: number;
          longitude: number;
          phone: string | null;
          logo_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name_en: string;
          name_ar: string;
          description_en?: string | null;
          description_ar?: string | null;
          address_en: string;
          address_ar: string;
          latitude: number;
          longitude: number;
          phone?: string | null;
          logo_url?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["stations"]["Insert"]>;
        Relationships: [];
      };
      station_operating_hours: {
        Row: {
          id: string;
          station_id: string;
          day_of_week: number;
          is_closed: boolean;
          is_24_hours: boolean;
          opens_at: string | null;
          closes_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          station_id: string;
          day_of_week: number;
          is_closed?: boolean;
          is_24_hours?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["station_operating_hours"]["Insert"]>;
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          name_en: string;
          name_ar: string;
          description_en: string | null;
          description_ar: string | null;
          image_url: string | null;
          base_price: number;
          duration_minutes: number;
          requires_employee_selection: boolean;
          requires_resource: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name_en: string;
          name_ar: string;
          description_en?: string | null;
          description_ar?: string | null;
          image_url?: string | null;
          base_price: number;
          duration_minutes: number;
          requires_employee_selection?: boolean;
          requires_resource?: boolean;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["services"]["Insert"]>;
        Relationships: [];
      };
      station_services: {
        Row: {
          id: string;
          station_id: string;
          service_id: string;
          price_override: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          station_id: string;
          service_id: string;
          price_override?: number | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["station_services"]["Insert"]>;
        Relationships: [];
      };
      // Keyed by station_service_id (a specific station's offering of a
      // service), not service_id — see
      // supabase/migrations/20240101000190_station_scoped_service_hours.sql
      // and docs/DATABASE_DESIGN.md "Changes from the original plan" #3.
      service_operating_hours: {
        Row: {
          id: string;
          station_service_id: string;
          day_of_week: number;
          is_closed: boolean;
          is_24_hours: boolean;
          opens_at: string | null;
          closes_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          station_service_id: string;
          day_of_week: number;
          is_closed?: boolean;
          is_24_hours?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["service_operating_hours"]["Insert"]>;
        Relationships: [];
      };
      service_resources: {
        Row: {
          id: string;
          station_service_id: string;
          name_en: string;
          name_ar: string;
          status: ResourceStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          station_service_id: string;
          name_en: string;
          name_ar: string;
          status?: ResourceStatus;
        };
        Update: Partial<Database["public"]["Tables"]["service_resources"]["Insert"]>;
        Relationships: [];
      };
      employee_station_assignments: {
        Row: {
          id: string;
          profile_id: string;
          station_id: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          station_id: string;
          is_primary?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["employee_station_assignments"]["Insert"]>;
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          hire_date: string | null;
          bio_en: string | null;
          bio_ar: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          hire_date?: string | null;
          bio_en?: string | null;
          bio_ar?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [];
      };
      employee_working_hours: {
        Row: {
          id: string;
          employee_id: string;
          day_of_week: number;
          is_closed: boolean;
          is_24_hours: boolean;
          starts_at: string | null;
          ends_at: string | null;
          break_starts_at: string | null;
          break_ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          day_of_week: number;
          is_closed?: boolean;
          is_24_hours?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          break_starts_at?: string | null;
          break_ends_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["employee_working_hours"]["Insert"]>;
        Relationships: [];
      };
      // No status column — "active" means ended_at IS NULL (see the
      // partial UNIQUE index restricting an employee to one active shift
      // at a time), "completed" means it's set. Derived in the UI, not stored.
      shifts: {
        Row: {
          id: string;
          employee_id: string;
          station_id: string;
          started_at: string;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          station_id: string;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["shifts"]["Insert"]>;
        Relationships: [];
      };
      // Keyed by the global service (services.id), not a station's specific
      // offering — a skill belongs to the person. See
      // supabase/migrations/20240101000200_employee_service_capabilities.sql.
      employee_service_capabilities: {
        Row: {
          id: string;
          employee_id: string;
          service_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          service_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_service_capabilities"]["Insert"]>;
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          customer_id: string;
          station_id: string;
          station_service_id: string;
          resource_id: string | null;
          employee_id: string | null;
          time_range: string;
          status: BookingStatus;
          price: number;
          customer_notes: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          station_id: string;
          station_service_id: string;
          resource_id?: string | null;
          employee_id?: string | null;
          time_range: string;
          status?: BookingStatus;
          price: number;
          customer_notes?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
        Relationships: [];
      };
      complaints: {
        Row: {
          id: string;
          customer_id: string;
          station_id: string | null;
          booking_id: string | null;
          employee_id: string | null;
          category: IssueCategory;
          description: string;
          photo_url: string | null;
          status: ComplaintStatus;
          // internal_notes is deliberately omitted: the database revokes
          // column-level SELECT on it for the `authenticated` role (see
          // supabase/migrations/20240101000080_feedback_and_complaints.sql)
          // — a normal query can never return it, only
          // get_complaint_internal_notes() can, so it has no place in Row.
          created_at: string;
          updated_at: string;
        };
        // Matches the column GRANT exactly — internal_notes can't be
        // inserted either.
        Insert: {
          id?: string;
          customer_id: string;
          station_id?: string | null;
          booking_id?: string | null;
          employee_id?: string | null;
          category: IssueCategory;
          description: string;
          photo_url?: string | null;
          status?: ComplaintStatus;
        };
        // Matches `GRANT UPDATE (status) ON public.complaints` exactly —
        // status is the only column `authenticated` can update directly.
        Update: {
          status?: ComplaintStatus;
        };
        Relationships: [];
      };
      offers: {
        Row: {
          id: string;
          title_en: string;
          title_ar: string;
          description_en: string | null;
          description_ar: string | null;
          image_url: string | null;
          service_id: string | null;
          discount_type: DiscountType;
          discount_value: number;
          starts_at: string;
          ends_at: string;
          terms_en: string | null;
          terms_ar: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          title_en: string;
          title_ar: string;
          description_en?: string | null;
          description_ar?: string | null;
          image_url?: string | null;
          service_id?: string | null;
          discount_type: DiscountType;
          discount_value: number;
          starts_at: string;
          ends_at: string;
          terms_en?: string | null;
          terms_ar?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["offers"]["Insert"]>;
        Relationships: [];
      };
      queue_entries: {
        Row: {
          id: string;
          queue_id: string;
          customer_id: string;
          position: number;
          estimated_wait_minutes: number | null;
          status: QueueStatus;
          joined_at: string;
          called_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          queue_id: string;
          customer_id: string;
          position: number;
          estimated_wait_minutes?: number | null;
          status?: QueueStatus;
          joined_at?: string;
          called_at?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["queue_entries"]["Insert"]>;
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          booking_id: string;
          customer_id: string;
          station_id: string;
          station_service_id: string;
          employee_id: string | null;
          rating: number;
          category: IssueCategory;
          comment: string | null;
          photo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        // customer_id/station_id/station_service_id/employee_id are
        // populate_feedback_from_booking-trigger-derived — required by the
        // Row's NOT NULL columns, but the trigger fills them from
        // booking_id before the constraint is checked, so a real client
        // only ever needs to send booking_id/rating/category/comment/photo_url.
        // Kept required here to match what the schema itself (not the
        // trigger) declares, same as the real generator would produce.
        Insert: {
          id?: string;
          booking_id: string;
          customer_id: string;
          station_id: string;
          station_service_id: string;
          employee_id?: string | null;
          rating: number;
          category: IssueCategory;
          comment?: string | null;
          photo_url?: string | null;
        };
        // Matches `GRANT UPDATE (rating, category, comment, photo_url)`.
        Update: {
          rating?: number;
          category?: IssueCategory;
          comment?: string | null;
          photo_url?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // SECURITY DEFINER, OWNER/MANAGER-only (see
      // supabase/migrations/20240101000110_rls_identity.sql) — used to
      // promote an existing profile to EMPLOYEE. RETURNS void.
      set_profile_role: {
        Args: { p_profile_id: string; p_role: UserRole };
        Returns: null;
      };
    };
  };
}
