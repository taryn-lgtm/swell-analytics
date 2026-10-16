-- =====================================================================
-- verify_m1_schema.sql
-- Post-apply verification for the M1 schema (v2 project)
-- =====================================================================
--
-- Run AFTER 00000000000001, 00000000000002 and 00000000000003.
-- Target: v2, ref tjwqskjsyluxepdbwjet.
--
-- TWO PARTS. Run them as two separate pastes.
--
--   PART A — do the constraints actually bite? Attempts fourteen writes
--            that must all be rejected. Everything happens inside one
--            transaction that ends in ROLLBACK, so nothing is written
--            even if a constraint turns out to be missing.
--
--   PART B — read-only. Runs every audit view and prints a verdict.
--
-- Part A was written because the migration could only be verified by
-- parsing, not by execution: no Postgres server was reachable from the
-- environment that prepared it. Grammar being valid does not prove a
-- CHECK rejects what it should. This is that proof.
--
-- =====================================================================


-- =====================================================================
-- PART A — negative tests. Paste this whole block.
--
-- Every test attempts a write that SHOULD be rejected.
--   PASS = the database refused it. That is what we want.
--   FAIL = the write succeeded, so the constraint is missing or wrong.
--
-- Each test runs in its own savepoint and cleans up after itself, so a
-- FAIL leaves no row behind and does not stop the later tests.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE _m1_checks (
  seq        serial,
  test       text,
  expected   text,
  verdict    text,
  detail     text
) ON COMMIT DROP;

-- --- scaffolding, rolled back with everything else ---------------------
INSERT INTO countries (code, name, iso_alpha3) VALUES ('TST', 'Testland', 'TST');
INSERT INTO venues (name, slug, country_code, kind)
  VALUES ('Test Break', 'test-break', 'TST', 'ocean');
INSERT INTO surfers (full_name, slug, country_code)
  VALUES ('Test Surfer', 'test-surfer', 'TST');
INSERT INTO seasons (year, era_code, pre_cut_event_count) VALUES (1999, 'A', 5);
INSERT INTO events
  (season_year, event_number, name, slug, kind, occurs_after_cut,
   throwaway_eligible, field_size, artefact_id)
  SELECT 1999, 1, 'Test Event', 'test-event', 'regular', false, true, 36, id
  FROM artefacts ORDER BY id LIMIT 1;
INSERT INTO rounds (event_id, round_order, name, counting_rides, max_heat_score, scoring_basis)
  SELECT id, 1, 'Opening Round', 2, 20.00, 'best_two_overall' FROM events WHERE slug = 'test-event';
INSERT INTO heats (round_id, heat_number, status)
  SELECT id, 1, 'completed' FROM rounds WHERE round_order = 1
   AND event_id = (SELECT id FROM events WHERE slug = 'test-event');
INSERT INTO heat_entries (heat_id, surfer_id, position, heat_total, artefact_id)
  SELECT h.id, s.id, 1, 15.50, a.id
  FROM heats h, surfers s, artefacts a
  WHERE s.slug = 'test-surfer' AND h.heat_number = 1
    AND h.round_id = (SELECT id FROM rounds WHERE event_id = (SELECT id FROM events WHERE slug='test-event'))
  ORDER BY a.id LIMIT 1;

