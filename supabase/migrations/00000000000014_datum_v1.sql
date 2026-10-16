-- =====================================================================
-- 00000000000014_datum_v1.sql
--
-- M2 item 1: Datum. An expected score per surfer-heat, ridge-regularised.
--
-- WHAT DATUM V1 IS
--
-- A ridge on ROUND ALONE. Decision 26, closed 27 August 2026 on
-- measurement: break alone (RMSE 3.1330) and field alone (3.1367) score
-- WORSE out-of-sample than predicting the grand mean (3.1291), and
-- conditions help in-sample while hurting out-of-sample because they are
-- near-constant within an event and so proxy the event, not the weather.
-- Wave type is not published by the source at all.
--
-- This contradicts PROJECT_PLAN.md, which defines Datum as "the expected
-- score for a heat, given break, round, wave type, and field". Three of
-- the four are gone. The disagreement is recorded, not absorbed.
--
-- break (venue_id) and field_size are kept as STORED, UNUSED columns on
-- every Datum row so the input test can be re-run without a rebuild when
-- 2022-2023 land post-beta and every break has four seasons behind it.
--
-- THE ACCEPTANCE TEST IS ENFORCED HERE, NOT AUDITED AFTER THE FACT
--
-- Following migration 13's precedent. Decision 27 as signed off on
-- 27 August required Datum to beat both the intercept-only AND the
-- round-only baseline out-of-sample -- but decision 26 makes Datum a
-- ridge on round alone, and scripts/datum_input_check.py:144 defines the
-- round-only baseline as exactly that model. The two are identical, so
-- item 1 was UNSATISFIABLE AS WRITTEN. Found 28 August 2026; Taryn
-- resolved it the same day by dropping the round-only bar and replacing
-- it with a stability rider. Datum V1 is accepted when all three hold:
--
--   1. PRIMARY   beats intercept-only under grouped leave-one-event-out
--   2. SECONDARY the sign agrees under leave-one-season-out
--   3. MONOTONE  fitted round effects rise along the CT ladder
--
-- The CHECK constraints on datum_model_runs make a model that fails any
-- of the three impossible to store. A Datum that has not earned belief
-- cannot reach the database and then be explained away in a document.
--
-- ON THE TRAINABLE BASE: 1,843, NOT 1,668
--
-- The 27 August measurement restricted to entries carrying a break AND a
-- field size, because it was testing those inputs. Datum V1 uses neither,
-- so it trains on every entry with a published heat_total: 1,843 over 800
-- heats, 175 more (10.5%). The 1,668 filter existed to serve two dropped
-- predictors.
--
-- M2 item 7 (zero fabricated rows): every datum row carries the
-- heat_entry it was computed for, and heat_entries.artefact_id is NOT
-- NULL, so every Datum row is traceable to a retained artefact through
-- its entry. v_datum_provenance_gaps audits that and must return zero.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. THE MODEL RUN
-- ---------------------------------------------------------------------

CREATE TABLE datum_model_runs (
  id                   bigserial PRIMARY KEY,
  computed_on          date        NOT NULL,
  spec                 text        NOT NULL,
  lambda               numeric     NOT NULL,
  n_entries            integer     NOT NULL,
  n_events             integer     NOT NULL,
  n_rounds             integer     NOT NULL,
  rmse_loeo            numeric     NOT NULL,
  rmse_intercept_loeo  numeric     NOT NULL,
  r2_vs_intercept      numeric     NOT NULL,
  rmse_loso            numeric     NOT NULL,
  rmse_intercept_loso  numeric     NOT NULL,
  ladder_monotone      boolean     NOT NULL,
  cells_file           text        NOT NULL,
  script               text        NOT NULL,

  CONSTRAINT datum_run_primary_beats_intercept
    CHECK (rmse_loeo < rmse_intercept_loeo),
  CONSTRAINT datum_run_secondary_sign_agrees
    CHECK (rmse_loso < rmse_intercept_loso),
  CONSTRAINT datum_run_ladder_is_monotone
    CHECK (ladder_monotone),
  CONSTRAINT datum_run_entries_positive
    CHECK (n_entries > 0),
  -- A second apply of the seed would otherwise insert a second run and a
  -- second 1,843 datum rows, and every count downstream would silently
  -- double. Fail loudly instead.
  CONSTRAINT datum_run_is_unique_per_spec_and_day
    UNIQUE (computed_on, spec)
);

