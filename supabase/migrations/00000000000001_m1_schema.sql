-- =====================================================================
-- 00000000000001_m1_schema.sql
-- WSL Analytics 2.0 — M1 schema, Era A
-- =====================================================================
--
-- Milestone:   M1 item 1 (docs/CURRENT_MILESTONE.md)
-- Built from:  docs/SCHEMA_DESIGN.md (29 July 2026)
-- Reviewed:    docs/findings/2026-08-08_schema_review.md — read it before
--              applying. Ten defects were found against the design document:
--              eight are corrected here, two are carried and documented.
--              Three decisions were taken by Taryn on 8 August. All listed
--              in the review note.
--
-- CONTAINS:    19 tables, 12 audit views. RLS enabled, no policies.
--              Tables 18 and 19 — round_templates and
--              round_template_outcomes — were added on 8 August: they are
--              the "rules live in rows" table the design was missing.
--              Seeded by 00000000000002_era_a_round_templates.sql.
--
-- APPLY VIA:   the Supabase SQL Editor, not `npm run migrate`. The
--              Management API times out on large SQL files and this one is
--              ~44 KB. Apply 00000000000001 then 00000000000002, then
--              record both in the ledger with
--              `npm run migrate -- --baseline`.
--
-- TARGET:      the v2 Supabase project, ref tjwqskjsyluxepdbwjet.
--              NOT the v1 project gjuxopwtmqjvkodojusv, which is quarantined.
--              `npm run migrate` targets v2 by default and prints the ref.
--
-- APPLIED BY:  Taryn. Production writes stay with Taryn; this file is
--              prepared and verified only.
--
-- Verification run on this file: parsed against the PostgreSQL grammar via
-- libpg_query (pglast 8.4). Constraint *behaviour* is unexecuted — no
-- Postgres server was reachable from the preparation environment. The
-- negative tests are written out in the review note, ready to paste into
-- the SQL Editor once the tables exist.
--
-- The three rules this schema exists to enforce (SCHEMA_DESIGN.md):
--   1. A value with no source is not a value.
--   2. Two independent signals, asserted to agree.
--   3. Era-awareness is structural, not conditional.
--
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Guard: refuse to run against the quarantined v1 project.
--
-- v1 holds tables named countries, events, heats, seasons, surfers,
-- venues and season_rankings — the same names this migration creates.
-- Applying here would not error; it would silently interleave two
-- schemas. heat_results and wave_scores are v1-only names and make a
-- clean discriminator.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('heat_results', 'wave_scores')
  ) THEN
    RAISE EXCEPTION
      'v1 tables (heat_results/wave_scores) are present. This looks like the quarantined v1 project gjuxopwtmqjvkodojusv. Refusing to run.';
  END IF;
END $$;


-- =====================================================================
-- 1. PROVENANCE
-- =====================================================================

-- The table everything else points at. Nothing else works without it.
CREATE TABLE artefacts (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url             text,
  file_path       text NOT NULL,
  sha256          char(64) NOT NULL,
  fetched_at      timestamptz NOT NULL,
  http_status     integer,
  content_type    text,
  content_length  bigint,
  retrieval       text NOT NULL,
  notes           text,
  CONSTRAINT artefacts_retrieval_check CHECK (retrieval IN (
    'manual_browser_save',    -- personal use, ToU 7(F)
    'script_own_ua',          -- reconstruct_season.ts, pre-26-July only
    'published_pdf',          -- rulebooks
    'third_party'
  )),
  CONSTRAINT artefacts_sha256_key UNIQUE (sha256),
  CONSTRAINT artefacts_file_path_key UNIQUE (file_path)
);

COMMENT ON COLUMN artefacts.retrieval IS
  'How the bytes were obtained. The Terms of Use finding (2026-07-26) means the project must be able to answer that per row, permanently. script_own_ua should appear on exactly one artefact — the 2024 rankings page, which predates the finding — and never again unless WSL grants permission.';
COMMENT ON CONSTRAINT artefacts_sha256_key ON artefacts IS
  'Deduplicates identical bytes. Note the consequence: re-saving an unchanged page is rejected rather than recorded as a second retrieval. Accepted deliberately — see review note defect 6.';


-- =====================================================================
-- 2. ERA RULES AS DATA
-- =====================================================================

CREATE TABLE eras (
  code                      char(1) PRIMARY KEY,
  name                      text NOT NULL,
  first_season              integer NOT NULL,
  last_season               integer,
  has_mid_season_cut        boolean NOT NULL,
  has_wsl_finals            boolean NOT NULL,
  champion_is_points_leader boolean NOT NULL,
  throwaway_form            text,
  throwaway_eligibility     text,
  notes                     text
);

COMMENT ON TABLE eras IS
  'Rule 3: era-awareness is structural. No IF year >= 2022 in application code — the rules live in rows.';

-- Position -> points. Field-size independent: rulebook Appendix B gives one
-- points value per band label regardless of whether the field is 36 or 24.
CREATE TABLE points_bands (
  era_code    char(1) NOT NULL REFERENCES eras(code),
  position    integer NOT NULL,   -- band label: 1, 2, 3, 5, 9, 17, 33
  points      integer NOT NULL,
  artefact_id bigint NOT NULL REFERENCES artefacts(id),
  source_note text,
  PRIMARY KEY (era_code, position)
);

COMMENT ON TABLE points_bands IS
  'No multiplier column, deliberately. There is no Pipe multiplier in Era A. If 2026 needs one it gets its own era row and its own bands — which is what the 2026 book''s elevated Pipe column actually is.';