-- --- the test harness --------------------------------------------------
-- Each block runs a statement that must fail. If it unexpectedly
-- succeeds we raise a marker exception, which rolls the savepoint back
-- so nothing survives either way.
CREATE OR REPLACE FUNCTION pg_temp.expect_rejection(
  p_test text, p_expected text, p_sql text
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION '__unexpectedly_succeeded__';
  EXCEPTION WHEN others THEN
    IF SQLERRM = '__unexpectedly_succeeded__' THEN
      INSERT INTO _m1_checks (test, expected, verdict, detail)
        VALUES (p_test, p_expected, 'FAIL', 'the write was ACCEPTED — constraint missing or wrong');
      RAISE NOTICE 'FAIL  %  (write was accepted)', p_test;
    ELSE
      INSERT INTO _m1_checks (test, expected, verdict, detail)
        VALUES (p_test, p_expected, 'PASS', left(SQLERRM, 120));
      RAISE NOTICE 'PASS  %', p_test;
    END IF;
  END;
END;
$fn$;

DO $$
DECLARE
  v_event   bigint := (SELECT id FROM events  WHERE slug = 'test-event');
  v_surfer  bigint := (SELECT id FROM surfers WHERE slug = 'test-surfer');
  v_art     bigint := (SELECT id FROM artefacts ORDER BY id LIMIT 1);
  v_round   bigint := (SELECT id FROM rounds WHERE event_id = (SELECT id FROM events WHERE slug='test-event'));
  v_entry   bigint := (SELECT id FROM heat_entries LIMIT 1);
BEGIN

-- 1. A wildcard cannot score points. This is the v1 failure shape.
PERFORM pg_temp.expect_rejection(
  '1  wildcard with points', 'ee_wildcards_score_nothing',
  format($q$INSERT INTO event_entries
    (event_id, surfer_id, event_placing, points, points_status, participation, artefact_id)
    VALUES (%s, %s, 5, 4745, 'published', 'event_wildcard', %s)$q$, v_event, v_surfer, v_art));

-- 2. points_status says published, but there are no points.
PERFORM pg_temp.expect_rejection(
  '2  published with NULL points', 'ee_points_status_agrees',
  format($q$INSERT INTO event_entries
    (event_id, surfer_id, event_placing, points, points_status, participation, artefact_id)
    VALUES (%s, %s, 5, NULL, 'published', 'ct_surfer', %s)$q$, v_event, v_surfer, v_art));

-- 3. points_status says none earned, but points are set.
PERFORM pg_temp.expect_rejection(
  '3  none_earned with points set', 'ee_points_status_agrees',
  format($q$INSERT INTO event_entries
    (event_id, surfer_id, event_placing, points, points_status, participation, artefact_id)
    VALUES (%s, %s, 5, 4745, 'none_earned', 'ct_surfer', %s)$q$, v_event, v_surfer, v_art));

-- 4. Did not contest, yet points were published for it.
PERFORM pg_temp.expect_rejection(
  '4  did_not_contest with published points', 'ee_did_not_contest_agrees',
  format($q$INSERT INTO event_entries
    (event_id, surfer_id, event_placing, points, points_status, participation, status, artefact_id)
    VALUES (%s, %s, NULL, 4745, 'published', 'ct_surfer', 'did_not_contest', %s)$q$, v_event, v_surfer, v_art));

-- 5. Claiming "unsourced" while pointing at a source.
PERFORM pg_temp.expect_rejection(
  '5  unsourced cut grade WITH an artefact', 'seasons_cut_grade_requires_source',
  format($q$INSERT INTO seasons (year, era_code, pre_cut_event_count, cut_source_grade, cut_source_artefact_id)
    VALUES (1998, 'A', 5, 'unsourced', %s)$q$, v_art));

-- 6. Claiming a real grade with no source behind it. The important half.
PERFORM pg_temp.expect_rejection(
  '6  declarative cut grade WITHOUT an artefact', 'seasons_cut_grade_requires_source',
  $q$INSERT INTO seasons (year, era_code, pre_cut_event_count, cut_source_grade)
     VALUES (1997, 'A', 5, 'declarative')$q$);

-- 7. A world champion with no artefact behind the claim.
PERFORM pg_temp.expect_rejection(
  '7  champion with no champion artefact', 'seasons_champion_requires_source',
  format($q$INSERT INTO seasons (year, era_code, pre_cut_event_count, world_champion_surfer_id)
    VALUES (1996, 'A', 5, %s)$q$, v_surfer));

-- 8. The same heat twice, both with a NULL heat_number.
--    Plain UNIQUE would allow this; NULLS NOT DISTINCT is why it does not.
PERFORM pg_temp.expect_rejection(
  '8  duplicate heat, NULL heat_number', 'heats_round_number_key',
  format($q$INSERT INTO heats (round_id, heat_number, sequence_in_round) VALUES (%s, NULL, 1), (%s, NULL, 1)$q$,
    v_round, v_round));

-- 9. Scoring basis contradicting the ride count.
PERFORM pg_temp.expect_rejection(
  '9  single_best_wave with counting_rides = 2', 'rounds_scoring_basis_agrees',
  format($q$INSERT INTO rounds (event_id, round_order, wsl_code, counting_rides, max_heat_score, scoring_basis)
    VALUES (%s, 99, 'NS', 2, 10.00, 'single_best_wave')$q$, v_event));

-- 10. A data gap with a scope nobody defined.
PERFORM pg_temp.expect_rejection(
  '10 data_gaps with invalid scope', 'data_gaps_scope_check',
  $q$INSERT INTO data_gaps (scope, field, reason) VALUES ('whatever', 'x', 'y')$q$);

-- 11. A fact with no provenance. M1 item 7 as a constraint.
PERFORM pg_temp.expect_rejection(
  '11 event with NULL artefact_id', 'events.artefact_id NOT NULL',
  $q$INSERT INTO events (season_year, event_number, name, slug, kind, occurs_after_cut,
      throwaway_eligible, field_size, artefact_id)
     VALUES (1999, 2, 'No Source', 'no-source', 'regular', false, true, 36, NULL)$q$);

-- 12. A wave scored above 10.
PERFORM pg_temp.expect_rejection(
  '12 wave score of 11.00', 'waves_score_range',
  format($q$INSERT INTO waves (heat_entry_id, wave_order, score, counted, artefact_id)
    VALUES (%s, 1, 11.00, true, %s)$q$, v_entry, v_art));

-- 13. A round outcome that both advances and finishes.
PERFORM pg_temp.expect_rejection(
  '13 outcome that advances AND finishes', 'rto_advance_xor_finish',
  $q$INSERT INTO round_template_outcomes
     (era_code, field_size, round_order, heat_placing, advances_to_round_order,
      finishes_at_position, source_grade)
     VALUES ('A', 36, 3, 1, 4, 17, 'sourced')$q$);

-- 14. Band occupancy naming a band that does not exist.
PERFORM pg_temp.expect_rejection(
  '14 occupancy for a non-existent band', 'points_band_occupancy FK to points_bands',
  $q$INSERT INTO points_band_occupancy (era_code, field_size, position, band_width)
     VALUES ('A', 36, 4, 1)$q$);

END $$;

-- The verdict table. Every row must read PASS.
SELECT seq, verdict, test, expected, detail
FROM _m1_checks
ORDER BY seq;

ROLLBACK;

-- If the results pane is empty after the ROLLBACK, the same PASS/FAIL
-- lines were printed as notices — check the editor's messages pane.


-- =====================================================================
-- PART B — the audit views. Read-only, safe to run any time.
-- Paste separately.
--
-- Ten views. Eight must be empty. Two are expected to have rows and are
-- labelled accordingly — they are there to be read, not gated on.
-- =====================================================================

SELECT * FROM (
  SELECT 1 AS seq, 'v_band_occupancy_check'                  AS view_name,
         (SELECT count(*) FROM v_band_occupancy_check)                  AS rows, 'must be empty' AS rule
  UNION ALL SELECT 2, 'v_round_template_band_disagreements',
         (SELECT count(*) FROM v_round_template_band_disagreements),    'must be empty'
  UNION ALL SELECT 3, 'v_round_template_flow_disagreements',
         (SELECT count(*) FROM v_round_template_flow_disagreements),    'must be empty'
  UNION ALL SELECT 4, 'v_points_disagreements',
         (SELECT count(*) FROM v_points_disagreements),                 'must be empty'
  UNION ALL SELECT 5, 'v_throwaway_disagreements',
         (SELECT count(*) FROM v_throwaway_disagreements),              'must be empty'
  UNION ALL SELECT 6, 'v_heat_total_disagreements',
         (SELECT count(*) FROM v_heat_total_disagreements),             'must be empty'
  UNION ALL SELECT 7, 'v_pre_cut_count_check',
         (SELECT count(*) FROM v_pre_cut_count_check),                  'must be empty'
  UNION ALL SELECT 8, 'v_provenance_gaps',
         (SELECT count(*) FROM v_provenance_gaps),                      'must be empty'
  UNION ALL SELECT 9, 'v_round_template_outcome_gaps',
         (SELECT count(*) FROM v_round_template_outcome_gaps),          'EXPECTED: 4 (the WSL Finals rounds)'
  UNION ALL SELECT 10, 'v_round_structure_deviations',
         (SELECT count(*) FROM v_round_structure_deviations),           'read, do not gate — wave system events belong here'
) t
ORDER BY seq;

-- The one worth looking at in full. If this is empty, the QF/SF/Final
-- outcomes carried as `assumed` are confirmed by two independently
-- published tables — the round structure from rulebook 1.06(a)/(b) and
-- the band widths from Appendix A — and stop being an assumption.
SELECT * FROM v_round_template_band_disagreements;

-- Sanity: the reference data actually landed.
SELECT 'artefacts'             AS t, count(*) FROM artefacts
UNION ALL SELECT 'eras',                  count(*) FROM eras
UNION ALL SELECT 'points_bands',          count(*) FROM points_bands
UNION ALL SELECT 'points_band_occupancy', count(*) FROM points_band_occupancy
UNION ALL SELECT 'round_templates',       count(*) FROM round_templates
UNION ALL SELECT 'round_template_outcomes', count(*) FROM round_template_outcomes
UNION ALL SELECT 'data_gaps (open)',      count(*) FROM data_gaps WHERE closed_at IS NULL
ORDER BY 1;

-- Expected: artefacts 6, eras 1, points_bands 7, points_band_occupancy 13,
-- round_templates 17, round_template_outcomes 29, data_gaps (open) 5.

-- Everything still open, in one place.
SELECT scope, season_year, field, reason FROM data_gaps WHERE closed_at IS NULL ORDER BY id;
