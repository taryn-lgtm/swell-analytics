-- =====================================================================
-- final_check.sql — every check this project has, in one pass
-- =====================================================================
--
-- READ-ONLY. No INSERT, UPDATE, DELETE, CREATE (except a TEMP table that
-- dies with the session), ALTER or DROP. Safe to run against production as
-- often as you like. scripts/final_check.sh greps this file for write
-- keywords and refuses to run it if any appear.
--
-- WHAT IT IS FOR
--   The audit views each answer one question. Running them one at a time
--   invites the failure this project keeps finding: a view that returns zero
--   because it is looking at nothing gets read as agreement. So this runs
--   them all, AND it runs the positive controls — the counts proving each
--   check had something to check.
--
--   A guard that has only ever passed has not been shown to work.
--
-- HOW TO READ IT
--   Section 1  disagreements — every one must be 0
--   Section 2  positive controls — every one must be > 0
--   Section 3  coverage — informational, no verdict
--   Section 4  open gaps — what the database says it does not know
--   Then a single VERDICT line, and a non-zero exit if anything failed.
-- =====================================================================

\pset border 2
\pset null '·'

CREATE TEMP TABLE _report (
  seq        int,
  section    text,
  check_name text,
  expected   text,
  actual     text,
  verdict    text
) ON COMMIT PRESERVE ROWS;

DO $$
DECLARE
  v text;
  n bigint;
  i int := 0;
  zero_views text[] := ARRAY[
    'v_heat_total_disagreements',
    'v_wave_count_disagreements',
    'v_avg_heat_score_disagreements',
    'v_interference_effect_mismatches',
    'v_interference_zeroed_waves_disagree',
    'v_points_disagreements',
    'v_throwaway_disagreements',
    'v_round_structure_deviations',
    'v_round_template_band_disagreements',
    'v_round_template_flow_disagreements',
    'v_pre_cut_count_check',
    'v_band_occupancy_check',
    'v_provenance_gaps',
    'v_provenance_uncovered'
  ];
BEGIN
  FOREACH v IN ARRAY zero_views LOOP
    i := i + 1;
    IF to_regclass(v) IS NULL THEN
      -- A missing view is a FAIL, not a skip. The alternative is a report
      -- that gets shorter as checks disappear and still says PASS.
      INSERT INTO _report VALUES (i, '1 disagreements', v, '0 rows', 'VIEW DOES NOT EXIST', 'FAIL');
    ELSE
      EXECUTE format('SELECT count(*) FROM %I', v) INTO n;
      INSERT INTO _report VALUES (
        i, '1 disagreements', v, '0 rows', n::text || ' rows',
        CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END
      );
    END IF;
  END LOOP;
END $$;

-- --- Section 2: positive controls -------------------------------------
-- Each of these is the denominator of a check above. If one is 0, the
-- matching PASS above means "nothing was compared", not "nothing disagreed".

INSERT INTO _report
SELECT 101, '2 positive controls', 'heat entries whose counting pair was summed and compared',
       '> 0', count(*)::text, CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM v_heat_total_agreement WHERE counting_wave_count > 0;

INSERT INTO _report
SELECT 102, '2 positive controls', 'heats whose published wave count was compared to rides loaded',
       '> 0', count(*)::text, CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM v_wave_count_agreement WHERE published_wave_count IS NOT NULL;

INSERT INTO _report
SELECT 103, '2 positive controls', 'waves loaded',
       '> 0', count(*)::text, CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM waves;

INSERT INTO _report
SELECT 104, '2 positive controls', 'rows carrying an artefact_id (the provenance check''s denominator)',
       '> 0', coalesce(sum(rows_total), 0)::text,
       CASE WHEN coalesce(sum(rows_total), 0) > 0 THEN 'PASS' ELSE 'FAIL' END
FROM v_provenance_coverage;

-- Both seasons' champions, from two unrelated pages.
INSERT INTO _report
SELECT 105, '2 positive controls',
       'seasons where the Finals Title Match winner = the champion read from the rankings page',
       '2 of 2', count(*) FILTER (WHERE agrees)::text || ' of ' || count(*)::text,
       CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE agrees) = 2 THEN 'PASS' ELSE 'FAIL' END
FROM (
  SELECT s.year,
         s.world_champion_surfer_id IS NOT NULL
           AND s.world_champion_surfer_id = max(he.surfer_id) FILTER (WHERE he.position = 1) AS agrees
  FROM seasons s
  JOIN events e   ON e.season_year = s.year AND e.kind = 'wsl_finals'
  JOIN rounds r   ON r.event_id = e.id AND r.round_order = 4
  JOIN heats  h   ON h.round_id = r.id
  JOIN heat_entries he ON he.heat_id = h.id
  GROUP BY s.year, s.world_champion_surfer_id
) t;

-- --- Section 3: coverage, informational -------------------------------

INSERT INTO _report
SELECT 200 + row_number() OVER (ORDER BY label), '3 coverage', label, '', n::text, ''
FROM (
  SELECT 'seasons'                  AS label, count(*) AS n FROM seasons
  UNION ALL SELECT 'events',                count(*) FROM events
  UNION ALL SELECT '  of which WSL Finals', count(*) FROM events WHERE kind = 'wsl_finals'
  UNION ALL SELECT 'rounds',                count(*) FROM rounds
  UNION ALL SELECT 'heats',                 count(*) FROM heats
  UNION ALL SELECT 'heat entries',          count(*) FROM heat_entries
  UNION ALL SELECT 'waves',                 count(*) FROM waves
  UNION ALL SELECT '  of which counted',    count(*) FROM waves WHERE counted
  UNION ALL SELECT 'surfers',               count(*) FROM surfers
  UNION ALL SELECT 'artefacts',             count(*) FROM artefacts
) c;

