-- 00000000000019_predictions.sql
-- Forecasts, stored so they can be held to account (CLAUDE.md, "Predictions carry a hard
-- requirement"): every prediction keeps its timestamp, a snapshot of its inputs, its
-- probability or expected value, a plain-English explanation, and later the actual outcome.
--
-- Taryn's decision, 8 October 2026 (design thread): build forecasts in M4 rather than after
-- beta. This table exists before any forecast is shown, so nothing on the site predicts
-- without a row here.
--
-- Two models, both backtested before this file was written (scripts/backtest_forecasts.sql):
--   h2h_trim_logistic_v1  P(A beats B in a two-surfer heat) = 1 / (1 + exp(-k (TrimA - TrimB))),
--                         k = 0.4 fitted on 251 two-surfer heats in 2024, tested on 297 in
--                         2025: right 57.9% of the time (coin flip 50%), Brier 0.235 (0.250).
--   heat_total_trim_v1    expected heat total = Datum's expected score for the round + Trim.
--                         Trim before a heat correlates 0.20 with that heat's gap in 2025;
--                         typical miss (RMSE) 2.92 points against 2.98 for Datum alone.
-- Both rest on Datum and Trim fitted over the same two seasons, so the test is not fully
-- out of sample. The explanation column says so on every row.

BEGIN;

CREATE TABLE predictions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  made_at            timestamptz NOT NULL DEFAULT now(),
  model              text        NOT NULL,
  model_params       jsonb       NOT NULL,   -- coefficients, training set, backtest figures
  trim_model_run_id  bigint      NOT NULL REFERENCES trim_model_runs(id),
  kind               text        NOT NULL,
  surfer_id          bigint      NOT NULL REFERENCES surfers(id),
  opponent_id        bigint               REFERENCES surfers(id),
  round_name         text,
  inputs             jsonb       NOT NULL,   -- the exact values used, as they stood at made_at
  probability        numeric,               -- h2h: P(surfer beats opponent)
  expected_value     numeric,               -- heat_total: expected heat total
  interval_low       numeric,
  interval_high      numeric,
  explanation        text        NOT NULL,
  target_heat_id     bigint               REFERENCES heats(id),  -- set when the heat is drawn
  outcome            jsonb,
  resolved_at        timestamptz,
  CONSTRAINT predictions_kind_check CHECK (kind IN ('h2h', 'heat_total')),
  CONSTRAINT predictions_shape_check CHECK (
    (kind = 'h2h'        AND opponent_id IS NOT NULL AND probability BETWEEN 0 AND 1 AND expected_value IS NULL)
 OR (kind = 'heat_total' AND opponent_id IS NULL AND round_name IS NOT NULL AND expected_value IS NOT NULL AND probability IS NULL)),
  CONSTRAINT predictions_outcome_check CHECK ((outcome IS NULL) = (resolved_at IS NULL)),
  CONSTRAINT predictions_not_self CHECK (opponent_id IS NULL OR opponent_id <> surfer_id)
);

COMMENT ON TABLE predictions IS
  'Every forecast the site shows, kept as made. Append-only: once a row exists only target_heat_id, outcome and resolved_at may change, each from NULL exactly once. A prediction that cannot be checked later is worthless for credibility, so none is shown without a row here.';

-- Lock a prediction once made. Only the resolution fields may be filled, and only once.
CREATE FUNCTION predictions_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'predictions are append-only: row % cannot be deleted', OLD.id;
  END IF;
  IF (NEW.made_at, NEW.model, NEW.model_params, NEW.trim_model_run_id, NEW.kind, NEW.surfer_id,
      NEW.opponent_id, NEW.round_name, NEW.inputs, NEW.probability, NEW.expected_value,
      NEW.interval_low, NEW.interval_high, NEW.explanation)
     IS DISTINCT FROM
     (OLD.made_at, OLD.model, OLD.model_params, OLD.trim_model_run_id, OLD.kind, OLD.surfer_id,
      OLD.opponent_id, OLD.round_name, OLD.inputs, OLD.probability, OLD.expected_value,
      OLD.interval_low, OLD.interval_high, OLD.explanation) THEN
    RAISE EXCEPTION 'prediction % is locked: only target_heat_id, outcome and resolved_at may be set', OLD.id;
  END IF;
  IF OLD.target_heat_id IS NOT NULL AND NEW.target_heat_id IS DISTINCT FROM OLD.target_heat_id THEN
    RAISE EXCEPTION 'prediction % already has its target heat', OLD.id;
  END IF;
  IF OLD.outcome IS NOT NULL AND (NEW.outcome IS DISTINCT FROM OLD.outcome OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at) THEN
    RAISE EXCEPTION 'prediction % is already resolved', OLD.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER predictions_lock
  BEFORE UPDATE OR DELETE ON predictions
  FOR EACH ROW EXECUTE FUNCTION predictions_lock();

CREATE INDEX idx_predictions_surfer ON predictions (surfer_id, kind);

ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY predictions_public_read ON predictions FOR SELECT TO anon, authenticated USING (true);

COMMIT;
