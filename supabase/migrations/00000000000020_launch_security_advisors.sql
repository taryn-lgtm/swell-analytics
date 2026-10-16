-- =====================================================================
-- 00000000000020_launch_security_advisors.sql
-- Clear the three open Supabase security advisors before public launch
-- =====================================================================
--
-- Depends on: 00000000000013 (v_heat_venue_gaps), 00000000000015
--             (trim_is_append_only), 00000000000019 (predictions_lock)
-- Target:     v2, ref tjwqskjsyluxepdbwjet
--
-- THE DEFECT. get_advisors on 15 October 2026 reported:
--   ERROR  security_definer_view          v_heat_venue_gaps
--   WARN   function_search_path_mutable   trim_is_append_only
--   WARN   function_search_path_mutable   predictions_lock
--
-- v_heat_venue_gaps was created by 00000000000013 with CREATE OR REPLACE
-- VIEW, which does not carry security_invoker, so it runs as its owner
-- (postgres) and bypasses RLS. 00000000000004 fixed exactly this for the
-- thirteen views that existed then; this view was born after it and was
-- never covered. Same defect, same fix.
--
-- The two trigger functions have no pinned search_path, so a role able
-- to create objects earlier on the path could shadow what they reference.
-- Neither is SECURITY DEFINER, so the exposure is small; pinning it is
-- the advisor's remediation and costs nothing.
--
-- Tested 15 October inside BEGIN ... ROLLBACK through the MCP: all three
-- statements succeed and the view still returns 88 rows to the
-- postgres role. Not applied — Taryn applies.
--
-- =====================================================================

BEGIN;

ALTER VIEW v_heat_venue_gaps SET (security_invoker = on);

ALTER FUNCTION public.trim_is_append_only() SET search_path = public, pg_temp;
ALTER FUNCTION public.predictions_lock()    SET search_path = public, pg_temp;

COMMIT;