COMMENT ON TABLE datum_model_runs IS
  'One row per Datum computation. The three CHECK constraints ARE decision 27''s acceptance test as amended 28 August 2026: a model that fails the primary, the secondary or the monotonicity gate cannot be stored at all. Enforced rather than audited, following migration 13.';
COMMENT ON COLUMN datum_model_runs.spec IS
  'The feature set. ''round'' for V1. Decision 26 dropped break, field and wave type on measurement; the column exists so a later spec is distinguishable rather than silently replacing this one.';
COMMENT ON COLUMN datum_model_runs.lambda IS
  'Ridge penalty, chosen by leave-one-event-out CV over the whole set. Never chosen on a fold being scored.';
COMMENT ON COLUMN datum_model_runs.n_entries IS
  'Entries the run was computed over. Stated because this project does not cite a verdict without the population it was computed on.';
COMMENT ON COLUMN datum_model_runs.rmse_loeo IS
  'Out-of-sample RMSE under grouped leave-one-event-out. The fold boundary is the EVENT, not the heat: break and conditions are event-level, so a heat-level split puts the same event on both sides and returns a flattering, wrong score.';
COMMENT ON COLUMN datum_model_runs.rmse_loso IS
  'Secondary check, leave-one-season-out. Kept because it is closer to the real forecasting task, and because a result that disagrees between the two designs is itself the finding -- as it was for decision 26.';
COMMENT ON COLUMN datum_model_runs.ladder_monotone IS
  'Whether fitted round effects rise along the CT ladder (Opening -> Final). A Datum that ranks the Final below the Opening Round has not earned belief whatever its RMSE. The four WSL Finals rounds are a five-surfer structure, not a rung on this ladder, and are excluded from the assertion.';

-- ---------------------------------------------------------------------
-- 2. THE FITTED EFFECTS -- the model, readable by eye
-- ---------------------------------------------------------------------

CREATE TABLE datum_round_effects (
  id             bigserial PRIMARY KEY,
  model_run_id   bigint       NOT NULL REFERENCES datum_model_runs(id),
  round_name     text         NOT NULL,
  expected_score numeric(7,4) NOT NULL,
  n_entries      integer      NOT NULL,
  on_ladder      boolean      NOT NULL,
  UNIQUE (model_run_id, round_name),
  CONSTRAINT datum_effect_in_scoring_range
    CHECK (expected_score >= 0 AND expected_score <= 20)
);

COMMENT ON TABLE datum_round_effects IS
  'The whole of Datum V1: twelve numbers. Stored as rows rather than as coefficients so the model can be read, diffed and argued with without running anything.';
COMMENT ON COLUMN datum_round_effects.on_ladder IS
  'TRUE for the eight championship-tour rounds whose order the monotonicity gate asserts. FALSE for the four WSL Finals rounds, whose fitted values are reported but not asserted.';
COMMENT ON CONSTRAINT datum_effect_in_scoring_range ON datum_round_effects IS
  'All 138 rounds share one scoring basis: best two rides, max 20. An expected score outside [0,20] would mean the target was misread.';

-- ---------------------------------------------------------------------
-- 3. DATUM -- one row per surfer-heat
-- ---------------------------------------------------------------------

CREATE TABLE datum (
  id                bigserial PRIMARY KEY,
  model_run_id      bigint       NOT NULL REFERENCES datum_model_runs(id),
  heat_entry_id     bigint       NOT NULL REFERENCES heat_entries(id),
  heat_id           bigint       NOT NULL REFERENCES heats(id),
  round_id          bigint       NOT NULL REFERENCES rounds(id),
  surfer_id         bigint       NOT NULL REFERENCES surfers(id),
  expected_score    numeric(7,4) NOT NULL,
  actual_heat_total numeric(7,4) NOT NULL,
  residual          numeric(7,4) NOT NULL,
  venue_id          bigint       REFERENCES venues(id),
  field_size        integer,

  UNIQUE (model_run_id, heat_entry_id),
  CONSTRAINT datum_residual_is_consistent
    CHECK (residual = actual_heat_total - expected_score)
);

