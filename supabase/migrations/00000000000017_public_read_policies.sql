-- =====================================================================
-- 00000000000017_public_read_policies.sql
-- M3: let the publishable key read the competition and model tables
-- =====================================================================
--
-- Depends on: 00000000000001_m1_schema.sql, 00000000000004_view_security_invoker.sql,
--             00000000000014_datum_v1.sql, 00000000000015_trim_v1.sql
-- Target:     v2, ref tjwqskjsyluxepdbwjet
--
-- THE DEFECT. Every v2 table has RLS enabled and no policy, and every
-- view runs as security_invoker (migration 4). That was correct for M1
-- and M2, when the only readers were ingest scripts holding the secret
-- key, which bypasses RLS. It means the Next.js app, which holds the
-- publishable key by design (src/lib/db/server.ts: "everything it can
-- see is governed by RLS"), reads ZERO rows from everything.
--
-- Measured 8 September 2026 as the anon role, inside a rolled-back
-- transaction: v_trim_current 0, events 0, trim 0. M3 item 1 ("the app
-- reads v2") was verified by grep and typecheck, never by a row, so this
-- was invisible until a route asked for one. Migration 4 anticipated it:
-- "read policies added there [M3] will now govern the views too, which
-- is what was intended all along."
--
-- THE FIX. One SELECT policy per table the four capped routes read, for
-- anon and authenticated, USING (true). The data is published WSL
-- results and this project's own derived model rows; nothing here is
-- per-user. Views inherit through security_invoker, so no view needs a
-- grant of its own.
--
-- NOT COVERED, deliberately: artefacts (raw retained HTML and sidecar
-- paths -- retention is a project asset, not a page), schema_migrations,
-- countries (the app derives names from surfers.country_code), and the
-- round-template and points-band reference tables, which no route reads.
-- If a route comes to need one, add it here by name; do not widen to
-- "all tables".
--
-- WRITES. Supabase's default grants give anon INSERT/UPDATE/DELETE on
-- every table in public. RLS with no INSERT/UPDATE/DELETE policy blocks
-- all of them, and this migration adds none, so the app's zero-writes
-- claim holds. It rests on RLS staying enabled -- verify_m1_schema.sql
-- checks that.
--
-- =====================================================================

BEGIN;

-- Competition
CREATE POLICY seasons_public_read      ON seasons      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY eras_public_read         ON eras         FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY events_public_read       ON events       FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY venues_public_read       ON venues       FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rounds_public_read       ON rounds       FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY heats_public_read        ON heats        FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY heat_entries_public_read ON heat_entries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY waves_public_read        ON waves        FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY surfers_public_read      ON surfers      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY event_entries_public_read ON event_entries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY season_rankings_public_read ON season_rankings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY interferences_public_read ON interferences FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY interference_wave_effects_public_read ON interference_wave_effects FOR SELECT TO anon, authenticated USING (true);

-- Model
CREATE POLICY datum_public_read               ON datum               FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY datum_model_runs_public_read    ON datum_model_runs    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY datum_round_effects_public_read ON datum_round_effects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY trim_public_read                ON trim                FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY trim_model_runs_public_read     ON trim_model_runs     FOR SELECT TO anon, authenticated USING (true);

-- Provenance the pages disclose
CREATE POLICY data_gaps_public_read ON data_gaps FOR SELECT TO anon, authenticated USING (true);

COMMIT;

-- Verify, as the app would see it (run as-is; it rolls back):
--
--   BEGIN; SET LOCAL ROLE anon;
--   SELECT (SELECT count(*) FROM v_trim_current) AS trim_current,   -- expect 73
--          (SELECT count(*) FROM events)         AS events,         -- expect 22
--          (SELECT count(*) FROM trim)           AS trim,           -- expect 1843
--          (SELECT count(*) FROM artefacts)      AS artefacts;      -- expect 0: not covered
--   ROLLBACK;
--
-- and get_advisors(type: security) should no longer report
-- rls_enabled_no_policy for the nineteen tables above.
