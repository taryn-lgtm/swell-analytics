-- =====================================================================
-- 00000000000021_2024_title_match_heat2.sql
-- Load the 2024 WSL Finals Title Match Heat 2 (WSL heat 102842)
-- =====================================================================
--
-- Depends on: the 2024 Finals seed (supabase/seeds/finals_2024_e10_lexus_wsl_finals.sql)
--             and the Lower Trestles venue (supabase/seeds/venues_and_heat_venues.sql),
--             both already applied to v2.
-- Target:     v2, ref tjwqskjsyluxepdbwjet. Rule 6: Taryn applies this.
--
-- THE DEFECT. The 2024 men's Title Match was a best-of-three series, which
-- John John Florence won 2-0 (Rulebook 2024, 1.06(e)(iv): "The Final Match is
-- best of three (3) heats"). The retained results page publishes both heats in
-- the Title Match block -- JJF 15.50 / 18.13, Italo Ferreira 15.33 / 16.30,
-- "J. Florence Wins 2 - 0" -- but ingest_finals.ts read only the first score
-- pair and write_finals_manifest.ts named one heat per match, so the popup
-- collector refused Heat 2 and v2 has held one Title Match heat since 19 August.
--
-- 2025 is NOT affected: the 2025 page adds "World #1 can win the World Title by
-- winning Title Match Heat 1. Otherwise, Title Match is Best-of-3 heats." Yago
-- Dora, world #1, won Heat 1 and the page shows "Y. Dora Wins 1 - 0". One heat
-- surfed, one heat held.
--
-- WHAT THIS ADDS -- every value read from retained bytes, none derived:
--   1 artefact   docs/sources/raw/2024_ct_205_lexus_wsl_finals_results_heat_102842_popup.html
--                (collected 17 Oct 2026 by scripts/collect_heat_popups.ts, research UA)
--   1 heat       round 4 (Title Match), heat_number 5 -- after Heat 1's 4, so every
--                (round_order, heat_number) ordering, Trim's included, walks it second
--   2 entries    JJF 1st 18.13, Italo 2nd 16.30. Totals: the results page series
--                block. Placings: the popup (athlete-place-N). finished_position is
--                NULL: each surfer's Finals finish stays on its Heat 1 row, because
--                home.ts, event.ts and rankings.ts each refuse two rows per surfer.
--   10 waves     ride order, score and the counted flag as the popup marks them;
--                JJF 9.70 + 8.43 = 18.13, Italo 8.17 + 8.13 = 16.30
--   conditions   4-6', Light, 10 waves, average heat score 17.22 (popup stat bar)
--   venue        Lower Trestles ("Completed September 6, 2024 at Lower Trestles")
--   gaps         closes "Title Match heats beyond the first" for 2024 and 2025
--
-- WHAT IT DOES NOT DO: recompute Datum or Trim. The two new entries get no
-- datum or trim row from this file; see the PR and HANDOVER for the recompute.
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING and every update is
-- keyed. A second run changes nothing and its assertions still pass.
-- The generators that produce the same rows from scratch were changed in the
-- same commit: scripts/ingest_finals.ts, scripts/ingest_popups.ts,
-- scripts/write_finals_manifest.ts, scripts/collect_heat_popups.ts.
-- =====================================================================

BEGIN;

-- --- preflight -------------------------------------------------------
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(x.what, ', ') INTO missing FROM (VALUES
    ('the 2024 Finals results page', (SELECT count(*) FROM artefacts WHERE sha256 = 'f1b9ff7d56bb7341aff899bafd1bba5c8203fe9db9f1e062234f8d20ca928064')),
    ('the 2024 Title Match Heat 1 heat (102841)', (SELECT count(*) FROM heats WHERE wsl_heat_id = '102841')),
    ('the Lower Trestles venue', (SELECT count(*) FROM venues WHERE slug = 'lower-trestles')),
    ('surfer 199 (John John Florence)', (SELECT count(*) FROM surfers WHERE wsl_athlete_id = '199')),
    ('surfer 1737 (Italo Ferreira)', (SELECT count(*) FROM surfers WHERE wsl_athlete_id = '1737'))
  ) AS x(what, n) WHERE x.n = 0;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Not found in v2: %. Apply the 2024 Finals and venue seeds first.', missing;
  END IF;
END $$;

-- --- 1. the artefact ---------------------------------------------------
INSERT INTO artefacts
  (url, file_path, sha256, fetched_at, http_status, content_type,
   content_length, retrieval, notes)
VALUES
  ('https://www.worldsurfleague.com/events/2024/ct/205/lexus-wsl-finals/results',
   'docs/sources/raw/2024_ct_205_lexus_wsl_finals_results_heat_102842_popup.html',
   'e94f8ed6065666c1c17309f46a929880c5e2df81bd4b4c79acbd7f39dc267601',
   '2026-10-17T16:08:07.944Z'::timestamptz,
   NULL,
   NULL,
   24848,
   'script_browser_dom',
   'provenance_warning: NOT A WIRE-LEVEL ARTEFACT. These bytes are what the browser built after running WSL''s JavaScript. No HTTP response contains this markup — the Heat Details popup is client-rendered and has no server endpoint. See docs/findings/2026-08-09_acquisition_routes.md. It cannot be reproduced by any fetch, only by re-running a browser.

fetched_by: scripts/collect_heat_popups.ts')
ON CONFLICT DO NOTHING;

-- --- 2. the heat --------------------------------------------------------
-- Cited to the results page, whose replay link names heat 102842 and whose
-- series block publishes its totals.
INSERT INTO heats (round_id, heat_number, sequence_in_round, wsl_heat_id, status, artefact_id)
SELECT r.id, 5, 5, '102842', 'completed', a.id
FROM events e
JOIN rounds r ON r.event_id = e.id AND r.round_order = 4
JOIN artefacts a ON a.sha256 = 'f1b9ff7d56bb7341aff899bafd1bba5c8203fe9db9f1e062234f8d20ca928064'
WHERE e.season_year = 2024 AND e.event_number = 10
ON CONFLICT (round_id, heat_number, sequence_in_round) DO NOTHING;

-- --- 3. the entries -----------------------------------------------------
INSERT INTO heat_entries (heat_id, surfer_id, position, heat_total, finished_position, progression_text, artefact_id)
SELECT h.id, s.id, v.position, v.heat_total, NULL, NULL, a.id
FROM (VALUES
  ('199', 1, 18.13::numeric),
  ('1737', 2, 16.30::numeric)
) AS v(wsl_athlete_id, position, heat_total)
JOIN heats h ON h.wsl_heat_id = '102842'
JOIN surfers s ON s.wsl_athlete_id = v.wsl_athlete_id
JOIN artefacts a ON a.sha256 = 'e94f8ed6065666c1c17309f46a929880c5e2df81bd4b4c79acbd7f39dc267601'
ON CONFLICT (heat_id, surfer_id) DO NOTHING;

-- --- 4. conditions and venue --------------------------------------------
UPDATE heats SET
  wave_height_min_ft       = 4,
  wave_height_max_ft       = 6,
  wave_height_published    = '4-6''',
  wind_conditions          = 'Light',
  published_wave_count     = 10,
  published_avg_heat_score = 17.22,
  venue_id          = (SELECT id FROM venues WHERE slug = 'lower-trestles'),
  venue_artefact_id = (SELECT id FROM artefacts WHERE sha256 = 'e94f8ed6065666c1c17309f46a929880c5e2df81bd4b4c79acbd7f39dc267601')
WHERE wsl_heat_id = '102842';

-- --- 5. the rides ------------------------------------------------------
-- Ride order is the popup's chronological .wave-number (trap 15); counted is
-- the popup's .wave--counted mark, never the best two (trap 14).
INSERT INTO waves (heat_entry_id, wave_order, score, counted, artefact_id)
SELECT he.id, v.wave_order, v.score, v.counted, a.id
FROM (VALUES
  ('199',  1, 9.70::numeric, true),
  ('199',  2, 0.50::numeric, false),
  ('199',  3, 8.43::numeric, true),
  ('199',  4, 1.50::numeric, false),
  ('1737', 1, 8.17::numeric, true),
  ('1737', 2, 1.00::numeric, false),
  ('1737', 3, 3.50::numeric, false),
  ('1737', 4, 0.37::numeric, false),
  ('1737', 5, 8.13::numeric, true),
  ('1737', 6, 0.80::numeric, false)
) AS v(wsl_athlete_id, wave_order, score, counted)
JOIN heats h ON h.wsl_heat_id = '102842'
JOIN surfers s ON s.wsl_athlete_id = v.wsl_athlete_id
JOIN heat_entries he ON he.heat_id = h.id AND he.surfer_id = s.id
JOIN artefacts a ON a.sha256 = 'e94f8ed6065666c1c17309f46a929880c5e2df81bd4b4c79acbd7f39dc267601'
ON CONFLICT (heat_entry_id, wave_order) DO NOTHING;

-- --- 6. gaps ------------------------------------------------------------
-- Opened 19 August by ingest_finals.ts. 2024: both heats are now held. 2025:
-- the series ran one heat (world #1 won Heat 1), so there was never a heat
-- beyond the first. Closed, not deleted.
UPDATE data_gaps SET closed_at = CURRENT_DATE
WHERE closed_at IS NULL
  AND field IN ('Title Match heats beyond the first, 2024 event 10',
                'Title Match heats beyond the first, 2025 event 12');

-- --- 7. assertions -------------------------------------------------------
DO $$
DECLARE
  n_heats int; n_entries int; n_waves int; n_counted int; bad_totals int;
  n_fp1 int; series_jjf int; series_italo int; n_venue int; open_gaps int;
BEGIN
  SELECT count(*) INTO n_heats FROM heats h JOIN rounds r ON r.id = h.round_id
    JOIN events e ON e.id = r.event_id WHERE e.season_year = 2024 AND e.event_number = 10;
  SELECT count(*) INTO n_entries FROM heat_entries he JOIN heats h ON h.id = he.heat_id
    JOIN rounds r ON r.id = h.round_id JOIN events e ON e.id = r.event_id
    WHERE e.season_year = 2024 AND e.event_number = 10;
  SELECT count(*), count(*) FILTER (WHERE w.counted) INTO n_waves, n_counted
    FROM waves w JOIN heat_entries he ON he.id = w.heat_entry_id JOIN heats h ON h.id = he.heat_id
    WHERE h.wsl_heat_id = '102842';
  -- The counted rides must sum to the published heat total: proves the counted
  -- mark was read, not inferred.
  SELECT count(*) INTO bad_totals FROM heat_entries he JOIN heats h ON h.id = he.heat_id
    WHERE h.wsl_heat_id = '102842'
      AND he.heat_total <> (SELECT sum(score) FROM waves w WHERE w.heat_entry_id = he.id AND w.counted);
  SELECT count(*) INTO n_fp1 FROM heat_entries he JOIN heats h ON h.id = he.heat_id
    JOIN rounds r ON r.id = h.round_id JOIN events e ON e.id = r.event_id
    WHERE e.season_year = 2024 AND e.event_number = 10 AND he.finished_position = 1;
  SELECT count(*) FILTER (WHERE s.wsl_athlete_id = '199'), count(*) FILTER (WHERE s.wsl_athlete_id = '1737')
    INTO series_jjf, series_italo
    FROM heat_entries he JOIN heats h ON h.id = he.heat_id JOIN rounds r ON r.id = h.round_id
    JOIN events e ON e.id = r.event_id JOIN surfers s ON s.id = he.surfer_id
    WHERE e.season_year = 2024 AND e.event_number = 10 AND r.round_order = 4 AND he.position = 1;
  SELECT count(*) INTO n_venue FROM heats WHERE venue_id IS NOT NULL;
  SELECT count(*) INTO open_gaps FROM data_gaps
    WHERE closed_at IS NULL AND field LIKE 'Title Match heats beyond the first%';

  IF n_heats   <> 5  THEN RAISE EXCEPTION '2024 Finals heats: expected 5, got %', n_heats; END IF;
  IF n_entries <> 10 THEN RAISE EXCEPTION '2024 Finals heat entries: expected 10, got %', n_entries; END IF;
  IF n_waves   <> 10 THEN RAISE EXCEPTION 'heat 102842 waves: expected 10 (published "Total waves 10"), got %', n_waves; END IF;
  IF n_counted <> 4  THEN RAISE EXCEPTION 'heat 102842 counted waves: expected 4, got %', n_counted; END IF;
  IF bad_totals <> 0 THEN RAISE EXCEPTION 'heat 102842: % entries whose counted rides do not sum to the published total', bad_totals; END IF;
  IF n_fp1     <> 1  THEN RAISE EXCEPTION '2024 Finals: % rows carry finished_position = 1; exactly one is allowed', n_fp1; END IF;
  IF series_jjf <> 2 OR series_italo <> 0 THEN
    RAISE EXCEPTION 'Title Match series: JJF won %, Italo won %; the page publishes "J. Florence Wins 2 - 0"', series_jjf, series_italo;
  END IF;
  IF n_venue   <> 713 THEN RAISE EXCEPTION 'heats with a venue: expected 713 (712 + 102842), got %', n_venue; END IF;
  IF open_gaps <> 0  THEN RAISE EXCEPTION '% "Title Match heats beyond the first" gap row(s) still open', open_gaps; END IF;

  RAISE NOTICE 'OK: 2024 Title Match Heat 2 loaded -- JJF 18.13 (9.70 + 8.43) beat Italo 16.30 (8.17 + 8.13); series 2-0; 10 rides; venue Lower Trestles.';
END $$;

COMMIT;

-- =====================================================================
-- VERIFICATION QUERY -- run after applying. Expect two Title Match rows for
-- 2024 (heat 4 and heat 5, JJF first in both) and one for 2025.
--
--   select e.season_year, r.name, h.heat_number, h.wsl_heat_id,
--          string_agg(s.full_name || ' ' || he.position || ' ' || he.heat_total, ' / ' order by he.position) as result,
--          (select count(*) from waves w join heat_entries x on x.id = w.heat_entry_id where x.heat_id = h.id) as rides
--   from events e join rounds r on r.event_id = e.id join heats h on h.round_id = r.id
--   join heat_entries he on he.heat_id = h.id join surfers s on s.id = he.surfer_id
--   where e.kind = 'wsl_finals' and r.round_order = 4
--   group by 1, 2, 3, 4, h.id order by 1, 3;
-- =====================================================================
