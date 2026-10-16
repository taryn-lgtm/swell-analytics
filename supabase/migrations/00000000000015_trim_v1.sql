-- =====================================================================
-- 00000000000015_trim_v1.sql
--
-- M2 items 2 and 3: Trim. The exponentially-weighted accumulation of a
-- surfer's deviation from Datum, stored append-only, keyed by the surfer
-- and the heat it was computed after.
--
-- WHAT TRIM V1 IS
--
--   trim_after(i) = alpha * residual(i) + (1 - alpha) * trim_after(i-1)
--   trim_after(0) = 0                                     -- the prior
--
-- residual is datum.residual: actual heat total minus what Datum expected
-- of that round. Positive Trim means the surfer has been beating the
-- round's expectation. The unit is points per heat on the 0-20 scale,
-- not an index -- a Trim of +1.5 says "about a point and a half above
-- what the round predicts, per heat".
--
-- THE PRIOR IS ZERO, AND IT IS THE WHOLE OF ITEM 4 THAT CAN BE HONOURED
--
-- Every surfer starts at 0: exactly average for the rounds they surf.
-- After n heats the prior still carries weight (1-alpha)^n -- 0.5 at
-- fifteen heats, 0.31 at twenty-five. That shrinkage is what stops a
-- rookie's first three heats producing nonsense, and it needs no rookie
-- flag to work.
--
-- It is NOT the whole of item 4. Item 4 asks that rookies and wildcards
-- carry an explicit prior; this gives EVERY surfer the same explicit
-- prior because event_entries holds 0 rows, so no rookie or wildcard can
-- be identified from the database at all (decision 37). A prior that
-- cannot be varied by entry status is a weaker claim than item 4 makes.
-- Recorded here rather than left for a reader to discover.
--
-- HALF-LIFE 15 HEATS, AND THE DECAY EARNS ALMOST NOTHING
--
-- Chosen by walk-forward measurement over 1,770 scored entries, 31 August
-- 2026 (supabase/checks/trim_v1_selection.sql). Each prediction uses only
-- the surfer's strictly earlier heats, so there is no leakage in the time
-- direction.
--
--   predicting zero                     RMSE 2.9675
--   Trim, half-life 15 heats            RMSE 2.9101   <- V1
--   undecayed mean of prior residuals   RMSE 3.0694
--   SHRUNK undecayed mean, prior n=12   RMSE 2.9125
--
-- Trim beats the no-information baseline by 1.9%. But the third and
-- fourth lines are the finding: the undecayed mean is only worse because
-- it is UNSHRUNK, and once it is shrunk by the same amount it matches
-- Trim to 0.0024 RMSE. Paired over the same 1,770 entries the difference
-- is 0.0140 in mean squared error with a standard error of 0.0261 --
-- t = 0.54. Nearly all of Trim's skill is the prior, not the recency
-- weighting.
--
-- The half-life is not identified either. The curve is flat from about
-- 10 to 25 heats, and the optimum MOVES BETWEEN SEASONS: 12 heats on
-- 2024, 20 on 2025. Decision 26 established that a result whose sign
-- flips with the fold design is not evidence for the inputs; the same
-- reading applies here. 15 is the whole-set optimum, not a measurement
-- the data can support to better than "somewhere between 10 and 25".
--
-- PROJECT_PLAN.md specifies EWMA decay. This migration implements it and
-- records that on two seasons the decay cannot be shown to earn its
-- place. The plan is not edited here -- that is Taryn's file.
--
-- APPEND-ONLY IS ENFORCED BY TRIGGER, NOT BY CONVENTION
--
-- PROJECT_PLAN.md: "Never a current-value column. Without the history
-- there is no timeline, and the timeline sparkline is the site's
-- signature component." So there is no current_trim on surfers. The
-- ranked table is v_trim_current, a VIEW over the last row per surfer --
-- derived, never stored. Decision 24 is the standing argument for that
-- shape: a derived fact stored as a recorded one is what made two
-- earlier defects possible.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. THE MODEL RUN
-- ---------------------------------------------------------------------

