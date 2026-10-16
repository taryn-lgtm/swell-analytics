-- =====================================================================
-- 00000000000008_migration_ledger.sql
-- Adopt scripts/migrate.ts's ledger, seeded honestly
-- =====================================================================
--
-- Target: v2, ref tjwqskjsyluxepdbwjet
--
-- THE PROBLEM THIS SOLVES. There are two migration ledgers and they are
-- unrelated:
--
--   supabase_migrations.schema_migrations  — Supabase's own. Written by
--       the MCP connector's apply_migration. Keyed on a timestamp
--       version (20260808103948). Held five rows on 8 August.
--   public.schema_migrations               — scripts/migrate.ts's own.
--       Keyed on the FILENAME. Did not exist at all.
--
-- migrate.ts never reads Supabase's ledger. So on 8 August the script
-- believed nothing had been applied, while six migrations had been.
--
-- WHY NOT JUST RUN `npm run migrate -- --baseline`. Baseline mode with
-- no --file records EVERY .sql file in supabase/migrations/ as applied
-- without running it. Two files in that directory are deliberately NOT
-- applied:
--
--   00000000000005_deferred_season_gaps.sql   — waits for ingest to
--       create the 2023 and 2024 rows in `seasons`. Its own header says
--       DO NOT APPLY YET.
--   00000000000007_interference_wave_effects.sql — waits for an Era A
--       interference heat to be seen. Only 2026 evidence is held.
--
-- Baselining would mark both as applied. `npm run migrate` would then
-- skip them forever, and the two things most likely to be forgotten are
-- exactly the two that would be silently marked done. That is a quiet
-- failure of the kind this rebuild exists to prevent.
--
-- WHAT THIS FILE DOES. Creates the ledger and seeds it with the
-- migrations that have genuinely run, and only those. 5 and 7 are
-- absent on purpose, so `npm run migrate` will pick them up when their
-- preconditions are met.
--
-- RLS is enabled to match every other table in public. The ledger holds
-- only filenames, but an un-RLS'd table in public is reachable through
-- PostgREST and the security advisor will flag it — see
-- 00000000000004 for how that went the first time.
--
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.schema_migrations IS
  'Ledger for scripts/migrate.ts, keyed on migration filename. Distinct from supabase_migrations.schema_migrations, which is Supabase''s own and is keyed on a timestamp version. The two do not talk to each other. Seeded by 00000000000008 with the migrations applied on 8 August 2026 via the Supabase MCP connector.';

COMMENT ON COLUMN public.schema_migrations.version IS
  'The migration FILENAME, including the .sql extension. migrate.ts derives it with filePath.split("/").pop(), so renaming a migration file makes the script believe it has never run.';

INSERT INTO public.schema_migrations (version) VALUES
  ('00000000000001_m1_schema.sql'),
  ('00000000000002_era_a_round_templates.sql'),
  ('00000000000003_era_a_points_and_artefacts.sql'),
  ('00000000000004_view_security_invoker.sql'),
  ('00000000000006_heat_conditions_and_full_ride_list.sql'),
  ('00000000000008_migration_ledger.sql')
ON CONFLICT (version) DO NOTHING;

-- Deliberately NOT recorded, so that `npm run migrate` still runs them:
--   00000000000005_deferred_season_gaps.sql
--   00000000000007_interference_wave_effects.sql

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

COMMIT;
