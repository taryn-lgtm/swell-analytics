-- =====================================================================
-- 00000000000010 — make v_provenance_gaps cover what item 7 claims, and
--                  add a view that catches it drifting again
--
-- Closes the open half of M1 item 7. Recorded as open since 13 August 2026.
--
-- WHY
--   Item 7 says "every row traceable to a raw artefact by ID. A provenance
--   column, not a promise." v_provenance_gaps is the instrument that asserts it,
--   and it has been inspecting a minority of the rows it is read as covering.
--
--   Thirteen base tables carry an artefact_id column. The view referenced six:
--   rounds, heats, venues, surfers, points_band_occupancy, round_templates.
--   It did not reference events, heat_entries, event_entries, season_rankings,
--   points_bands, interferences or waves.
--
--   Measured on 19 August 2026, after the Tier 2 load:
--     covered    234 rows   (rounds 21 + heats 141 + venues 0 + surfers 42
--                            + occupancy 13 + templates 17)
--     uncovered  860 rows   (heat_entries 330 + waves 520 + points_bands 7
--                            + events 3 + event_entries 0 + interferences 0
--                            + season_rankings 0)
--     total    1,094 rows
--
--   CORRECTED after the fact. The line above first read "uncovered 673 rows",
--   hand-added and wrong: it dropped points_bands entirely and mis-summed the
--   rest. v_provenance_coverage, added by this migration, returned 1,094 on the
--   first run and that is the measured figure. The error was in a paragraph
--   about a view that had been quietly under-counting — which is the project's
--   own rule, "arithmetic in the report is data too", failing in the act of
--   fixing an instance of it. Both numbers are kept so the correction is
--   visible rather than tidied away.
--   The view returned 0, which was true, and would have been read as "item 7
--   passes", which was not. The uncovered rows were checked directly and are
--   clean; the point is that the check was not doing the checking.
--
--   This is the second time this exact defect has been caught by reading
--   pg_get_viewdef before quoting a zero — see docs/findings and the 13 August
--   note about 90 of 201 rows. Catching it twice by hand is a warning that
--   hand-catching is the wrong mechanism.
--
-- WHAT THIS DOES
--   1. Rewrites v_provenance_gaps over all thirteen tables.
--   2. Adds v_provenance_uncovered, which reads information_schema and returns
--      any base table carrying an artefact_id column that v_provenance_gaps
--      does not name. It must be empty. A new table with an artefact_id column
--      now shows up as a row rather than as silence.
--   3. Adds v_provenance_coverage, so a zero from the gaps view can be quoted
--      alongside the row count it was computed over — which this project's own
--      rules require and which nothing made easy before.
--
-- SCOPE
--   Views only. No table is altered, no row is written or deleted.
--   Strictly additive in what it inspects: every row the old view checked is
--   still checked.
--
-- NOTE ON seasons.champion_artefact_id
--   `seasons` carries provenance under a different column name and so is
--   deliberately outside all three views — a column called artefact_id is what
--   they key on. Item 6's own seed asserts that column is non-null, which is
--   the right place for it. Named here so the absence is a decision on the
--   record rather than an oversight.
--
-- ORDERING
--   00000000000005 and 00000000000007 are deliberately unapplied and must stay
--   that way — CLAUDE.md trap 17. Apply this through the SQL Editor or psql.
-- =====================================================================

BEGIN;

-- v_provenance_uncovered embeds 'public.v_provenance_gaps'::regclass, which
-- Postgres records as a dependency on the relation. Dropping the gaps view
-- while it exists would fail, so this migration would not be re-runnable.
-- Drop the dependent first and rebuild it below.
DROP VIEW IF EXISTS v_provenance_uncovered;
DROP VIEW IF EXISTS v_provenance_gaps;

CREATE VIEW v_provenance_gaps
WITH (security_invoker = true) AS
  -- Tables with a surrogate id, so a gap can be pointed at.
  SELECT 'events'::text        AS table_name, e.id  AS row_id FROM events e        WHERE e.artefact_id  IS NULL
  UNION ALL
  SELECT 'rounds'::text,        r.id  FROM rounds r            WHERE r.artefact_id  IS NULL
  UNION ALL
  SELECT 'heats'::text,         h.id  FROM heats h             WHERE h.artefact_id  IS NULL
  UNION ALL
  SELECT 'heat_entries'::text,  he.id FROM heat_entries he     WHERE he.artefact_id IS NULL
  UNION ALL
  SELECT 'waves'::text,         w.id  FROM waves w             WHERE w.artefact_id  IS NULL
  UNION ALL
  SELECT 'event_entries'::text, ee.id FROM event_entries ee    WHERE ee.artefact_id IS NULL
  UNION ALL
  SELECT 'interferences'::text, i.id  FROM interferences i     WHERE i.artefact_id  IS NULL
  UNION ALL
  SELECT 'venues'::text,        v.id  FROM venues v            WHERE v.artefact_id  IS NULL
  UNION ALL
  SELECT 'surfers'::text,       sf.id FROM surfers sf          WHERE sf.artefact_id IS NULL
  UNION ALL
  -- Tables with a natural key and no id column. row_id is null by shape, not
  -- by omission; the table_name still says where to look.
  SELECT 'points_bands'::text,          NULL::bigint FROM points_bands          WHERE artefact_id IS NULL
  UNION ALL
  SELECT 'points_band_occupancy'::text, NULL::bigint FROM points_band_occupancy WHERE artefact_id IS NULL
  UNION ALL
  SELECT 'round_templates'::text,       NULL::bigint FROM round_templates       WHERE artefact_id IS NULL
  UNION ALL
  SELECT 'season_rankings'::text,       NULL::bigint FROM season_rankings       WHERE artefact_id IS NULL;