-- How many surfers share each band. This IS field-size dependent and was the
-- defect in the design document, which keyed band_width on (era, position)
-- alone. A 36-surfer pre-cut field puts 16 into the 17th band and has a 33rd
-- band; a 24-surfer post-cut field puts 8 into the 17th band and has no 33rd
-- band at all. See review note defect 1.
CREATE TABLE points_band_occupancy (
  era_code    char(1) NOT NULL,
  field_size  integer NOT NULL,
  position    integer NOT NULL,
  band_width  integer NOT NULL,
  artefact_id bigint REFERENCES artefacts(id),
  source_note text,
  PRIMARY KEY (era_code, field_size, position),
  FOREIGN KEY (era_code, position) REFERENCES points_bands(era_code, position),
  CONSTRAINT pbo_band_width_positive CHECK (band_width > 0)
);

COMMENT ON TABLE points_band_occupancy IS
  'Occupancy is what closes the closing-rounds derivation in docs/findings/2026-07-29_rulebook_provenance.md §3 — four QF losers into a four-wide band, two SF losers into a two-wide band. Stored rather than computed so the derivation is checkable by query rather than by argument. v_band_occupancy_check asserts the widths sum to the field size.';


-- =====================================================================
-- 3. REFERENCE
-- =====================================================================

-- Not in SCHEMA_DESIGN.md — the design lists this table but gives no DDL.
-- See review note defect 5.
CREATE TABLE countries (
  code        text PRIMARY KEY,      -- WSL's own 3-letter code
  name        text NOT NULL,
  iso_alpha3  char(3),               -- NULL where WSL's code is not ISO
  notes       text
);

COMMENT ON COLUMN countries.code IS
  'WSL''s code as published, not ISO 3166-1. WSL uses HAW for Hawaii, which is not an ISO country. iso_alpha3 is nullable for exactly that reason — mapping HAW to USA would discard a distinction WSL makes.';

CREATE TABLE venues (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  slug          text NOT NULL,
  country_code  text REFERENCES countries(code),
  kind          text NOT NULL,
  artefact_id   bigint REFERENCES artefacts(id),
  CONSTRAINT venues_kind_check CHECK (kind IN ('ocean', 'wave_system')),
  CONSTRAINT venues_slug_key UNIQUE (slug)
);

COMMENT ON COLUMN venues.kind IS
  'wave_system is WSL''s current term (2023 books onward); the 2020 and 2022 books define the identical concept as Wave Pool. POOL_EVENTS.md §1. Two Era A venues are wave_system: Surf Ranch (2023) and Surf Abu Dhabi (2025).';

CREATE TABLE surfers (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wsl_athlete_id  text,
  full_name       text NOT NULL,
  slug            text NOT NULL,
  country_code    text REFERENCES countries(code),
  artefact_id     bigint REFERENCES artefacts(id),
  CONSTRAINT surfers_slug_key UNIQUE (slug)
);

COMMENT ON TABLE surfers IS
  'Identity only. Stance, birth date and height are deliberately absent — no retained artefact carries them, and a column no source can fill is the speculative-column pattern this schema refuses elsewhere. Add them in the phase that acquires them.';


-- =====================================================================
-- 4. SEASONS
-- =====================================================================

CREATE TABLE seasons (
  year                     integer PRIMARY KEY,
  era_code                 char(1) NOT NULL REFERENCES eras(code),
  cut_after_event          integer,
  cut_positions            integer,
  cut_source_artefact_id   bigint REFERENCES artefacts(id),
  cut_source_grade         text,
  cut_source_note          text,
  pre_cut_event_count      integer NOT NULL,
  world_champion_surfer_id bigint REFERENCES surfers(id),
  champion_artefact_id     bigint REFERENCES artefacts(id),
  CONSTRAINT seasons_cut_grade_check CHECK (cut_source_grade IN (
    'declarative', 'corroborating', 'interpolated', 'unsourced'
  )),
  CONSTRAINT seasons_cut_grade_requires_source CHECK (
    (cut_source_grade = 'unsourced' AND cut_source_artefact_id IS NULL)
    OR (cut_source_grade <> 'unsourced' AND cut_source_artefact_id IS NOT NULL)
  ),
  -- M1 item 6 (explicit champion) meeting item 7 (provenance).
  -- Added in review; not in the design document. Review note defect 4.
  CONSTRAINT seasons_champion_requires_source CHECK (
    world_champion_surfer_id IS NULL OR champion_artefact_id IS NOT NULL
  ),
  CONSTRAINT seasons_pre_cut_count_positive CHECK (pre_cut_event_count > 0)
);

COMMENT ON COLUMN seasons.cut_source_grade IS
  'The category the spec has needed since 28 July. Rule 1.09(c) is conditionally phrased; the 2023 and 2024 points tables are bracketed by identical endpoints. Neither is null and neither is a clean citation. Forcing them into a sourced/unsourced boolean is what makes people round up. 2024 is unsourced; 2023 is at best corroborating, from a 2022-season book.';
COMMENT ON COLUMN seasons.world_champion_surfer_id IS
  'A column, never a query. 2024 settles it: Colapinto finished on 46,600 against Ferreira''s 37,365 and ranked below him.';
COMMENT ON COLUMN seasons.pre_cut_event_count IS
  'P, for the throwaway rule: best (P-1) of P eligible events. Duplicates a count over events.occurs_after_cut deliberately — the two are asserted to agree in v_pre_cut_count_check, which is rule 2 applied to the project''s own bookkeeping.';


-- =====================================================================
-- 5. EVENTS
-- =====================================================================

CREATE TABLE events (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_year           integer NOT NULL REFERENCES seasons(year),
  event_number          integer NOT NULL,   -- ORDER FROM THE CALENDAR
  wsl_event_id          text,               -- NOT an ordering key
  name                  text NOT NULL,
  slug                  text NOT NULL,
  venue_id              bigint REFERENCES venues(id),
  start_date            date,
  end_date              date,
  kind                  text NOT NULL,
  occurs_after_cut      boolean NOT NULL,
  throwaway_eligible    boolean NOT NULL,
  awards_ranking_points boolean NOT NULL DEFAULT true,
  field_size            integer,
  artefact_id           bigint NOT NULL REFERENCES artefacts(id),
  CONSTRAINT events_kind_check CHECK (kind IN ('regular', 'wsl_finals')),
  CONSTRAINT events_season_number_key UNIQUE (season_year, event_number),
  CONSTRAINT events_dates_ordered CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  )
);