-- --- Section 4: what the database says it does not know ---------------

-- Guarded: this view arrives with migration 00000000000011, and a check file
-- that cannot run before its migration is applied is a check nobody runs.
DO $$
DECLARE total bigint; words bigint;
BEGIN
  IF to_regclass('v_round_name_differences') IS NULL THEN
    INSERT INTO _report VALUES (299, '4 open gaps',
      'round names differing from the rulebook', '',
      'view not present — apply 00000000000011', '');
  ELSE
    SELECT count(*), count(*) FILTER (WHERE kind = 'different words')
      INTO total, words FROM v_round_name_differences;
    INSERT INTO _report VALUES (299, '4 open gaps',
      'round names differing from the rulebook (both sources attested — not a defect)', '',
      total::text || ' (' || words::text || ' with different words)', '');
  END IF;
END $$;

INSERT INTO _report
SELECT 300, '4 open gaps', 'open data_gaps rows', '', count(*)::text, ''
FROM data_gaps WHERE closed_at IS NULL;

INSERT INTO _report
SELECT 301, '4 open gaps', 'heats with no wave data loaded', '', count(*)::text, ''
FROM heats h
WHERE NOT EXISTS (
  SELECT 1 FROM heat_entries he JOIN waves w ON w.heat_entry_id = he.id WHERE he.heat_id = h.id
);

INSERT INTO _report
SELECT 302, '4 open gaps', 'events with no wave data at all', '', count(*)::text, ''
FROM events e
WHERE NOT EXISTS (
  SELECT 1 FROM rounds r JOIN heats h ON h.round_id = r.id
  JOIN heat_entries he ON he.heat_id = h.id JOIN waves w ON w.heat_entry_id = he.id
  WHERE r.event_id = e.id
);

-- =====================================================================
--                              THE REPORT
-- =====================================================================

SELECT section, check_name, expected, actual, verdict
FROM _report ORDER BY seq;

\echo ''
\echo '--- events loaded, by season ---'
-- count(DISTINCT ...) on everything above waves. The first version of this
-- query used count(*) and reported 4,443 events in 2024: the LEFT JOIN down to
-- waves multiplies each event row by its wave count. Caught on the first run.
SELECT e.season_year,
       count(DISTINCT e.id)                                          AS events,
       count(DISTINCT e.id) FILTER (WHERE e.kind = 'wsl_finals')     AS finals,
       count(DISTINCT h.id)                                          AS heats,
       count(w.id)                                                   AS waves
FROM events e
LEFT JOIN rounds r       ON r.event_id = e.id
LEFT JOIN heats h        ON h.round_id = r.id
LEFT JOIN heat_entries he ON he.heat_id = h.id
LEFT JOIN waves w        ON w.heat_entry_id = he.id
GROUP BY e.season_year ORDER BY e.season_year;

\echo ''
\echo '--- events still missing wave data, and why ---'
SELECT e.season_year, e.event_number, e.name, e.kind
FROM events e
WHERE NOT EXISTS (
  SELECT 1 FROM rounds r JOIN heats h ON h.round_id = r.id
  JOIN heat_entries he ON he.heat_id = h.id JOIN waves w ON w.heat_entry_id = he.id
  WHERE r.event_id = e.id
)
ORDER BY e.season_year, e.event_number;

\echo ''
\echo '--- open gaps, most recent first ---'
SELECT opened_at, scope, season_year, left(field, 70) AS field
FROM data_gaps WHERE closed_at IS NULL
ORDER BY opened_at DESC, id DESC;

-- =====================================================================
--             WHAT ACTUALLY DISAGREED, for every FAIL above
-- =====================================================================
--
-- A count tells you a check failed. It does not tell you whether the cause is
-- 43 real defects or one unapplied migration. This prints the offending rows
-- so the next question can be asked without another round trip.

DO $$
DECLARE r record; body text; n bigint;
BEGIN
  FOR r IN SELECT check_name FROM _report WHERE verdict = 'FAIL' ORDER BY seq LOOP
    IF to_regclass(r.check_name) IS NULL THEN
      RAISE NOTICE E'\n  %  — the view does not exist in this database.\n    Its migration is on disk but has evidently not been applied. That is a\n    missing check, not a passing one, which is why it is a FAIL.', r.check_name;
      CONTINUE;
    END IF;
    EXECUTE format(
      'SELECT count(*), string_agg(t::text, E''\n      '') FROM (SELECT * FROM %I LIMIT 20) t',
      r.check_name
    ) INTO n, body;
    RAISE NOTICE E'\n  %  — % row(s), first % shown:\n      %', r.check_name, n, least(n, 20), coalesce(body, '(none)');
  END LOOP;
END $$;

-- =====================================================================
--                    WHAT THE SCHEMA SAYS IT HAS RUN
-- =====================================================================
-- Compared by scripts/final_check.sh against the migration files on disk.

\echo ''
\echo '--- migrations recorded as applied ---'
SELECT version FROM schema_migrations ORDER BY version;

-- =====================================================================
--                             THE VERDICT
-- =====================================================================

DO $$
DECLARE failed int; total int;
BEGIN
  SELECT count(*) FILTER (WHERE verdict = 'FAIL'), count(*) FILTER (WHERE verdict <> '')
    INTO failed, total FROM _report;

  IF failed > 0 THEN
    RAISE EXCEPTION E'\n\n  % of % checks FAILED. Read the verdict column above.\n  Nothing has been changed — this file only reads.\n', failed, total;
  END IF;

  RAISE NOTICE E'\n\n  PASS — all % checks agree, and every one of them had something to check.\n', total;
END $$;
