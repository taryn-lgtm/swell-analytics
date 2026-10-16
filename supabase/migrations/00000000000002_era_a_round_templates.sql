-- =====================================================================
-- 00000000000002_era_a_round_templates.sql
-- Era A round structures, transcribed from the format spec
-- =====================================================================
--
-- Source:  docs/format-spec/seasons/era_a.yaml, `round_structures`.
--          Transcription only — nothing here is derived, inferred or
--          rounded. If a value is not in the YAML it is not in this file.
--
-- Depends on: 00000000000001_m1_schema.sql
-- Target:     v2, ref tjwqskjsyluxepdbwjet
-- Applied by: Taryn.
--
-- WHY THIS FILE EXISTS. Without it, ingest hard-codes the placing ->
-- finishing-position mapping and design principle 3 is unmet: the rule
-- lives in code rather than in rows. With it, a new era is data.
--
-- NOT SEEDED HERE: eras beyond A, points_bands and points_band_occupancy.
-- points_bands.artefact_id is NOT NULL and the rulebook PDF has to be
-- registered in `artefacts` first — that is a retained-artefact job, not a
-- transcription job. Until it is done, v_round_template_band_disagreements
-- reports every cohort as unmatched, which is the FULL OUTER JOIN doing
-- what it should rather than a fault.
--
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- The era row, required by the foreign keys below.
-- Every value from era_a.yaml or CLAUDE.md's era table.
-- ---------------------------------------------------------------------
INSERT INTO eras (
  code, name, first_season, last_season,
  has_mid_season_cut, has_wsl_finals, champion_is_points_leader,
  throwaway_form, throwaway_eligibility, notes
) VALUES (
  'A', 'Mid-season cut and WSL Finals', 2022, 2025,
  true, true, false,
  'counting_events', 'pre_cut_only',
  'Champion is decided by the WSL Finals event, not by points — 2024 settles it: Colapinto finished on 46,600 against Ferreira''s 37,365 and ranked below him. Throwaway form is best (P-1) of P eligible events, pre-cut only, and is DERIVED FROM PUBLISHED RANKINGS, not from the rulebook. Rule 1.09(c) is contradicted by the data.'
);


-- =====================================================================
-- Pre-cut format — 36 surfers. Rulebook 1.06(a).
-- =====================================================================

INSERT INTO round_templates
  (era_code, field_size, round_order, name, heat_count, heat_size,
   outcome_basis, source, source_grade) VALUES
  ('A', 36, 1, 'Opening Round',     12, 3, 'event_placing', 'rulebook 1.06(a)', 'sourced'),
  ('A', 36, 2, 'Elimination Round',  4, 3, 'event_placing', 'rulebook 1.06(a)', 'sourced'),
  ('A', 36, 3, 'Round of 32',       16, 2, 'event_placing', 'rulebook 1.06(a)', 'sourced'),
  ('A', 36, 4, 'Round of 16',        8, 2, 'event_placing', 'rulebook 1.06(a)', 'sourced'),
  ('A', 36, 5, 'Quarter Finals',     4, 2, 'event_placing', 'rulebook 1.06(a)', 'sourced'),
  ('A', 36, 6, 'Semi Finals',        2, 2, 'event_placing', 'rulebook 1.06(a)', 'sourced'),
  ('A', 36, 7, 'Final',              1, 2, 'event_placing', 'rulebook 1.06(a)', 'sourced');

COMMENT ON TABLE round_templates IS
  'What the format specifies, not what an event had. rounds is the observed structure; this is the expected one, and v_round_structure_deviations is the two asserted against each other — rule 2, applied to the draw. Round of 32 is literal: 12 x 3 = 36, 24 advance directly, 12 drop to a 4-heat Elimination Round from which 8 advance, 24 + 8 = 32.';