COMMENT ON COLUMN events.event_number IS
  'From the calendar. 2022 event IDs run 2, 3, 6, 9, 5, 8, 12, 7, 4, 11, 10 — the other three Era A seasons are sequential, which is what makes this an easy trap. Never order by wsl_event_id.';
COMMENT ON COLUMN events.occurs_after_cut IS
  'Two columns, not one. v1 had a single is_post_cut carrying both this and throwaway eligibility, and their relationship is era-dependent: in 2021 any event was droppable, from 2022 only pre-cut ones are. One boolean cannot be era-aware.';
COMMENT ON COLUMN events.awards_ranking_points IS
  'false for the WSL Finals, which reallocates the top five positions rather than awarding points. Modelling it as a points event double-counts.';
COMMENT ON COLUMN events.field_size IS
  '36 pre-cut, 24 post-cut, 5 at the Finals. Joins to points_band_occupancy — the band a placing falls in depends on this.';


-- =====================================================================
-- 6. ROUNDS  — the biggest change from v1
-- =====================================================================

CREATE TABLE rounds (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id       bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_order    integer NOT NULL,
  wsl_code       text,            -- 'NS' — what WSL publishes
  name           text,            -- expansion; NULL when unsourced
  counting_rides integer,
  max_heat_score numeric(4,2),
  scoring_basis  text,
  is_leaderboard boolean NOT NULL DEFAULT false,
  artefact_id    bigint REFERENCES artefacts(id),
  CONSTRAINT rounds_scoring_check CHECK (scoring_basis IN (
    'best_two_overall',       -- ocean events
    'best_left_plus_right',   -- wave system events
    'single_best_wave'        -- the NS round, 2023 Surf Ranch
  )),
  -- Added in review: the three scoring columns were mutually unconstrained,
  -- so a round could claim single_best_wave and counting_rides = 2.
  -- Review note defect 2.
  CONSTRAINT rounds_scoring_basis_agrees CHECK (
    scoring_basis IS NULL
    OR (scoring_basis = 'single_best_wave' AND counting_rides = 1)
    OR (scoring_basis <> 'single_best_wave' AND counting_rides = 2)
  ),
  CONSTRAINT rounds_event_order_key UNIQUE (event_id, round_order)
);

COMMENT ON TABLE rounds IS
  'The table v1 has no equivalent of. Scoring basis belongs to the round, not the event: within the 2023 Surf Ranch, the NS round counts one wave to a maximum of 10.00 while every other round counts two to 20.00. With round as a text column on heats, that fact has nowhere to live except repeated per heat.';
COMMENT ON COLUMN rounds.wsl_code IS
  'WSL''s attested code. "Adv to NS" appears on 12 rows in 2023 and 24 in 2025.';
COMMENT ON COLUMN rounds.name IS
  'The expansion, and it stays NULL until a WSL page renders it in full. "Night Session" and "Night Round" are both unsourced inventions; the project carried one of them across three documents as if it were fact. Record the code, leave the name null.';
COMMENT ON COLUMN rounds.is_leaderboard IS
  'The 2023 Surf Ranch NS round has no heats at all — a single 12-man leaderboard. A schema assuming every round decomposes into heats breaks there. Distinct from the 2025 Abu Dhabi second round, which takes 24 surfers with heat count null. Two different events; do not merge them.';


-- =====================================================================
-- 7. HEATS AND ENTRIES
-- =====================================================================

CREATE TABLE heats (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  round_id          bigint NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  heat_number       integer,
  sequence_in_round integer,
  wsl_heat_id       text,
  status            text NOT NULL DEFAULT 'completed',
  artefact_id       bigint REFERENCES artefacts(id),
  CONSTRAINT heats_status_check CHECK (status IN ('completed', 'abandoned', 'not_held')),
  -- Added in review: heats had no uniqueness at all beyond the surrogate key,
  -- so the same heat could be ingested twice. NULLS NOT DISTINCT because
  -- heat_number is legitimately null (2025 Abu Dhabi) and ordinary NULL
  -- semantics would let those duplicate freely. Review note defect 3.
  CONSTRAINT heats_round_number_key
    UNIQUE NULLS NOT DISTINCT (round_id, heat_number, sequence_in_round)
);

COMMENT ON COLUMN heats.sequence_in_round IS
  'A "Final" is not always one heat. The WSL Finals Final Match is best of three.';
COMMENT ON TABLE heats IS
  'Conditions columns (wave height, wind, tide) were dropped from the design on 8 August: conditions are Phase 3 deferred data in both CLAUDE.md and the plan, so they would be all-null through M1 and M2 — the speculative-column pattern this schema refuses for Datum and Trim. Add them in the migration that acquires a source.';

CREATE TABLE heat_entries (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  heat_id              bigint NOT NULL REFERENCES heats(id) ON DELETE CASCADE,
  surfer_id            bigint NOT NULL REFERENCES surfers(id),
  position             integer,
  heat_total           numeric(4,2),
  progression_text     text,
  advanced_to_round_id bigint REFERENCES rounds(id),
  finished_position    integer,
  artefact_id          bigint NOT NULL REFERENCES artefacts(id),
  CONSTRAINT heat_entries_heat_surfer_key UNIQUE (heat_id, surfer_id)
);

COMMENT ON COLUMN heat_entries.progression_text IS
  'WSL''s raw string, retained verbatim as well as parsed — e.g. "Adv to R/32 - HT 8". v1 had position null across all 10,588 heat rows because this was never mapped; the data was on the page the whole time. Keeping the raw string means a parsing bug is fixable without re-fetching, which matters when re-fetching is prohibited.';
