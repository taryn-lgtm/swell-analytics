-- =====================================================================
-- 00000000000011_round_name_source_difference.sql
--
-- v_round_structure_deviations returned 43 rows on 19 August 2026, the first
-- time both seasons were fully loaded. None of them is a structural defect.
-- Every one is the rulebook and the website spelling the same round
-- differently:
--
--     round_templates (rulebook 1.06(a))   rounds.name (WSL data layer)
--     -----------------------------------  ----------------------------
--     Quarter Finals                       Quarterfinals
--     Semi Finals                          Semifinals
--     Final Match  (rulebook 1.06(e))      Title Match
--
-- BOTH ARE ATTESTED AND BOTH ARE RETAINED. round_templates.name is sourced to
-- the rulebook PDF; rounds.name is WSL's own name lifted from the results
-- page's data layer, which is the convention this project uses everywhere for
-- observed values. Editing either to match the other would destroy a real
-- observation to make a check go quiet.
--
-- The mistake was in the view, which called an orthographic difference a
-- structural deviation. A check that always fails is ignored, which does the
-- same damage as a check that always passes — and this project has already
-- been bitten by the second.
--
-- SO: the difference is RECLASSIFIED, not deleted.
--
--   v_round_structure_deviations   now reports only rounds with no template
--                                  row at all — a real structural deviation.
--   v_round_name_differences       new. Every name that differs, with both
--                                  sources named. Informational, never empty,
--                                  and not in the must-be-zero list.
--
-- NOT DONE HERE, and worth doing: the structural view still compares nothing
-- but existence. round_templates carries the expected heat count and heat size
-- for each round, and neither is checked against what was loaded. That is a
-- real check this migration does not add.
-- =====================================================================

BEGIN;

CREATE OR REPLACE VIEW v_round_structure_deviations AS
SELECT
  e.season_year,
  e.event_number,
  e.name AS event_name,
  e.field_size,
  r.round_order,
  r.name  AS observed_round,
  NULL::text AS expected_round,
  'round not in the format template' AS deviation
FROM events e
JOIN seasons s ON s.year = e.season_year
JOIN rounds  r ON r.event_id = e.id
LEFT JOIN round_templates rt
  ON  rt.era_code    = s.era_code
  AND rt.field_size  = e.field_size
  AND rt.round_order = r.round_order
WHERE rt.round_order IS NULL;

COMMENT ON VIEW v_round_structure_deviations IS
  'Rounds loaded at an order the format template does not define for that era and field size. Must be empty. Narrowed by 00000000000011 from also comparing names: the rulebook says "Quarter Finals" and WSL''s data layer says "Quarterfinals", which is a difference between two attested sources, not a defect. See v_round_name_differences.';

ALTER VIEW v_round_structure_deviations SET (security_invoker = on);

CREATE OR REPLACE VIEW v_round_name_differences AS
SELECT
  e.season_year,
  e.event_number,
  e.field_size,
  r.round_order,
  rt.name AS rulebook_name,
  r.name  AS published_name,
  CASE
    WHEN lower(regexp_replace(rt.name, '[^a-zA-Z0-9]', '', 'g'))
       = lower(regexp_replace(r.name,  '[^a-zA-Z0-9]', '', 'g'))
    THEN 'spacing or case only'
    ELSE 'different words'
  END AS kind
FROM events e
JOIN seasons s ON s.year = e.season_year
JOIN rounds  r ON r.event_id = e.id
JOIN round_templates rt
  ON  rt.era_code    = s.era_code
  AND rt.field_size  = e.field_size
  AND rt.round_order = r.round_order
WHERE r.name IS DISTINCT FROM rt.name;

COMMENT ON VIEW v_round_name_differences IS
  'Every round whose loaded name differs from the format template''s. NOT a defect list and NOT expected to be empty: round_templates.name comes from the rulebook PDF and rounds.name comes from WSL''s own data layer on the results page. Both are retained artefacts. "different words" is worth a human look — "Title Match" against the rulebook''s "Final Match" is the only one as of 19 August 2026 — while "spacing or case only" is Quarterfinals and Semifinals and needs nothing.';

ALTER VIEW v_round_name_differences SET (security_invoker = on);

-- =====================================================================
-- ALSO: interference_wave_effects joins the provenance check.
--
-- 00000000000007 creates that table with an artefact_id column, and it had
-- never been applied when 00000000000010 widened v_provenance_gaps from six
-- tables to thirteen — so the widened view does not name it. The moment 07
-- lands, v_provenance_uncovered starts returning interference_wave_effects.
--
-- That is the guard-on-the-guard doing precisely its job: it exists because
-- the gaps view had already fallen behind the schema twice. Rather than let it
-- report a real omission that this migration sequence itself creates, the two
-- views are widened here, in the migration that runs after 07.
-- =====================================================================

