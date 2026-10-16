-- =====================================================================
-- 00000000000004_view_security_invoker.sql
-- Close the RLS bypass through the audit views
-- =====================================================================
--
-- Depends on: 00000000000001_m1_schema.sql
-- Target:     v2, ref tjwqskjsyluxepdbwjet
--
-- THE DEFECT. 00000000000001 enables RLS on all nineteen tables with no
-- policies, on the reasoning that "no policies means the anon role is
-- denied outright" (docs/findings/2026-08-08_schema_review.md §5). That
-- reasoning is correct for the tables and wrong for the views.
--
-- A Postgres view executes with the privileges of its OWNER unless
-- security_invoker is set. All thirteen views are owned by the migration
-- role, and Supabase grants SELECT on everything in `public` to `anon`
-- and `authenticated` by default. Verified on 8 August: both roles hold
-- SELECT on all thirteen. So anyone holding the publishable key could
-- read the entire dataset through v_points_reconciliation and the rest,
-- with RLS on the base tables never consulted.
--
-- Found by running get_advisors after applying, which reported
-- security_definer_view at ERROR level on all thirteen. It is not
-- findable by parsing and it is not findable by the negative tests in
-- verify_m1_schema.sql, which only exercise constraints.
--
-- THE FIX. security_invoker makes each view run as the querying role, so
-- RLS on the base tables applies to view reads as well. Requires
-- PostgreSQL 15+; v2 is on 17.6.
--
-- No effect on ingest: SUPABASE_SECRET_KEY_V2 bypasses RLS regardless.
-- No effect on M3 either — read policies added there will now govern the
-- views too, which is what was intended all along.
--
-- =====================================================================

BEGIN;

ALTER VIEW v_points_reconciliation              SET (security_invoker = on);
ALTER VIEW v_points_disagreements               SET (security_invoker = on);
ALTER VIEW v_throwaway_disagreements            SET (security_invoker = on);
ALTER VIEW v_heat_total_agreement               SET (security_invoker = on);
ALTER VIEW v_heat_total_disagreements           SET (security_invoker = on);
ALTER VIEW v_band_occupancy_check               SET (security_invoker = on);
ALTER VIEW v_pre_cut_count_check                SET (security_invoker = on);
ALTER VIEW v_provenance_gaps                    SET (security_invoker = on);
ALTER VIEW v_round_template_cohorts             SET (security_invoker = on);
ALTER VIEW v_round_template_band_disagreements  SET (security_invoker = on);
ALTER VIEW v_round_template_flow_disagreements  SET (security_invoker = on);
ALTER VIEW v_round_template_outcome_gaps        SET (security_invoker = on);
ALTER VIEW v_round_structure_deviations         SET (security_invoker = on);

COMMIT;

-- Verify: get_advisors(type: security) should return no
-- security_definer_view rows. The nineteen rls_enabled_no_policy notices
-- at INFO level are expected and intended until M3.