COMMENT ON COLUMN heat_entries.heat_total IS
  'Published independently of the wave scores, and therefore the check that the waves sum correctly. v_heat_total_agreement runs it. No wave_1_score/wave_2_score columns — v1 had those and a wave_scores table, the same fact in two places with nothing tying them.';
COMMENT ON COLUMN heat_entries.finished_position IS
  'Where this surfer stopped. Related to but not identical with event_entries.event_placing, which is the event outcome. Confirm they reconcile before relying on either — SCHEMA_DESIGN.md open question 4.';


-- =====================================================================
-- 8. WAVES
-- =====================================================================

CREATE TABLE waves (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  heat_entry_id bigint NOT NULL REFERENCES heat_entries(id) ON DELETE CASCADE,
  wave_order    integer NOT NULL,
  score         numeric(4,2) NOT NULL,
  counted       boolean NOT NULL,
  orientation   text,
  artefact_id   bigint NOT NULL REFERENCES artefacts(id),
  CONSTRAINT waves_orientation_check CHECK (orientation IN ('left', 'right')),
  CONSTRAINT waves_score_range CHECK (score >= 0 AND score <= 10),
  CONSTRAINT waves_entry_order_key UNIQUE (heat_entry_id, wave_order)
);

COMMENT ON COLUMN waves.orientation IS
  'Nullable, and that is correct rather than lazy. Wave system heat totals are best-left plus best-right, not best two overall. Ocean events have no orientation to record, and NOT NULL here would force a fabricated value onto most rows — the exact failure being designed against.';
COMMENT ON TABLE waves IS
  'The counting waves — best two per surfer per heat, rulebook 10.05(c) — which WSL does publish. Every non-counting ride, with times and judge-by-judge breakdown, is not available anywhere. docs/findings/2026-07-28_wave_level_availability.md.';


-- =====================================================================
-- 9. EVENT ENTRIES — the table that would have prevented v1
-- =====================================================================

CREATE TABLE event_entries (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id            bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  surfer_id           bigint NOT NULL REFERENCES surfers(id),
  event_placing       integer,        -- 'placing' is a Postgres reserved word
  points              integer,        -- published only. Never derived.
  points_status       text NOT NULL,
  participation       text NOT NULL,
  status              text NOT NULL DEFAULT 'competed',
  throwaway_published boolean,        -- WSL's no-count class
  throwaway_derived   boolean,        -- ours
  artefact_id         bigint NOT NULL REFERENCES artefacts(id),
  CONSTRAINT ee_participation_check CHECK (participation IN (
    'ct_surfer', 'injury_replacement', 'event_wildcard'
  )),
  CONSTRAINT ee_status_check CHECK (status IN (
    'competed', 'injured_withdrawal', 'did_not_contest'
  )),
  CONSTRAINT ee_points_status_check CHECK (points_status IN (
    'published',      -- read from the rankings page. points IS NOT NULL
    'none_earned',    -- structurally zero: wildcard. points IS NULL, correctly
    'not_contested',  -- the cell rendered '-'. points IS NULL, correctly
    'unread'          -- SHOULD have a value and does not. A FAILURE.
  )),
  CONSTRAINT ee_points_status_agrees CHECK (
    (points_status = 'published' AND points IS NOT NULL)
    OR (points_status <> 'published' AND points IS NULL)
  ),
  CONSTRAINT ee_wildcards_score_nothing CHECK (
    participation <> 'event_wildcard' OR points IS NULL
  ),
  -- Added in review: status and points_status encoded the same fact twice
  -- with nothing tying them. One-directional deliberately — see review
  -- note defect 7 for why the converse is not asserted yet.
  CONSTRAINT ee_did_not_contest_agrees CHECK (
    status <> 'did_not_contest' OR points_status = 'not_contested'
  ),
  CONSTRAINT ee_event_surfer_key UNIQUE (event_id, surfer_id)
);

COMMENT ON COLUMN event_entries.points IS
  'Only ever the published value, read from the rankings page cell for that surfer and event. Never written by a derivation, under any circumstance. The derived value is not stored at all — it is a pure function of event_placing, participation and points_bands, so it lives in v_points_reconciliation and is recomputed on demand. Storing it would let a later correction to points_bands leave a stale column behind, which is drift by construction.';
COMMENT ON COLUMN event_entries.points_status IS
  'Why points is what it is. A wildcard''s missing points and a dropped table cell are both NULL: the first is correct, the second is the v1 failure arriving through a different door. "unread" is deliberately ugly to write — an ingest that produces one should feel like it has failed, because it has, and it needs a data_gaps row.';
COMMENT ON COLUMN event_entries.participation IS
  'The single most important column in this schema. Wildcards take a finishing placing and earn no ranking points. Deriving points from placing alone silently awards points nobody earned, to a whole cohort, raising no error — the v1 failure shape exactly. ee_wildcards_score_nothing makes it a constraint violation rather than a plausible number. Ingest ordering follows: participation must be known before points are written, since it decides whether an absent value is none_earned or unread.';
COMMENT ON COLUMN event_entries.status IS
  'Separate from participation because an injured withdrawal keeps its earned placing and points. Two different questions: what kind of entrant, and what happened to them.';
COMMENT ON COLUMN event_entries.throwaway_derived IS
  'Ours, from best (P-1) of P eligible events. Stored alongside the published flag and asserted to agree in v_throwaway_disagreements. Deriving alone and treating the result as truth is how a rule that is 95%% right becomes invisible for the other 5%%. Note this is the one derived value stored anywhere in the schema, and its provenance is the rule rather than an artefact — see review note defect 8.';


-- =====================================================================
-- 10. PUBLISHED RANKINGS AND HONEST GAPS
-- =====================================================================

