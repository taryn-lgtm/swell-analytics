-- =====================================================================
-- WSL Analytics — pre-deployment database verification (READ ONLY)
-- =====================================================================
-- Run in the Supabase SQL Editor. Returns one row per check.
-- Scan the `status` column:
--   FAIL   = a real problem, must fix before relying on the data
--   REVIEW = needs a human eyeball (may be legitimate)
--   INFO   = context / intentional gaps, never a failure
--   PASS   = verified correct
--
-- Nothing here writes to the database.
-- =====================================================================

WITH checks AS (

  -- ---- 1. REFERENTIAL INTEGRITY (all must be 0) -------------------
  SELECT 10 AS sort, 'ref: heat_results -> surfers' AS check_name,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    COUNT(*)::text || ' orphaned heat_results (surfer_id not in surfers)' AS detail
  FROM heat_results hr LEFT JOIN surfers s ON s.id = hr.surfer_id
  WHERE s.id IS NULL

  UNION ALL
  SELECT 11, 'ref: heat_results -> heats',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*)::text || ' orphaned heat_results (heat_id not in heats)'
  FROM heat_results hr LEFT JOIN heats h ON h.id = hr.heat_id
  WHERE h.id IS NULL

  UNION ALL
  SELECT 12, 'ref: heats -> events',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*)::text || ' orphaned heats (event_id not in events)'
  FROM heats h LEFT JOIN events e ON e.id = h.event_id
  WHERE e.id IS NULL

  UNION ALL
  SELECT 13, 'integrity: duplicate results',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*)::text || ' (heat_id, surfer_id) pairs appearing more than once'
  FROM (
    SELECT heat_id, surfer_id FROM heat_results
    GROUP BY heat_id, surfer_id HAVING COUNT(*) > 1
  ) d

  -- ---- 2. NON-NEGOTIABLE COMPLETENESS ----------------------------
  UNION ALL
  SELECT 20, 'champion: all completed seasons flagged',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0
      THEN 'every season except 2020 has world_champion_men_id'
      ELSE 'missing champion for years: ' || string_agg(year::text, ', ' ORDER BY year)
    END
  FROM seasons
  WHERE world_champion_men_id IS NULL
    AND year <> 2020            -- 2020 CT cancelled (COVID) — null is correct

  UNION ALL
  SELECT 21, 'events: regular events have heats',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*)::text || ' regular CT events with zero heats'
  FROM events e
  WHERE e.event_type = 'regular'
    AND NOT EXISTS (SELECT 1 FROM heats h WHERE h.event_id = e.id)

  UNION ALL
  SELECT 22, 'heats: at least 2 surfers per heat',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'REVIEW' END,
    COUNT(*)::text || ' heats with fewer than 2 results (check formats/no-shows)'
  FROM (
    SELECT hr.heat_id FROM heat_results hr
    JOIN heats h ON h.id = hr.heat_id
    JOIN events e ON e.id = h.event_id
    WHERE e.event_type = 'regular' AND h.round_order BETWEEN 1 AND 99
    GROUP BY hr.heat_id HAVING COUNT(*) < 2
  ) x

  -- ---- 3. KNOWN-TRUTH CANARIES (hard) ----------------------------
  UNION ALL
  SELECT 30, 'canary: 2025 champion = Yago Dora',
    CASE WHEN EXISTS (
      SELECT 1 FROM rankings_current
      WHERE season_year = 2025 AND rank = 1
        AND surfer_name = 'Yago Dora' AND world_champion = true
        AND total_points = 54750
    ) THEN 'PASS' ELSE 'FAIL' END,
    (SELECT 'live: rank1=' || surfer_name || ', champ=' || world_champion || ', pts=' || total_points
     FROM rankings_current WHERE season_year = 2025 AND rank = 1)

  UNION ALL
  SELECT 31, 'canary: 2025 Colapinto = 48,965',
    CASE WHEN EXISTS (
      SELECT 1 FROM rankings_current
      WHERE season_year = 2025 AND surfer_name = 'Griffin Colapinto'
        AND total_points = 48965
    ) THEN 'PASS' ELSE 'FAIL' END,
    (SELECT 'live: ' || COALESCE(surfer_name || ' = ' || total_points::text, 'Colapinto not found')
     FROM rankings_current WHERE season_year = 2025 AND surfer_name = 'Griffin Colapinto')

  -- ---- 4. DATA HYGIENE -------------------------------------------
  UNION ALL
  SELECT 40, 'hygiene: no null/blank surfer names',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*)::text || ' surfers with null or empty full_name'
  FROM surfers WHERE full_name IS NULL OR btrim(full_name) = ''

  UNION ALL
  SELECT 41, 'hygiene: no women in men-only v1',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*)::text || ' surfers with gender = F (should be 0 — this was the Bonsoy bug class)'
  FROM surfers WHERE gender = 'F'

  UNION ALL
  SELECT 42, 'hygiene: heat_total = wave1 + wave2',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'REVIEW' END,
    COUNT(*)::text || ' rows where |wave1+wave2 - heat_total| > 0.01 '
                   || '(pool/special formats may legitimately differ)'
  FROM heat_results
  WHERE wave_1_score IS NOT NULL AND wave_2_score IS NOT NULL AND heat_total IS NOT NULL
    AND abs((wave_1_score + wave_2_score) - heat_total) > 0.01

  UNION ALL
  SELECT 43, 'hygiene: scores within 0-20 range',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'REVIEW' END,
    COUNT(*)::text || ' heat_results with heat_total outside [0, 20]'
  FROM heat_results
  WHERE heat_total IS NOT NULL AND (heat_total < 0 OR heat_total > 20)

  -- ---- 5. INTENTIONAL GAPS (info, never fail) --------------------
  UNION ALL
  SELECT 50, 'gap: wave_scores empty by design',
    'INFO',
    (SELECT COUNT(*)::text FROM wave_scores) || ' rows (expected 0 in V1)'

  UNION ALL
  SELECT 51, 'gap: 2020 has no heat data (COVID)',
    'INFO',
    (SELECT COUNT(*)::text FROM heats h JOIN events e ON e.id = h.event_id
     WHERE e.season_year = 2020) || ' heats in 2020 (expected 0)'

  -- ---- 6. SNAPSHOT (info — eyeball against reality) --------------
  UNION ALL
  SELECT 60, 'snapshot: table row counts', 'INFO',
    'countries=' || (SELECT COUNT(*) FROM countries)
    || ' venues='   || (SELECT COUNT(*) FROM venues)
    || ' seasons='  || (SELECT COUNT(*) FROM seasons)
    || ' events='   || (SELECT COUNT(*) FROM events)
    || ' surfers='  || (SELECT COUNT(*) FROM surfers)
    || ' heats='    || (SELECT COUNT(*) FROM heats)
    || ' heat_results=' || (SELECT COUNT(*) FROM heat_results)

  UNION ALL
  -- Uses to_regclass so this is safe whether or not the ledger exists yet.
  -- A direct reference to a missing table would fail the whole query at plan time.
  SELECT 61, 'snapshot: ledger table exists?', 'INFO',
    CASE WHEN to_regclass('public.schema_migrations') IS NULL
      THEN 'NOT created yet — run:  npm run migrate -- --baseline'
      ELSE 'exists (SELECT * FROM schema_migrations to see recorded versions)'
    END
)
SELECT check_name, status, detail
FROM checks
ORDER BY
  CASE status WHEN 'FAIL' THEN 0 WHEN 'REVIEW' THEN 1 WHEN 'INFO' THEN 2 ELSE 3 END,
  sort;

-- ---------------------------------------------------------------------
-- 7. Champion-per-season roll-up — run separately, eyeball the names.
--    (2015 Adriano de Souza, 2019 Italo Ferreira, 2025 Yago Dora, etc.
--     2020 should be blank.)
-- ---------------------------------------------------------------------
-- SELECT s.year, sf.full_name AS world_champion
-- FROM seasons s
-- LEFT JOIN surfers sf ON sf.id = s.world_champion_men_id
-- ORDER BY s.year;