CREATE TABLE trim_model_runs (
  id                    bigserial PRIMARY KEY,
  computed_on           date          NOT NULL,
  spec                  text          NOT NULL,
  datum_model_run_id    bigint        NOT NULL REFERENCES datum_model_runs(id),
  half_life_heats       numeric(6,2)  NOT NULL,
  alpha                 numeric(14,12) NOT NULL,
  prior                 numeric(7,4)  NOT NULL,
  n_entries             integer       NOT NULL,
  n_surfers             integer       NOT NULL,
  n_scored              integer       NOT NULL,
  rmse_walkforward      numeric       NOT NULL,
  rmse_predict_zero     numeric       NOT NULL,
  rmse_shrunk_flat_mean numeric       NOT NULL,
  paired_t_vs_shrunk    numeric       NOT NULL,
  ordering              text          NOT NULL,
  selection_file        text          NOT NULL,

  CONSTRAINT trim_run_beats_no_information
    CHECK (rmse_walkforward < rmse_predict_zero),
  CONSTRAINT trim_run_alpha_in_unit_interval
    CHECK (alpha > 0 AND alpha < 1),
  CONSTRAINT trim_run_half_life_positive
    CHECK (half_life_heats > 0),
  CONSTRAINT trim_run_entries_positive
    CHECK (n_entries > 0 AND n_scored > 0 AND n_scored < n_entries),
  CONSTRAINT trim_run_is_unique_per_spec_and_day
    UNIQUE (computed_on, spec)
);

COMMENT ON TABLE trim_model_runs IS
  'One row per Trim computation. The gate is deliberately ONE test, not three: Trim must beat predicting zero out-of-sample under walk-forward scoring. It is not asked to beat the shrunk undecayed mean, because on two seasons it cannot -- see paired_t_vs_shrunk. Writing an unpassable gate is the mistake decision 27 made and 28 August had to unpick.';
COMMENT ON COLUMN trim_model_runs.datum_model_run_id IS
  'The Datum run whose residuals this Trim was accumulated from. Trim is meaningless without it: a residual is only defined relative to a fitted expectation, and re-fitting Datum changes every Trim value downstream.';
COMMENT ON COLUMN trim_model_runs.half_life_heats IS
  'Heats after which a residual carries half its original weight. 15 for V1, the whole-set walk-forward optimum -- but the curve is flat from 10 to 25 and the per-season optima are 12 (2024) and 20 (2025), so this figure is not identified to better than a range.';
COMMENT ON COLUMN trim_model_runs.alpha IS
  '1 - 0.5^(1/half_life_heats), stored to twelve places so the seed''s recursion and this row cannot disagree about what was computed.';
COMMENT ON COLUMN trim_model_runs.prior IS
  'The value every surfer starts at. Zero: exactly average for the rounds they surf. This is item 4''s explicit prior, applied uniformly because entry status is unavailable (decision 37).';
COMMENT ON COLUMN trim_model_runs.n_scored IS
  'Entries the walk-forward RMSE was computed over: 1,770, being 1,843 less the 73 first heats, which have no prior heat to predict from. Stated because this project does not cite a verdict without the population it was computed on.';
COMMENT ON COLUMN trim_model_runs.rmse_shrunk_flat_mean IS
  'The honest competitor: the mean of prior residuals shrunk toward zero with a prior count of 12, no decay at all. It scores 2.9125 against Trim''s 2.9101. Stored so the weakness of the decay claim travels with the model rather than living only in a findings file.';
COMMENT ON COLUMN trim_model_runs.paired_t_vs_shrunk IS
  'Paired t-statistic on squared error, Trim against the shrunk undecayed mean, over the same 1,770 entries. 0.537. The decay is not distinguishable from no decay on two seasons.';
COMMENT ON COLUMN trim_model_runs.ordering IS
  'The total order the recursion walks. Corroborated 31 August: event_number agrees with start_date on 22 of 22 events, rounds.round_order agrees with the competitive ladder on all 138 rounds, and no surfer appears twice in one round. heat_entries.advanced_to_round_id would have been a fourth check and is NULL on all 1,852 rows, so it corroborates nothing -- noted because a check that inspects zero rows must not be cited as though it passed.';

-- ---------------------------------------------------------------------
-- 2. TRIM -- one row per surfer-heat, append-only
-- ---------------------------------------------------------------------

