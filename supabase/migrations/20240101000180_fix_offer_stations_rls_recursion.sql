-- ============================================================================
-- Fix: querying `offers` (e.g. the dashboard's active-offers count) fails
-- with Postgres error 42P17 "infinite recursion detected in policy for
-- relation offer_stations".
--
-- Root cause: offers_select and offer_stations_select
-- (20240101000120_rls_catalog.sql) are the one place in this schema where
-- two FORCE ROW LEVEL SECURITY tables reference each other's raw rows
-- directly in their USING clause, instead of going through a SECURITY
-- DEFINER helper function the way every other cross-table RLS check in
-- this project does (is_owner_or_manager(), is_station_staff(), etc. —
-- see the comment on those functions in 20240101000070_auth_handlers.sql
-- for exactly why that pattern exists):
--   offers_select        -> EXISTS (SELECT ... FROM offer_stations ...)
--   offer_stations_select -> EXISTS (SELECT ... FROM offers ...)
-- Because both tables have FORCE ROW LEVEL SECURITY, evaluating either
-- policy requires re-applying the OTHER table's policy to that nested
-- reference — which requires re-applying the first table's policy again,
-- and so on. This expansion happens during query rewriting/planning
-- (building the full policy-substituted query), before any row-level
-- short-circuit evaluation of the OR chain could ever apply, which is why
-- it broke for every role (including OWNER), not just anon/customers.
--
-- The symptom in the app was worse than a normal error: because the
-- dashboard's count queries use head:true (an HTTP HEAD request),
-- PostgREST's JSON error body — which would have named this exact error —
-- never reaches the client (HEAD responses have no body per the HTTP
-- spec), so the logged error appeared empty.
--
-- Fix: break the cycle the same way the rest of the schema does it — add a
-- SECURITY DEFINER function for the "is this offer currently public" check
-- and use it inside offer_stations_select instead of a raw reference to
-- offers. SECURITY DEFINER functions here are owned by the migration role,
-- which bypasses RLS entirely (including FORCE ROW LEVEL SECURITY) when it
-- queries a table directly inside the function body — so this reference no
-- longer re-triggers offers_select, and the cycle is gone. offers_select's
-- own reference to offer_stations is left as-is: it was never the problem
-- by itself, only the round trip back was.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.offer_is_currently_public(p_offer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_active AND now() BETWEEN starts_at AND ends_at
  FROM public.offers
  WHERE id = p_offer_id;
$$;

GRANT EXECUTE ON FUNCTION public.offer_is_currently_public(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS offer_stations_select ON public.offer_stations;
CREATE POLICY offer_stations_select ON public.offer_stations
  FOR SELECT TO anon, authenticated
  USING (
    public.offer_is_currently_public(offer_stations.offer_id)
    OR public.is_owner_or_manager()
    OR public.is_station_staff(offer_stations.station_id)
  );