CREATE TABLE season_rankings (
  season_year  integer NOT NULL REFERENCES seasons(year),
  surfer_id    bigint NOT NULL REFERENCES surfers(id),
  rank         integer NOT NULL,
  points_total integer NOT NULL,
  artefact_id  bigint NOT NULL REFERENCES artefacts(id),
  PRIMARY KEY (season_year, surfer_id)
);

COMMENT ON COLUMN season_rankings.artefact_id IS
  'NOT NULL. These are the authority the whole reconciliation gate runs against; a published ranking with no artefact behind it is not a published ranking.';

CREATE TABLE data_gaps (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope       text NOT NULL,
  scope_id    bigint,
  season_year integer REFERENCES seasons(year),
  field       text NOT NULL,
  reason      text NOT NULL,
  source_note text,
  opened_at   date NOT NULL DEFAULT current_date,
  closed_at   date,
  -- Added in review: the design listed four scope values in a comment and
  -- constrained none of them. Review note defect 9.
  CONSTRAINT data_gaps_scope_check CHECK (scope IN (
    'event', 'round', 'heat', 'heat_entry', 'season', 'tour'
  )),
  CONSTRAINT data_gaps_dates_ordered CHECK (
    closed_at IS NULL OR closed_at >= opened_at
  )
);

COMMENT ON TABLE data_gaps IS
  'How M1 item 5 is satisfied without fabricating anything. A missing wave score is either present, or a row here with a reason. Silent absence is a failure. scope_id is deliberately not a foreign key — it points at whichever table scope names.';


-- =====================================================================
-- 11. CARRIED, UNPOPULATED
-- =====================================================================

CREATE TABLE interferences (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  heat_id       bigint NOT NULL REFERENCES heats(id) ON DELETE CASCADE,
  offender_id   bigint NOT NULL REFERENCES surfers(id),
  against_id    bigint REFERENCES surfers(id),
  wave_id       bigint REFERENCES waves(id),
  penalty_level text NOT NULL,
  artefact_id   bigint REFERENCES artefacts(id),
  CONSTRAINT interference_level_check CHECK (penalty_level IN (
    '1', '2', '3', 'disqualification'
  ))
);

COMMENT ON TABLE interferences IS
  'A full record — who, against whom, which wave, what penalty — not a boolean. Rule 11.17 defines four levels that alter ride values. Not published as structured data anywhere on the WSL site, so this stays empty in M1 and the absence is recorded in data_gaps. No Datum or Trim tables: M2, and the plan is explicit that prediction tables are not created speculatively.';


-- =====================================================================
-- 12. ROUND STRUCTURE TEMPLATES
--
-- Design principle 3: "the rules live in rows, keyed by era, so a new era
-- is data rather than a code change." era_a.yaml `round_structures` is
-- exactly such a rule and had nowhere to live — `rounds` records what an
-- event actually had, nothing recorded what the format says an event of
-- that shape should have. Without these two tables, ingest hard-codes the
-- placing -> finishing-position mapping, which is the IF year >= 2022
-- pattern arriving under a different name.
--
-- Keyed on (era_code, field_size) to mirror points_band_occupancy. The
-- three Era A structures are field_size 36 (pre-cut), 24 (post-cut) and
-- 5 (WSL Finals).
-- =====================================================================

CREATE TABLE round_templates (
  era_code       char(1) NOT NULL REFERENCES eras(code),
  field_size     integer NOT NULL,
  round_order    integer NOT NULL,
  name           text    NOT NULL,
  heat_count     integer,
  heat_size      integer,
  best_of        integer NOT NULL DEFAULT 1,
  entry_rule     text,
  outcome_basis  text    NOT NULL,
  source         text    NOT NULL,
  source_grade   text    NOT NULL,
  artefact_id    bigint REFERENCES artefacts(id),
  notes          text,
  PRIMARY KEY (era_code, field_size, round_order),
  CONSTRAINT rt_outcome_basis_check CHECK (outcome_basis IN (
    'event_placing',              -- ordinary CT events: losers take a band placing
    'season_rank_reallocation'    -- the WSL Finals: reallocates positions 1-5
  )),
  CONSTRAINT rt_source_grade_check CHECK (source_grade IN ('sourced', 'assumed')),
  CONSTRAINT rt_best_of_odd CHECK (best_of >= 1 AND best_of % 2 = 1),
  CONSTRAINT rt_name_unique UNIQUE (era_code, field_size, name)
);

COMMENT ON TABLE round_templates IS
  'What the format specifies, not what an event had. rounds is the observed structure; this is the expected one, and v_round_structure_deviations is the two asserted against each other — rule 2, applied to the draw.';
COMMENT ON COLUMN round_templates.best_of IS
  'A "Final" is not always one heat. The WSL Finals Final Match is best of three. Constrained odd because an even best-of cannot resolve.';
COMMENT ON COLUMN round_templates.outcome_basis IS
  'The WSL Finals awards no ranking points — it reallocates the top five positions. Its outcomes are season ranks, not event placings, and the two check views exclude it for that reason.';
COMMENT ON COLUMN round_templates.source_grade IS
  'assumed carries era_a.yaml closing_rounds_source: ASSUMED into the database rather than leaving it in a YAML comment. It is the project''s one declared live assumption and it should be visible in a query.';
COMMENT ON COLUMN round_templates.entry_rule IS
  'Verbatim from the spec where entry is not simply "the winners of the previous round" — e.g. the Finals ladder''s seed_5 v seed_4. Deliberately text: modelling seeding properly needs a table this milestone does not need.';