INSERT INTO round_template_outcomes
  (era_code, field_size, round_order, heat_placing,
   advances_to_round_order, finishes_at_position, source_grade, notes) VALUES
  -- Opening Round: 1 and 2 straight through, 3 drops to the Elimination Round
  ('A', 36, 1, 1, 3,    NULL, 'sourced', NULL),
  ('A', 36, 1, 2, 3,    NULL, 'sourced', NULL),
  ('A', 36, 1, 3, 2,    NULL, 'sourced', NULL),
  -- Elimination Round: last man out finishes 33rd
  ('A', 36, 2, 1, 3,    NULL, 'sourced', NULL),
  ('A', 36, 2, 2, 3,    NULL, 'sourced', NULL),
  ('A', 36, 2, 3, NULL, 33,   'sourced', NULL),
  -- Round of 32 onwards: two-man heats, loser takes the band
  ('A', 36, 3, 1, 4,    NULL, 'sourced', NULL),
  ('A', 36, 3, 2, NULL, 17,   'sourced', NULL),
  ('A', 36, 4, 1, 5,    NULL, 'sourced', NULL),
  ('A', 36, 4, 2, NULL, 9,    'sourced', NULL),
  ('A', 36, 5, 1, 6,    NULL, 'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 36, 5, 2, NULL, 5,    'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 36, 6, 1, 7,    NULL, 'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 36, 6, 2, NULL, 3,    'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 36, 7, 1, NULL, 1,    'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 36, 7, 2, NULL, 2,    'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml');


-- =====================================================================
-- Post-cut format — 24 surfers. Rulebook 1.06(b).
--
-- 24, not 22. Rule 1.09(a)(i) qualifies the top 22 men from the CT
-- rankings; the field is completed by wildcards. Do not conflate
-- "requalified" with "competing".
-- =====================================================================

INSERT INTO round_templates
  (era_code, field_size, round_order, name, heat_count, heat_size,
   outcome_basis, source, source_grade) VALUES
  ('A', 24, 1, 'Opening Round',     8, 3, 'event_placing', 'rulebook 1.06(b)', 'sourced'),
  ('A', 24, 2, 'Elimination Round', 8, 2, 'event_placing', 'rulebook 1.06(b)', 'sourced'),
  ('A', 24, 3, 'Round of 16',       8, 2, 'event_placing', 'rulebook 1.06(b)', 'sourced'),
  ('A', 24, 4, 'Quarter Finals',    4, 2, 'event_placing', 'rulebook 1.06(b)', 'sourced'),
  ('A', 24, 5, 'Semi Finals',       2, 2, 'event_placing', 'rulebook 1.06(b)', 'sourced'),
  ('A', 24, 6, 'Final',             1, 2, 'event_placing', 'rulebook 1.06(b)', 'sourced');

INSERT INTO round_template_outcomes
  (era_code, field_size, round_order, heat_placing,
   advances_to_round_order, finishes_at_position, source_grade, notes) VALUES
  -- Opening Round: only the winner goes straight through
  ('A', 24, 1, 1, 3,    NULL, 'sourced', NULL),
  ('A', 24, 1, 2, 2,    NULL, 'sourced', NULL),
  ('A', 24, 1, 3, 2,    NULL, 'sourced', NULL),
  ('A', 24, 2, 1, 3,    NULL, 'sourced', NULL),
  ('A', 24, 2, 2, NULL, 17,   'sourced', NULL),
  ('A', 24, 3, 1, 4,    NULL, 'sourced', NULL),
  ('A', 24, 3, 2, NULL, 9,    'sourced', NULL),
  ('A', 24, 4, 1, 5,    NULL, 'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 24, 4, 2, NULL, 5,    'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 24, 5, 1, 6,    NULL, 'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 24, 5, 2, NULL, 3,    'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 24, 6, 1, NULL, 1,    'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml'),
  ('A', 24, 6, 2, NULL, 2,    'assumed', 'closing_rounds_source: ASSUMED — era_a.yaml');


-- =====================================================================
-- WSL Finals — 5 surfers. Rulebook 1.06(e).
--
-- Structure only. THE OUTCOMES ARE DELIBERATELY ABSENT: era_a.yaml gives
-- the ladder and states that the winner of the Final Match is world
-- champion, and says nothing about where the four losers finish. The
-- mapping "loser of Match 1 takes rank 5" is a plausible inference and
-- plausible inferences are what v1 was rebuilt to remove.
--
-- These four rows will therefore appear in v_round_template_outcome_gaps.
-- That is the point. A data_gaps row goes with them.
-- =====================================================================

INSERT INTO round_templates
  (era_code, field_size, round_order, name, heat_count, heat_size, best_of,
   entry_rule, outcome_basis, source, source_grade, notes) VALUES
  ('A', 5, 1, 'Match 1',     1, 2, 1, 'seed_5 v seed_4',
   'season_rank_reallocation', 'rulebook 1.06(e)', 'sourced', NULL),
  ('A', 5, 2, 'Match 2',     1, 2, 1, 'winner_match_1 v seed_3',
   'season_rank_reallocation', 'rulebook 1.06(e)', 'sourced', NULL),
  ('A', 5, 3, 'Match 3',     1, 2, 1, 'winner_match_2 v seed_2',
   'season_rank_reallocation', 'rulebook 1.06(e)', 'sourced', NULL),
  ('A', 5, 4, 'Final Match', 1, 2, 3, 'winner_match_3 v seed_1',
   'season_rank_reallocation', 'rulebook 1.06(e)', 'sourced',
   'Best of three heats. A "Final" is not always one heat — any model assuming one heat per round name breaks here. Seeded from CT ranking points after the last Regular Season event. A top-five surfer injured before the Finals is not replaced; the event runs with four and rankings are adjusted per 1.05(f).');

INSERT INTO data_gaps (scope, season_year, field, reason, source_note) VALUES
  ('tour', NULL, 'round_template_outcomes for the WSL Finals (era A, field_size 5)',
   'era_a.yaml 1.06(e) gives the ladder and names the winner of the Final Match as world champion. It does not state where the four losers finish in the final rankings. Not inferred.',
   'Close by sourcing 1.05(f) or the published final rankings for a season where a Finals loser''s rank is unambiguous.');

COMMIT;