CREATE TABLE trim (
  id                bigserial PRIMARY KEY,
  model_run_id      bigint       NOT NULL REFERENCES trim_model_runs(id),
  surfer_id         bigint       NOT NULL REFERENCES surfers(id),
  heat_id           bigint       NOT NULL REFERENCES heats(id),
  heat_entry_id     bigint       NOT NULL REFERENCES heat_entries(id),
  datum_id          bigint       NOT NULL REFERENCES datum(id),
  seq               integer      NOT NULL,
  season_year       integer      NOT NULL,
  event_number      integer      NOT NULL,
  round_order       integer      NOT NULL,
  heat_number       integer      NOT NULL,
  residual          numeric(9,6) NOT NULL,
  trim_before       numeric(9,6) NOT NULL,
  trim_after        numeric(9,6) NOT NULL,
  prior_weight      numeric(9,8) NOT NULL,

  UNIQUE (model_run_id, heat_entry_id),
  UNIQUE (model_run_id, surfer_id, seq),
  CONSTRAINT trim_seq_starts_at_one CHECK (seq >= 1),
  CONSTRAINT trim_in_plausible_range CHECK (trim_after BETWEEN -20 AND 20),
  CONSTRAINT trim_prior_weight_is_a_weight CHECK (prior_weight > 0 AND prior_weight <= 1)
);

CREATE INDEX trim_surfer_seq_idx ON trim (surfer_id, seq);
CREATE INDEX trim_run_idx        ON trim (model_run_id);
CREATE INDEX trim_heat_idx       ON trim (heat_id);

COMMENT ON TABLE trim IS
  'Item 3. One row per surfer per heat, carrying Trim as it stood BEFORE the heat and AFTER it. Append-only, enforced by trigger below. The row is keyed by the heat it was computed after, so the timeline is the table read in seq order and needs no reconstruction.';
COMMENT ON COLUMN trim.seq IS
  'The surfer''s heat number in career order across the loaded seasons, 1-based. Not a WSL figure; derived from (season_year, event_number, round_order, heat_number) and stored so the order the recursion used is inspectable rather than re-derived by every reader.';
COMMENT ON COLUMN trim.trim_before IS
  'Trim as it stood going into this heat -- trim_after of the previous row, or the prior (0) at seq 1. This is the column a pre-heat preview would read, and the one the walk-forward test scored: it contains nothing from this heat.';
COMMENT ON COLUMN trim.prior_weight IS
  '(1-alpha)^seq: how much of this row''s trim_after is still the starting prior rather than the surfer''s own record. 0.5 at fifteen heats. Stored so a reader can see at a glance that a five-heat wildcard''s Trim is three-quarters prior, without recomputing anything.';
COMMENT ON CONSTRAINT trim_in_plausible_range ON trim IS
  'Trim is a weighted mean of residuals and every residual lies within the 0-20 scoring range, so |Trim| can never approach 20. A value outside this means the recursion or the ordering went wrong, not that a surfer had a remarkable season.';

-- ---------------------------------------------------------------------
-- 3. APPEND-ONLY -- enforced, not asserted
-- ---------------------------------------------------------------------

CREATE FUNCTION trim_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'trim is append-only (M2 item 3): % refused. To revise Trim, insert a new trim_model_runs row and a new set of trim rows; never edit history in place.',
    TG_OP;
END;
$$;

CREATE TRIGGER trim_no_update BEFORE UPDATE ON trim
  FOR EACH STATEMENT EXECUTE FUNCTION trim_is_append_only();
CREATE TRIGGER trim_no_delete BEFORE DELETE ON trim
  FOR EACH STATEMENT EXECUTE FUNCTION trim_is_append_only();

COMMENT ON FUNCTION trim_is_append_only() IS
  'Item 3''s append-only guarantee, enforced at the table. LIMIT, stated rather than glossed: a role that can ALTER TABLE can disable these triggers, so this stops accident and ordinary application code, not a determined superuser. It is a stronger guarantee than a comment and a weaker one than a permission model.';

-- ---------------------------------------------------------------------
-- 4. THE RANKED TABLE -- a view, never a stored current value
-- ---------------------------------------------------------------------

CREATE VIEW v_trim_current AS
  SELECT DISTINCT ON (t.surfer_id)
         t.surfer_id,
         s.full_name,
         s.slug,
         s.country_code,
         t.trim_after      AS trim,
         t.seq             AS n_heats,
         t.prior_weight,
         t.season_year     AS last_season,
         t.model_run_id
  FROM trim t
  JOIN surfers s ON s.id = t.surfer_id
  ORDER BY t.surfer_id, t.model_run_id DESC, t.seq DESC;