CREATE TABLE round_template_outcomes (
  era_code                char(1) NOT NULL,
  field_size              integer NOT NULL,
  round_order             integer NOT NULL,
  heat_placing            integer NOT NULL,   -- placing WITHIN the heat
  advances_to_round_order integer,
  finishes_at_position    integer,
  source_grade            text NOT NULL,
  notes                   text,
  PRIMARY KEY (era_code, field_size, round_order, heat_placing),
  FOREIGN KEY (era_code, field_size, round_order)
    REFERENCES round_templates (era_code, field_size, round_order) ON DELETE CASCADE,
  FOREIGN KEY (era_code, field_size, advances_to_round_order)
    REFERENCES round_templates (era_code, field_size, round_order),
  CONSTRAINT rto_source_grade_check CHECK (source_grade IN ('sourced', 'assumed')),
  -- Advance or finish, exactly one. A placing that does neither is a hole
  -- in the format; a placing that does both is a contradiction.
  CONSTRAINT rto_advance_xor_finish CHECK (
    (advances_to_round_order IS NULL) <> (finishes_at_position IS NULL)
  ),
  CONSTRAINT rto_progression_forward CHECK (
    advances_to_round_order IS NULL OR advances_to_round_order > round_order
  ),
  CONSTRAINT rto_placing_positive CHECK (heat_placing >= 1)
);

COMMENT ON TABLE round_template_outcomes IS
  'One row per (round, heat_placing). Elimination Round placing 3 finishes 33rd; Round of 32 placing 2 finishes 17th; Opening Round placings 1 and 2 advance to the Round of 32 and placing 3 drops to the Elimination Round.';
COMMENT ON COLUMN round_template_outcomes.heat_placing IS
  'Placing within the heat, not within the event. Heats are 2 or 3 surfers, so this is 1..3.';


-- =====================================================================
-- 13. INDEXES
--
-- Foreign keys that do not already lead a unique index. Postgres does not
-- index the referencing side automatically, and every one of these is a
-- join the reconciliation gate walks.
-- =====================================================================

CREATE INDEX idx_points_band_occupancy_era      ON points_band_occupancy (era_code, field_size);
CREATE INDEX idx_venues_country                 ON venues (country_code);
CREATE INDEX idx_surfers_country                ON surfers (country_code);
CREATE INDEX idx_seasons_era                    ON seasons (era_code);
CREATE INDEX idx_seasons_champion               ON seasons (world_champion_surfer_id);
CREATE INDEX idx_events_venue                   ON events (venue_id);
CREATE INDEX idx_events_artefact                ON events (artefact_id);
CREATE INDEX idx_rounds_event                   ON rounds (event_id);
CREATE INDEX idx_heats_round                    ON heats (round_id);
CREATE INDEX idx_heat_entries_surfer            ON heat_entries (surfer_id);
CREATE INDEX idx_heat_entries_heat              ON heat_entries (heat_id);
CREATE INDEX idx_heat_entries_advanced_to       ON heat_entries (advanced_to_round_id);
CREATE INDEX idx_waves_heat_entry               ON waves (heat_entry_id);
CREATE INDEX idx_event_entries_surfer           ON event_entries (surfer_id);
CREATE INDEX idx_event_entries_event            ON event_entries (event_id);
CREATE INDEX idx_season_rankings_surfer         ON season_rankings (surfer_id);
CREATE INDEX idx_interferences_heat             ON interferences (heat_id);
CREATE INDEX idx_data_gaps_open                 ON data_gaps (scope, season_year) WHERE closed_at IS NULL;
CREATE INDEX idx_round_templates_era             ON round_templates (era_code, field_size);
CREATE INDEX idx_rto_advances_to                 ON round_template_outcomes (era_code, field_size, advances_to_round_order);


-- =====================================================================
-- 14. AUDIT VIEWS
--
-- Rule 2, made runnable. Each of these should return zero rows. None of
-- them is a tolerance — a row here means the parse, the band table or the
-- participation type is wrong, and all three are worth stopping for.
-- =====================================================================

-- The derived side of the points rule. Never written back to a column.
CREATE VIEW v_points_reconciliation AS
SELECT
  ee.id            AS event_entry_id,
  e.season_year,
  e.event_number,
  e.field_size,
  ee.surfer_id,
  ee.event_placing,
  ee.participation,
  ee.points_status,
  ee.points        AS points_published,
  CASE
    WHEN ee.participation = 'event_wildcard'  THEN NULL
    WHEN e.awards_ranking_points IS false     THEN NULL
    WHEN ee.event_placing IS NULL                   THEN NULL
    ELSE (
      SELECT pb.points
      FROM points_bands pb
      WHERE pb.era_code = s.era_code
        AND pb.position <= ee.event_placing
      ORDER BY pb.position DESC
      LIMIT 1
    )
  END AS points_derived
FROM event_entries ee
JOIN events  e ON e.id = ee.event_id
JOIN seasons s ON s.year = e.season_year;

COMMENT ON VIEW v_points_reconciliation IS
  'Published against derived, per event entry. The derived value is a pure function of event_placing, participation and points_bands and is deliberately not stored anywhere.';

CREATE VIEW v_points_disagreements AS
SELECT *
FROM v_points_reconciliation
WHERE points_status = 'published'
  AND points_derived IS DISTINCT FROM points_published;

COMMENT ON VIEW v_points_disagreements IS
  'Must be empty. A disagreement is a hard failure, not a preference — one of the parse, the band table or the participation type is wrong. Do not add a tolerance.';

-- The throwaway, both signals.
CREATE VIEW v_throwaway_disagreements AS
SELECT
  ee.id AS event_entry_id,
  e.season_year,
  e.event_number,
  ee.surfer_id,
  ee.throwaway_published,
  ee.throwaway_derived
FROM event_entries ee
JOIN events e ON e.id = ee.event_id
WHERE ee.throwaway_published IS NOT NULL
  AND ee.throwaway_derived   IS NOT NULL
  AND ee.throwaway_published IS DISTINCT FROM ee.throwaway_derived;

COMMENT ON VIEW v_throwaway_disagreements IS
  'Must be empty. Rows where only one of the two signals exists are excluded on purpose: they are not disagreements, they are gaps, and they belong in data_gaps.';