DROP VIEW IF EXISTS v_provenance_uncovered;
DROP VIEW IF EXISTS v_provenance_gaps;

CREATE VIEW v_provenance_gaps
WITH (security_invoker = true) AS
  SELECT 'events'::text        AS table_name, e.id  AS row_id FROM events e        WHERE e.artefact_id  IS NULL
  UNION ALL SELECT 'rounds'::text,        r.id  FROM rounds r            WHERE r.artefact_id  IS NULL
  UNION ALL SELECT 'heats'::text,         h.id  FROM heats h             WHERE h.artefact_id  IS NULL
  UNION ALL SELECT 'heat_entries'::text,  he.id FROM heat_entries he     WHERE he.artefact_id IS NULL
  UNION ALL SELECT 'waves'::text,         w.id  FROM waves w             WHERE w.artefact_id  IS NULL
  UNION ALL SELECT 'event_entries'::text, ee.id FROM event_entries ee    WHERE ee.artefact_id IS NULL
  UNION ALL SELECT 'interferences'::text, i.id  FROM interferences i     WHERE i.artefact_id  IS NULL
  UNION ALL SELECT 'interference_wave_effects'::text, iwe.id FROM interference_wave_effects iwe WHERE iwe.artefact_id IS NULL
  UNION ALL SELECT 'venues'::text,        v.id  FROM venues v            WHERE v.artefact_id  IS NULL
  UNION ALL SELECT 'surfers'::text,       sf.id FROM surfers sf          WHERE sf.artefact_id IS NULL
  UNION ALL SELECT 'points_bands'::text,          NULL::bigint FROM points_bands          WHERE artefact_id IS NULL
  UNION ALL SELECT 'points_band_occupancy'::text, NULL::bigint FROM points_band_occupancy WHERE artefact_id IS NULL
  UNION ALL SELECT 'round_templates'::text,       NULL::bigint FROM round_templates       WHERE artefact_id IS NULL
  UNION ALL SELECT 'season_rankings'::text,       NULL::bigint FROM season_rankings       WHERE artefact_id IS NULL;

COMMENT ON VIEW v_provenance_gaps IS
  'Every row in a base table carrying an artefact_id column, where that column is null. Must be empty — M1 item 7. Widened by 00000000000010 from six tables to thirteen, and by 00000000000011 to fourteen when 00000000000007 finally landed and brought interference_wave_effects with it. Before quoting a zero from this view, read v_provenance_coverage for the row count it was computed over, and v_provenance_uncovered to confirm it still names every table it should.';

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
    AND pg_get_viewdef('public.v_provenance_gaps'::regclass, true)
        !~ ('\m' || c.table_name || '\M');

COMMENT ON VIEW v_provenance_uncovered IS
  'Base tables carrying an artefact_id column that v_provenance_gaps does not name. Must be empty. This exists because the gaps view silently fell behind the schema twice — a table gaining an artefact_id column without being added there is now a row here rather than an absence nobody sees. It caught interference_wave_effects on 19 August 2026, the third time.';

CREATE OR REPLACE VIEW v_provenance_coverage
WITH (security_invoker = true) AS
  SELECT 'events'::text AS table_name, count(*) AS rows_total, count(*) FILTER (WHERE artefact_id IS NULL) AS rows_null FROM events
  UNION ALL SELECT 'rounds',                    count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM rounds
  UNION ALL SELECT 'heats',                     count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM heats
  UNION ALL SELECT 'heat_entries',              count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM heat_entries
  UNION ALL SELECT 'waves',                     count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM waves
  UNION ALL SELECT 'event_entries',             count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM event_entries
  UNION ALL SELECT 'interferences',             count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM interferences
  UNION ALL SELECT 'interference_wave_effects', count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM interference_wave_effects
  UNION ALL SELECT 'venues',                    count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM venues
  UNION ALL SELECT 'surfers',                   count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM surfers
  UNION ALL SELECT 'points_bands',              count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM points_bands
  UNION ALL SELECT 'points_band_occupancy',     count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM points_band_occupancy
  UNION ALL SELECT 'round_templates',           count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM round_templates
  UNION ALL SELECT 'season_rankings',           count(*), count(*) FILTER (WHERE artefact_id IS NULL) FROM season_rankings;

INSERT INTO public.schema_migrations (version) VALUES
  ('00000000000011_round_name_source_difference.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