COMMENT ON VIEW v_trim_current IS
  'M2 item 6''s ranked table: the latest Trim per surfer, derived from the append-only history rather than stored beside it. NO MINIMUM-HEATS THRESHOLD IS APPLIED HERE -- item 5 asks for one to be stated and applied, and it has not been signed off. n_heats and prior_weight are exposed so a caller can apply one; 38 of 73 surfers reach 16 heats, the point at which a surfer''s own record outweighs the starting prior.';

-- ---------------------------------------------------------------------
-- 5. AUDIT VIEWS -- all four must return zero rows
-- ---------------------------------------------------------------------

CREATE VIEW v_trim_provenance_gaps AS
  SELECT t.id AS trim_id, t.heat_entry_id
  FROM trim t
  JOIN heat_entries he ON he.id = t.heat_entry_id
  WHERE he.artefact_id IS NULL;

CREATE VIEW v_trim_recursion_breaks AS
  SELECT t.id AS trim_id, t.surfer_id, t.seq,
         t.trim_before, prev.trim_after AS previous_trim_after
  FROM trim t
  LEFT JOIN trim prev ON prev.model_run_id = t.model_run_id
                     AND prev.surfer_id    = t.surfer_id
                     AND prev.seq          = t.seq - 1
  JOIN trim_model_runs mr ON mr.id = t.model_run_id
  WHERE (t.seq = 1 AND t.trim_before <> mr.prior)
     OR (t.seq > 1 AND (prev.trim_after IS NULL
                        OR abs(t.trim_before - prev.trim_after) > 0.000001));

CREATE VIEW v_trim_step_disagreements AS
  SELECT t.id AS trim_id, t.surfer_id, t.seq, t.trim_after,
         (mr.alpha * t.residual + (1 - mr.alpha) * t.trim_before) AS recomputed
  FROM trim t
  JOIN trim_model_runs mr ON mr.id = t.model_run_id
  WHERE abs(t.trim_after - (mr.alpha * t.residual + (1 - mr.alpha) * t.trim_before)) > 0.000005;

CREATE VIEW v_trim_coverage AS
  SELECT mr.id AS model_run_id,
         mr.n_entries AS claimed_entries,
         (SELECT count(*) FROM trim t WHERE t.model_run_id = mr.id) AS stored_rows,
         (SELECT count(*) FROM datum d WHERE d.model_run_id = mr.datum_model_run_id) AS datum_rows,
         (SELECT count(*) FROM heat_entries WHERE heat_total IS NULL) AS entries_with_no_total
  FROM trim_model_runs mr;

ALTER VIEW v_trim_current            SET (security_invoker = on);
ALTER VIEW v_trim_provenance_gaps    SET (security_invoker = on);
ALTER VIEW v_trim_recursion_breaks   SET (security_invoker = on);
ALTER VIEW v_trim_step_disagreements SET (security_invoker = on);
ALTER VIEW v_trim_coverage           SET (security_invoker = on);

COMMENT ON VIEW v_trim_provenance_gaps IS
  'M2 item 7. Trim rows whose heat_entry carries no artefact. Zero by construction, since heat_entries.artefact_id is NOT NULL; it exists so the guarantee is queryable rather than argued from the schema. State the row count it was computed over when citing it.';
COMMENT ON VIEW v_trim_recursion_breaks IS
  'Rows whose trim_before is not the previous row''s trim_after -- a broken or reordered chain. Checks the SEQUENCE. Distinct from v_trim_step_disagreements, which checks the ARITHMETIC of one step; a chain can be intact with every step wrong, and vice versa.';
COMMENT ON VIEW v_trim_step_disagreements IS
  'Rows where alpha*residual + (1-alpha)*trim_before does not reproduce the stored trim_after. Re-derives the whole model from three stored columns, so a seed that drifted from its stated alpha is caught by the database rather than by trust.';
COMMENT ON VIEW v_trim_coverage IS
  'Claimed against stored against the Datum rows Trim was accumulated from. All three should read 1843. entries_with_no_total is the fourth column for a reason: 9 heat entries carry no published heat_total, so they have no Datum row and therefore no Trim row. 1843 + 9 = 1852, the whole of heat_entries. Trim skips them rather than counting them as zero -- a heat with no published total is an unmeasured heat, not a scoreless one.';

-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY -- as migration 1, section 15
-- ---------------------------------------------------------------------

ALTER TABLE trim_model_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trim            ENABLE ROW LEVEL SECURITY;

INSERT INTO public.schema_migrations (version) VALUES
  ('00000000000015_trim_v1.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