-- Heat total against the counting waves.
CREATE VIEW v_heat_total_agreement AS
SELECT
  he.id AS heat_entry_id,
  he.heat_id,
  he.surfer_id,
  he.heat_total,
  r.scoring_basis,
  r.counting_rides,
  SUM(w.score) FILTER (WHERE w.counted) AS counting_wave_sum,
  COUNT(*)     FILTER (WHERE w.counted) AS counting_wave_count
FROM heat_entries he
JOIN heats  h ON h.id = he.heat_id
JOIN rounds r ON r.id = h.round_id
LEFT JOIN waves w ON w.heat_entry_id = he.id
GROUP BY he.id, he.heat_id, he.surfer_id, he.heat_total, r.scoring_basis, r.counting_rides;

CREATE VIEW v_heat_total_disagreements AS
SELECT *
FROM v_heat_total_agreement
WHERE heat_total IS NOT NULL
  AND counting_wave_sum IS NOT NULL
  AND counting_wave_sum IS DISTINCT FROM heat_total;

COMMENT ON VIEW v_heat_total_disagreements IS
  'Expected to be empty, with one known caveat: interference penalties alter ride values, and whether WSL publishes pre- or post-penalty ride scores is unsettled (era_a.yaml, interference.todo). Settle it by counting mismatches across a full season rather than by adding a tolerance here.';

-- Band occupancy must cover the field exactly.
CREATE VIEW v_band_occupancy_check AS
SELECT
  era_code,
  field_size,
  SUM(band_width) AS covered,
  field_size - SUM(band_width) AS shortfall
FROM points_band_occupancy
GROUP BY era_code, field_size
HAVING SUM(band_width) <> field_size;

COMMENT ON VIEW v_band_occupancy_check IS
  'Must be empty. Era A pre-cut: 1+1+2+4+8+16+4 = 36. Post-cut: the 17th band narrows to 8 and there is no 33rd band, so 1+1+2+4+8+8 = 24. This view is why occupancy was split out of points_bands.';

-- The project's own bookkeeping, asserted rather than trusted.
CREATE VIEW v_pre_cut_count_check AS
SELECT
  s.year,
  s.pre_cut_event_count AS declared,
  COUNT(e.id) FILTER (WHERE e.occurs_after_cut IS false AND e.kind = 'regular') AS counted
FROM seasons s
LEFT JOIN events e ON e.season_year = s.year
GROUP BY s.year, s.pre_cut_event_count
HAVING s.pre_cut_event_count
       <> COUNT(e.id) FILTER (WHERE e.occurs_after_cut IS false AND e.kind = 'regular');

COMMENT ON VIEW v_pre_cut_count_check IS
  'Must be empty once a season''s events are loaded. P is stored on seasons because the throwaway rule needs it before events exist; this asserts the stored value against the events actually loaded.';

-- Provenance, M1 item 7. NOT NULL covers the read-fact tables; this
-- catches the tables where artefact_id is still nullable.
CREATE VIEW v_provenance_gaps AS
SELECT 'rounds'  AS table_name, r.id AS row_id FROM rounds  r WHERE r.artefact_id IS NULL
UNION ALL
SELECT 'heats',   h.id  FROM heats   h WHERE h.artefact_id IS NULL
UNION ALL
SELECT 'venues',  v.id  FROM venues  v WHERE v.artefact_id IS NULL
UNION ALL
SELECT 'surfers', sf.id FROM surfers sf WHERE sf.artefact_id IS NULL
UNION ALL
SELECT 'points_band_occupancy', NULL::bigint
FROM points_band_occupancy WHERE artefact_id IS NULL
UNION ALL
SELECT 'round_templates', NULL::bigint
FROM round_templates WHERE artefact_id IS NULL;

COMMENT ON VIEW v_provenance_gaps IS
  'Item 7 says a provenance column, not a promise. NOT NULL enforces it on events, heat_entries, waves, event_entries, points_bands and season_rankings. On the tables listed here artefact_id is still nullable — this view is the promise part, and every row it returns needs either an artefact or a data_gaps entry.';


-- ---------------------------------------------------------------------
-- Round structure templates: three checks.
--
-- The first is the important one. docs/findings/2026-07-29_rulebook_provenance.md §3
-- argues that the ASSUMED closing-round outcomes are actually forced —
-- "the finishing positions are forced by Appendix B's band widths against
-- the cohort sizes, uniquely". These views turn that argument into a
-- query. If the cohorts the template produces fill the Appendix B bands
-- exactly, the assumption is upgraded by arithmetic rather than asserted.
-- ---------------------------------------------------------------------

-- How many surfers the format sends to each finishing position.
CREATE VIEW v_round_template_cohorts AS
SELECT
  rt.era_code,
  rt.field_size,
  o.finishes_at_position AS position,
  SUM(rt.heat_count)     AS surfers_finishing
FROM round_templates rt
JOIN round_template_outcomes o
  ON  o.era_code    = rt.era_code
  AND o.field_size  = rt.field_size
  AND o.round_order = rt.round_order
WHERE o.finishes_at_position IS NOT NULL
  AND rt.outcome_basis = 'event_placing'
  AND rt.heat_count IS NOT NULL
GROUP BY rt.era_code, rt.field_size, o.finishes_at_position;

COMMENT ON VIEW v_round_template_cohorts IS
  'Era A pre-cut, worked through: Elimination Round placing 3 -> 4 heats -> 4 surfers finish 33rd; R/32 placing 2 -> 16 finish 17th; R/16 -> 8 finish 9th; QF -> 4 finish 5th; SF -> 2 finish 3rd; Final -> 1 second and 1 first. 4+16+8+4+2+1+1 = 36.';

-- Those cohorts must fill the Appendix B bands exactly.
CREATE VIEW v_round_template_band_disagreements AS
SELECT
  COALESCE(c.era_code, o.era_code)     AS era_code,
  COALESCE(c.field_size, o.field_size) AS field_size,
  COALESCE(c.position, o.position)     AS position,
  c.surfers_finishing                  AS from_round_structure,
  o.band_width                         AS from_points_table
