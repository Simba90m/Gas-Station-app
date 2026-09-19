-- ============================================================================
-- handle_new_user: runs when a new row appears in Supabase's auth.users
-- (i.e. right after someone signs up). Creates the matching profiles row
-- automatically — the app never inserts into profiles directly.
--
-- Every self-signup becomes a CUSTOMER. Staff accounts (EMPLOYEE,
-- STATION_MANAGER, MANAGER, OWNER) are never created by public signup — an
-- OWNER/MANAGER promotes an existing profile afterwards (UPDATE profiles SET
-- role = ...; see the RLS policy on profiles for who's allowed to do that).
-- This prevents privilege escalation via signup metadata: nothing supplied
-- at signup can grant a role above CUSTOMER.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    'CUSTOMER',
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'phone'
  );

  INSERT INTO public.customers (id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- RLS helper functions.
--
-- These are SECURITY DEFINER (run with the privileges of the function's
-- owner, not the calling user) and STABLE, with search_path pinned — the
-- standard, safe Supabase pattern for a function that needs to read
-- `profiles`/`employee_station_assignments` from inside another table's RLS
-- policy without recursing into that table's own RLS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- MANAGER's brief is "management access according to assigned scope," but
-- the project's table list has no scope table for MANAGER (only
-- employee_station_assignments, which is for EMPLOYEE/STATION_MANAGER).
-- Documented Phase 2 simplification: MANAGER is treated the same as OWNER
-- (all-station access) until a scoping mechanism is specified.
CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('OWNER', 'MANAGER');
$$;

CREATE OR REPLACE FUNCTION public.is_station_staff(p_station_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.employee_station_assignments
      WHERE profile_id = auth.uid() AND station_id = p_station_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_employee(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_employee_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.owns_customer_row(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_customer_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_station_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_employee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_customer_row(uuid) TO authenticated;
