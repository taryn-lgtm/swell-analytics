-- =====================================================================
-- 00000000000004_deferred_season_gaps.sql
-- Season-scoped data_gaps, deferred until seasons rows exist
-- =====================================================================
--
-- Depends on: 00000000000003_era_a_points_and_artefacts.sql
--             AND on the seasons rows for 2023 and 2024 existing.
-- Target:     v2, ref tjwqskjsyluxepdbwjet
--
-- SAFE TO APPLY. It used to fail with 23503 until ingest had created the
-- seasons rows; it now inserts only for seasons that actually exist, and is
-- idempotent. See the note beside the WHERE clause below.
--
-- WHY THIS FILE EXISTS. These two rows were written into
-- 00000000000003 on 8 August. They cannot go there:
-- data_gaps.season_year is a foreign key to seasons(year), the seasons
-- table is populated by ingest, and 00000000000003 runs long before
-- ingest does. Applying 00000000000003 with these rows in it fails at
-- the last statement and rolls the whole migration back — the artefacts,
-- the points table and the band occupancy with it.
--
-- Found on 8 August by executing the migration against v2. The file had
-- been parsed against the PostgreSQL grammar and simulated, and neither
-- catches this: a foreign key violation is a runtime fact about rows,
-- not a syntactic one. This is the eleventh defect against
-- docs/SCHEMA_DESIGN.md and the first that only execution could find.
--
-- The gaps themselves are real and must not be dropped. They are the
-- honest record that two of the four Era A seasons have no
-- contemporaneous rulebook behind their points table —
-- docs/findings/2026-07-29_rulebook_provenance.md §1-2.
--
-- =====================================================================

BEGIN;

INSERT INTO data_gaps (scope, season_year, field, reason, source_note)
SELECT v.scope, v.season_year, v.field, v.reason, v.source_note
FROM (VALUES
  ('season', 2023, 'points_bands provenance',
   'No rulebook is held that governs the 2023 season. The book titled 2023 states in its preface and on its Appendix A tables that it governs 2022. The points values are bracketed by identical 2022 and 2025 tables, which is strong, but bracketing is not a citation.',
   'docs/findings/2026-07-29_rulebook_provenance.md §1-2.'),

  ('season', 2024, 'points_bands provenance',
   'No rulebook is held that governs the 2024 season. The book titled 2024 states in its preface and on its Appendix A tables that it governs 2025. Same bracketing argument as 2023.',
   'docs/findings/2026-07-29_rulebook_provenance.md §1-2.')
) AS v(scope, season_year, field, reason, source_note)
-- Only for seasons that exist. 19 August 2026: this migration failed with
-- 23503 on Key (season_year)=(2023), because M1's scope was narrowed to 2024
-- and 2025 and 2023 is no longer loaded. It had never been applied, so the
-- failure surfaced only when something finally ran it — and because migrate.ts
-- stops at the first failure, it was also holding 07 and 11 behind it.
--
-- The 2023 row is KEPT, not deleted. The gap is real and the finding behind it
-- stands; it simply has no season row to attach to while 2023 is out of scope.
-- If 2023 is ever loaded, re-running this migration writes it then.
WHERE EXISTS (SELECT 1 FROM seasons s WHERE s.year = v.season_year)
  -- Idempotent: data_gaps has no unique constraint, so re-running must not
  -- duplicate. Matches the pattern the ingest seeds use.
  AND NOT EXISTS (
    SELECT 1 FROM data_gaps d
    WHERE d.season_year = v.season_year AND d.field = v.field AND d.closed_at IS NULL
  );

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM data_gaps
  WHERE field = 'points_bands provenance' AND closed_at IS NULL;
  RAISE NOTICE '% points_bands provenance gap(s) recorded, one per loaded season that has no governing rulebook.', n;
END $$;

COMMIT;