FROM v_round_template_cohorts c
FULL OUTER JOIN points_band_occupancy o
  ON  o.era_code   = c.era_code
  AND o.field_size = c.field_size
  AND o.position   = c.position
WHERE c.surfers_finishing IS DISTINCT FROM o.band_width;

COMMENT ON VIEW v_round_template_band_disagreements IS
  'Must be empty. Two independently sourced things — the round structure from rulebook 1.06(a)/(b), the band widths from Appendix B — describing the same 36 or 24 surfers. A row here means one of them is wrong, and a FULL OUTER JOIN so that a band the structure never fills, or a cohort with no band to land in, both surface rather than silently dropping out.';

-- Surfers arriving in a round must fill its heats exactly.
CREATE VIEW v_round_template_flow_disagreements AS
SELECT
  rt.era_code,
  rt.field_size,
  rt.round_order,
  rt.name,
  rt.heat_count * rt.heat_size AS capacity,
  CASE WHEN rt.round_order = 1 THEN rt.field_size ELSE COALESCE((
    SELECT SUM(prev.heat_count)
    FROM round_template_outcomes o
    JOIN round_templates prev
      ON  prev.era_code    = o.era_code
      AND prev.field_size  = o.field_size
      AND prev.round_order = o.round_order
    WHERE o.era_code                = rt.era_code
      AND o.field_size              = rt.field_size
      AND o.advances_to_round_order = rt.round_order
  ), 0) END AS arriving
FROM round_templates rt
WHERE rt.outcome_basis = 'event_placing'
  AND rt.heat_count IS NOT NULL
  AND rt.heat_size  IS NOT NULL
  AND rt.heat_count * rt.heat_size IS DISTINCT FROM
      CASE WHEN rt.round_order = 1 THEN rt.field_size ELSE COALESCE((
        SELECT SUM(prev.heat_count)
        FROM round_template_outcomes o
        JOIN round_templates prev
          ON  prev.era_code    = o.era_code
          AND prev.field_size  = o.field_size
          AND prev.round_order = o.round_order
        WHERE o.era_code                = rt.era_code
          AND o.field_size              = rt.field_size
          AND o.advances_to_round_order = rt.round_order
      ), 0) END;

COMMENT ON VIEW v_round_template_flow_disagreements IS
  'Must be empty. This is era_a.yaml''s arithmetic_check as a query: 12 x 3 = 36 enter the Opening Round; 24 advance directly to the Round of 32 and 12 drop to the Elimination Round (4 x 3), of whom 8 advance; 24 + 8 = 32, so "Round of 32" is literal. The Finals are excluded because entry there is by seeding, not by progression.';

-- A round whose heat placings are not all accounted for.
CREATE VIEW v_round_template_outcome_gaps AS
SELECT
  rt.era_code,
  rt.field_size,
  rt.round_order,
  rt.name,
  rt.heat_size,
  COUNT(o.heat_placing) AS outcomes_defined
FROM round_templates rt
LEFT JOIN round_template_outcomes o
  ON  o.era_code    = rt.era_code
  AND o.field_size  = rt.field_size
  AND o.round_order = rt.round_order
GROUP BY rt.era_code, rt.field_size, rt.round_order, rt.name, rt.heat_size
HAVING rt.heat_size IS NULL
    OR COUNT(o.heat_placing) <> rt.heat_size;

COMMENT ON VIEW v_round_template_outcome_gaps IS
  'Every placing in a heat must lead somewhere — advance or finish. A round with fewer outcomes than heat_size has a hole in its format. Expected to be non-empty for the WSL Finals, whose loser-to-final-rank mapping is not stated in era_a.yaml and is deliberately not invented here. Silent absence is a failure; this is the absence, made loud.';

-- What an event actually had, against what the format says it should have.
CREATE VIEW v_round_structure_deviations AS
SELECT
  e.season_year,
  e.event_number,
  e.name AS event_name,
  e.field_size,
  r.round_order,
  r.name    AS observed_round,
  rt.name   AS expected_round,
  CASE
    WHEN rt.round_order IS NULL THEN 'round not in the format template'
    WHEN r.name IS DISTINCT FROM rt.name THEN 'round name differs from template'
  END AS deviation
FROM events e
JOIN seasons s ON s.year = e.season_year
JOIN rounds  r ON r.event_id = e.id
LEFT JOIN round_templates rt
  ON  rt.era_code    = s.era_code
  AND rt.field_size  = e.field_size
  AND rt.round_order = r.round_order
WHERE rt.round_order IS NULL
   OR r.name IS DISTINCT FROM rt.name;

COMMENT ON VIEW v_round_structure_deviations IS
  'Not required to be empty. The two Era A wave system events genuinely deviate — the 2023 Surf Ranch NS round is a 12-man leaderboard with no heats, the 2025 Abu Dhabi second round takes 24 surfers with heat count null — and both should appear here. What matters is that every row is a deviation someone has looked at. An ocean event appearing here is a parse failure.';


-- =====================================================================
-- 15. ROW LEVEL SECURITY
--
-- Supabase exposes every table in `public` through PostgREST. Enabling
-- RLS with no policies denies the anon and publishable-key roles
-- outright; SUPABASE_SECRET_KEY_V2 bypasses RLS and is what ingest uses.
-- Read policies get added in M3, when there is a frontend to read.
-- =====================================================================

ALTER TABLE artefacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE eras                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_bands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_band_occupancy ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues                ENABLE ROW LEVEL SECURITY;
ALTER TABLE surfers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds                ENABLE ROW LEVEL SECURITY;
ALTER TABLE heats                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE heat_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE waves                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_rankings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_gaps             ENABLE ROW LEVEL SECURITY;
ALTER TABLE interferences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_template_outcomes ENABLE ROW LEVEL SECURITY;

COMMIT;