CREATE INDEX datum_surfer_idx ON datum (surfer_id);
CREATE INDEX datum_heat_idx   ON datum (heat_id);
CREATE INDEX datum_run_idx    ON datum (model_run_id);

COMMENT ON TABLE datum IS
  'One row per surfer-heat: what Datum expected, what was actually scored, and the gap. Trim (item 2) is the exponentially-weighted accumulation of the residual column, keyed by surfer and the heat it was computed after.';
COMMENT ON COLUMN datum.residual IS
  'actual_heat_total - expected_score. Positive means the surfer beat the round''s expectation. This is Trim''s input; the CHECK makes it impossible to store a residual that does not follow from the two columns beside it.';
COMMENT ON COLUMN datum.venue_id IS
  'STORED, UNUSED. The break this heat was surfed at (heats.venue_id, NOT events.venue_id). Dropped as a Datum input by decision 26 and retained so the test can be re-run when 2022-2023 land. NULL for the 88 heats holding no retained popup -- recorded, not silent, and listed by v_heat_venue_gaps.';
COMMENT ON COLUMN datum.field_size IS
  'STORED, UNUSED. Same reason as venue_id. Field alone scored worse than the grand mean out-of-sample.';

-- ---------------------------------------------------------------------
-- 4. AUDIT VIEWS -- all three must return zero rows
-- ---------------------------------------------------------------------

CREATE VIEW v_datum_provenance_gaps AS
  SELECT d.id AS datum_id, d.heat_entry_id
  FROM datum d
  JOIN heat_entries he ON he.id = d.heat_entry_id
  WHERE he.artefact_id IS NULL;

CREATE VIEW v_datum_effect_disagreements AS
  SELECT d.id AS datum_id, d.expected_score AS on_datum_row,
         e.expected_score AS on_effect_row, r.name AS round_name
  FROM datum d
  JOIN rounds r              ON r.id = d.round_id
  JOIN datum_round_effects e ON e.model_run_id = d.model_run_id
                            AND e.round_name   = r.name
  WHERE d.expected_score <> e.expected_score;

CREATE VIEW v_datum_coverage AS
  SELECT mr.id AS model_run_id,
         mr.n_entries                          AS claimed_entries,
         (SELECT count(*) FROM datum d WHERE d.model_run_id = mr.id) AS stored_rows,
         (SELECT count(*) FROM heat_entries WHERE heat_total IS NOT NULL) AS eligible_entries
  FROM datum_model_runs mr;

ALTER VIEW v_datum_provenance_gaps     SET (security_invoker = on);
ALTER VIEW v_datum_effect_disagreements SET (security_invoker = on);
ALTER VIEW v_datum_coverage            SET (security_invoker = on);

COMMENT ON VIEW v_datum_provenance_gaps IS
  'M2 item 7. Datum rows whose heat_entry carries no artefact. heat_entries.artefact_id is NOT NULL, so this returns zero by construction -- it exists so the guarantee is queryable rather than argued from the schema. State the row count it was computed over when citing it.';
COMMENT ON VIEW v_datum_effect_disagreements IS
  'Datum rows whose stored expected_score does not match the fitted effect for their round. Catches a seed that drifted from the model that produced it.';
COMMENT ON VIEW v_datum_coverage IS
  'Claimed entries against stored rows against eligible entries. All three should read 1843 for the V1 run. A gap between stored and eligible means Datum silently skipped entries.';

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY -- as migration 1, section 15
-- ---------------------------------------------------------------------

ALTER TABLE datum_model_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE datum_round_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE datum               ENABLE ROW LEVEL SECURITY;

INSERT INTO public.schema_migrations (version) VALUES
  ('00000000000014_datum_v1.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