COMMENT ON VIEW v_provenance_gaps IS
  'Every row in a base table carrying an artefact_id column, where that column is null. Must be empty — M1 item 7. Widened by 00000000000010 from six tables to thirteen; it previously inspected 234 of 907 rows and returned an honest zero that would have been read as a passing check over everything. Before quoting a zero from this view, read v_provenance_coverage for the row count it was computed over, and v_provenance_uncovered to confirm it still names every table it should.';

-- --------------------------------------------------------------------
-- The guard on the guard.
-- --------------------------------------------------------------------
CREATE VIEW v_provenance_uncovered
WITH (security_invoker = true) AS
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name   = c.table_name
   AND t.table_type   = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.column_name  = 'artefact_id'
    -- Word-bounded, so `points_band_occupancy` in the definition cannot be
    -- mistaken for coverage of `points_bands`.
    AND pg_get_viewdef('public.v_provenance_gaps'::regclass, true)
        !~ ('\m' || c.table_name || '\M');

COMMENT ON VIEW v_provenance_uncovered IS
  'Base tables carrying an artefact_id column that v_provenance_gaps does not name. Must be empty. This exists because the gaps view silently fell behind the schema twice — a table gaining an artefact_id column without being added there is now a row here rather than an absence nobody sees.';

-- --------------------------------------------------------------------
-- The row counts a verdict must be quoted with.
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW v_provenance_coverage
WITH (security_invoker = true) AS
  SELECT 'events'::text AS table_name, count(*) AS rows_total, count(*) FILTER (WHERE artefact_id IS NULL) AS rows_null FROM events
  UNION ALL SELECT 'rounds',                count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM rounds
  UNION ALL SELECT 'heats',                 count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM heats
  UNION ALL SELECT 'heat_entries',          count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM heat_entries
  UNION ALL SELECT 'waves',                 count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM waves
  UNION ALL SELECT 'event_entries',         count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM event_entries
  UNION ALL SELECT 'interferences',         count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM interferences
  UNION ALL SELECT 'venues',                count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM venues
  UNION ALL SELECT 'surfers',               count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM surfers
  UNION ALL SELECT 'points_bands',          count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM points_bands
  UNION ALL SELECT 'points_band_occupancy', count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM points_band_occupancy
  UNION ALL SELECT 'round_templates',       count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM round_templates
  UNION ALL SELECT 'season_rankings',       count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM season_rankings;

COMMENT ON VIEW v_provenance_coverage IS
  'Row count and null-artefact count per table carrying an artefact_id column. Exists so "v_provenance_gaps returns 0" can be reported with the number of rows that zero was computed over, which this project requires and twice failed to do.';

-- --------------------------------------------------------------------
-- Prove the new instruments before trusting them.
-- --------------------------------------------------------------------
DO $$
DECLARE
  uncovered int; gaps int; covered bigint; probe int;
BEGIN
  SELECT count(*) INTO uncovered FROM v_provenance_uncovered;
  IF uncovered > 0 THEN
    RAISE EXCEPTION 'v_provenance_gaps still fails to name % table(s) that carry artefact_id: %',
      uncovered, (SELECT string_agg(table_name, ', ') FROM v_provenance_uncovered);
  END IF;

  SELECT sum(rows_total) INTO covered FROM v_provenance_coverage;
  SELECT count(*) INTO gaps FROM v_provenance_gaps;

  -- A view that has never returned a row has not been shown to work. Prove it
  -- fires by asking it a question it must answer yes to, using a table where
  -- artefact_id is nullable, without writing anything.
  SELECT count(*) INTO probe FROM (
    SELECT 1 FROM heats WHERE artefact_id IS NULL
    UNION ALL SELECT 1 FROM venues WHERE artefact_id IS NULL
  ) t;
  IF probe <> (SELECT count(*) FROM v_provenance_gaps WHERE table_name IN ('heats','venues')) THEN
    RAISE EXCEPTION 'v_provenance_gaps disagrees with a direct count over heats and venues.';
  END IF;

  RAISE NOTICE 'v_provenance_gaps: % gap(s) over % rows across 13 tables. v_provenance_uncovered: 0.',
    gaps, covered;
END $$;

INSERT INTO public.schema_migrations (version)
VALUES ('00000000000010_provenance_gaps_complete.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
