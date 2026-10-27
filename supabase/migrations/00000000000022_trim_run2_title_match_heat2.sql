-- =====================================================================
-- 00000000000022_trim_run2_title_match_heat2.sql
-- Trim run 2: the 2024 Title Match Heat 2 scored against Datum V1
-- =====================================================================
--
-- Depends on: 00000000000021 (the heat and its two entries), Datum V1
--             (datum_model_runs computed_on 2026-08-28, spec 'round') and
--             Trim V1 (trim_model_runs computed_on 2026-08-31).
-- Target:     v2, ref tjwqskjsyluxepdbwjet. Rule 6: Taryn applies this,
--             straight after migration 21.
--
-- OPTION A, chosen by Taryn 17 October 2026: keep Datum V1, no refit.
--   A refit on 1,845 entries passes its gates but moves lambda from 3 to 1
--   and every round effect with it (docs/findings/2026-10-17_title_match_heat2.md).
--   So Datum is NOT recomputed: its twelve effects stand.
--
-- WHAT THIS DOES
--   1. Datum rows for the two new entries, scored with Datum V1's stored
--      Title Match effect (13.3182). They join run 1 because run 1's model
--      is what scores them. datum_model_runs.n_entries stays 1,843: that is
--      the population the effects were FITTED on, and it does not change.
--      v_datum_coverage will read claimed 1,843 / stored 1,845 / eligible
--      1,845 -- the 2 are scored, not fitted, and that gap is the record of it.
--   2. Trim run 2: the same recursion, alpha, prior and ordering as run 1
--      (supabase/seeds/trim_v1.sql), walked over all 1,845 Datum V1 rows.
--      trim is append-only, so this is a new run, never an edit to run 1;
--      v_trim_current reads the latest run per surfer. The run's walk-forward
--      figures are computed HERE, from the rows it describes, with the exact
--      definitions of supabase/checks/trim_v1_selection.sql queries 1-3.
--   3. Assertions: JJF ends at 1.790 and Italo at 1.219; every Trim value of
--      every other surfer is identical in run 2 and run 1; both chains break
--      only at the new heat; the audit views read zero.
--
-- computed_on is fixed at 2026-10-17 rather than CURRENT_DATE so a re-run is
-- a no-op on the (computed_on, spec) key instead of a third run.
-- Idempotent: every insert is ON CONFLICT DO NOTHING; a second run changes
-- nothing and its assertions still pass.
-- =====================================================================

BEGIN;

-- --- preflight -------------------------------------------------------
DO $$
DECLARE n_entries int; n_datum_run int; n_trim_run int;
BEGIN
  SELECT count(*) INTO n_entries FROM heat_entries he JOIN heats h ON h.id = he.heat_id
    WHERE h.wsl_heat_id = '102842' AND he.heat_total IS NOT NULL;
  SELECT count(*) INTO n_datum_run FROM datum_model_runs WHERE computed_on = '2026-08-28' AND spec = 'round';
  SELECT count(*) INTO n_trim_run  FROM trim_model_runs  WHERE computed_on = '2026-08-31' AND spec = 'ewma_residual_hl15';
  IF n_entries <> 2 THEN RAISE EXCEPTION 'heat 102842 has % entries with a total; apply migration 21 first', n_entries; END IF;
  IF n_datum_run <> 1 OR n_trim_run <> 1 THEN
    RAISE EXCEPTION 'Datum V1 (%) or Trim V1 (%) run not found', n_datum_run, n_trim_run;
  END IF;
END $$;

-- --- 1. Datum rows for the two new entries -----------------------------
-- Exactly as supabase/seeds/datum_v1.sql writes a row, restricted to entries
-- that run 1 has not scored yet.
INSERT INTO datum (
  model_run_id, heat_entry_id, heat_id, round_id, surfer_id,
  expected_score, actual_heat_total, residual, venue_id, field_size)
SELECT eff.model_run_id, he.id, h.id, r.id, he.surfer_id,
       eff.expected_score,
       he.heat_total::numeric(7,4),
       (he.heat_total::numeric(7,4) - eff.expected_score)::numeric(7,4),
       h.venue_id, e.field_size
FROM heat_entries he
JOIN heats  h ON h.id = he.heat_id
JOIN rounds r ON r.id = h.round_id
JOIN events e ON e.id = r.event_id
JOIN datum_model_runs dmr ON dmr.computed_on = '2026-08-28' AND dmr.spec = 'round'
JOIN datum_round_effects eff ON eff.model_run_id = dmr.id AND eff.round_name = r.name
WHERE he.heat_total IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM datum d WHERE d.model_run_id = dmr.id AND d.heat_entry_id = he.id)
ON CONFLICT (model_run_id, heat_entry_id) DO NOTHING;

-- --- 2a. The run, its figures computed from the rows it covers -------------
WITH dmr AS (
  SELECT id FROM datum_model_runs WHERE computed_on = '2026-08-28' AND spec = 'round'
),
ord AS (
  SELECT d.surfer_id, d.residual::float8 r,
         row_number() OVER (PARTITION BY d.surfer_id
           ORDER BY e.season_year, e.event_number, rd.round_order, h.heat_number) seq
  FROM datum d
  JOIN dmr ON dmr.id = d.model_run_id
  JOIN heats h   ON h.id  = d.heat_id
  JOIN rounds rd ON rd.id = h.round_id
  JOIN events e  ON e.id  = rd.event_id
),
a AS (SELECT 1 - power(0.5, 1.0/15.0) alpha),
calc AS (
  SELECT o.*,
         a.alpha * power(1-a.alpha, o.seq)
           * sum(o.r * power(1-a.alpha, -o.seq)) OVER (PARTITION BY o.surfer_id ORDER BY o.seq) t_incl,
         sum(o.r) OVER (PARTITION BY o.surfer_id ORDER BY o.seq
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) sum_before,
         (o.seq - 1)::float8 n_before
  FROM ord o CROSS JOIN a
),
l AS (SELECT *, lag(t_incl) OVER (PARTITION BY surfer_id ORDER BY seq) trim_before FROM calc),
m AS (
  SELECT (SELECT count(*) FROM ord) n_entries,
         (SELECT count(DISTINCT surfer_id) FROM ord) n_surfers,
         count(*) n_scored,
         round(sqrt(avg(power(r - trim_before, 2)))::numeric, 4) rmse_walkforward,
         round(sqrt(avg(r*r))::numeric, 4) rmse_predict_zero,
         round(sqrt(avg(power(r - sum_before/(n_before + 12.0), 2)))::numeric, 4) rmse_shrunk_flat_mean,
         round((avg(power(r - sum_before/(n_before + 12.0), 2) - power(r - trim_before, 2))
                / (stddev_samp(power(r - sum_before/(n_before + 12.0), 2) - power(r - trim_before, 2))
                   / sqrt(count(*))))::numeric, 3) paired_t_vs_shrunk
  FROM l WHERE trim_before IS NOT NULL
)
INSERT INTO trim_model_runs (
  computed_on, spec, datum_model_run_id, half_life_heats, alpha, prior,
  n_entries, n_surfers, n_scored,
  rmse_walkforward, rmse_predict_zero, rmse_shrunk_flat_mean,
  paired_t_vs_shrunk, ordering, selection_file)
SELECT '2026-10-17', 'ewma_residual_hl15', dmr.id, 15, 0.045158396090, 0.0000,
       m.n_entries, m.n_surfers, m.n_scored,
       m.rmse_walkforward, m.rmse_predict_zero, m.rmse_shrunk_flat_mean,
       m.paired_t_vs_shrunk,
       'season_year, event_number, rounds.round_order, heats.heat_number',
       'supabase/migrations/00000000000022_trim_run2_title_match_heat2.sql (definitions: supabase/checks/trim_v1_selection.sql)'
FROM dmr CROSS JOIN m
ON CONFLICT (computed_on, spec) DO NOTHING;

-- --- 2b. The recursion -- supabase/seeds/trim_v1.sql, pointed at run 2 ------
WITH RECURSIVE run AS (
  SELECT id, alpha, prior FROM trim_model_runs
  WHERE computed_on = '2026-10-17' AND spec = 'ewma_residual_hl15'
),
ord AS (
  SELECT d.id AS datum_id, d.heat_entry_id, d.heat_id, d.surfer_id, d.residual,
         e.season_year, e.event_number, rd.round_order, h.heat_number,
         row_number() OVER (PARTITION BY d.surfer_id
                            ORDER BY e.season_year, e.event_number,
                                     rd.round_order, h.heat_number) AS seq
  FROM datum d
  JOIN datum_model_runs dmr ON dmr.id = d.model_run_id
  JOIN heats  h  ON h.id  = d.heat_id
  JOIN rounds rd ON rd.id = h.round_id
  JOIN events e  ON e.id  = rd.event_id
  WHERE dmr.computed_on = '2026-08-28' AND dmr.spec = 'round'
),
chain AS (
  SELECT o.datum_id, o.heat_entry_id, o.heat_id, o.surfer_id, o.residual,
         o.season_year, o.event_number, o.round_order, o.heat_number, o.seq,
         run.id                AS model_run_id,
         run.alpha::numeric    AS alpha,
         run.prior::numeric    AS trim_before,
         (run.alpha * o.residual + (1 - run.alpha) * run.prior)::numeric AS trim_after,
         (1 - run.alpha)::numeric AS prior_weight
  FROM ord o CROSS JOIN run
  WHERE o.seq = 1

  UNION ALL

  SELECT o.datum_id, o.heat_entry_id, o.heat_id, o.surfer_id, o.residual,
         o.season_year, o.event_number, o.round_order, o.heat_number, o.seq,
         c.model_run_id,
         c.alpha,
         c.trim_after,
         c.alpha * o.residual + (1 - c.alpha) * c.trim_after,
         c.prior_weight * (1 - c.alpha)
  FROM chain c
  JOIN ord o ON o.surfer_id = c.surfer_id AND o.seq = c.seq + 1
)
INSERT INTO trim (
  model_run_id, surfer_id, heat_id, heat_entry_id, datum_id, seq,
  season_year, event_number, round_order, heat_number,
  residual, trim_before, trim_after, prior_weight)
SELECT model_run_id, surfer_id, heat_id, heat_entry_id, datum_id, seq,
       season_year, event_number, round_order, heat_number,
       residual::numeric(9,6),
       trim_before::numeric(9,6),
       trim_after::numeric(9,6),
       prior_weight::numeric(9,8)
FROM chain
ON CONFLICT (model_run_id, heat_entry_id) DO NOTHING;

-- --- 3. assertions -------------------------------------------------------
DO $$
DECLARE
  r1 bigint; r2 bigint; n2 int; s2 int; jjf numeric; italo numeric;
  n_datum int; others_changed int; prefix_changed int; breaks int; steps int;
  run2 trim_model_runs%ROWTYPE;
BEGIN
  SELECT id INTO r1 FROM trim_model_runs WHERE computed_on = '2026-08-31' AND spec = 'ewma_residual_hl15';
  SELECT * INTO run2 FROM trim_model_runs WHERE computed_on = '2026-10-17' AND spec = 'ewma_residual_hl15';
  r2 := run2.id;
  SELECT count(*), count(DISTINCT surfer_id) INTO n2, s2 FROM trim WHERE model_run_id = r2;
  SELECT count(*) INTO n_datum FROM datum d JOIN datum_model_runs m ON m.id = d.model_run_id
    WHERE m.computed_on = '2026-08-28' AND m.spec = 'round';

  SELECT t.trim_after INTO jjf FROM trim t JOIN surfers s ON s.id = t.surfer_id
    WHERE t.model_run_id = r2 AND s.wsl_athlete_id = '199' ORDER BY t.seq DESC LIMIT 1;
  SELECT t.trim_after INTO italo FROM trim t JOIN surfers s ON s.id = t.surfer_id
    WHERE t.model_run_id = r2 AND s.wsl_athlete_id = '1737' ORDER BY t.seq DESC LIMIT 1;

  -- Every other surfer: every row of run 2 equals run 1, value for value.
  SELECT count(*) INTO others_changed
  FROM trim t2
  JOIN surfers s ON s.id = t2.surfer_id
  LEFT JOIN trim t1 ON t1.model_run_id = r1 AND t1.heat_entry_id = t2.heat_entry_id
  WHERE t2.model_run_id = r2 AND s.wsl_athlete_id NOT IN ('199', '1737')
    AND (t1.id IS NULL OR t1.seq <> t2.seq OR t1.residual <> t2.residual
         OR t1.trim_before <> t2.trim_before OR t1.trim_after <> t2.trim_after
         OR t1.prior_weight <> t2.prior_weight);

  -- JJF and Italo: identical up to and including Title Match Heat 1.
  SELECT count(*) INTO prefix_changed
  FROM trim t2
  JOIN surfers s ON s.id = t2.surfer_id
  JOIN trim t1 ON t1.model_run_id = r1 AND t1.heat_entry_id = t2.heat_entry_id
  WHERE t2.model_run_id = r2 AND s.wsl_athlete_id IN ('199', '1737')
    AND (t2.season_year, t2.event_number, t2.round_order, t2.heat_number) <= (2024, 10, 4, 4)
    AND (t1.seq <> t2.seq OR t1.trim_after <> t2.trim_after);

  SELECT count(*) INTO breaks FROM v_trim_recursion_breaks;
  SELECT count(*) INTO steps  FROM v_trim_step_disagreements;

  IF n_datum <> 1845 THEN RAISE EXCEPTION 'Datum V1 rows: expected 1845 (1843 fitted + 2 scored), got %', n_datum; END IF;
  IF n2 <> 1845 OR s2 <> 73 THEN RAISE EXCEPTION 'Trim run 2: expected 1845 rows over 73 surfers, got % over %', n2, s2; END IF;
  IF run2.n_entries <> 1845 OR run2.n_scored <> 1772 THEN
    RAISE EXCEPTION 'Trim run 2 claims % entries, % scored; expected 1845 and 1772', run2.n_entries, run2.n_scored;
  END IF;
  IF round(jjf, 3) <> 1.790 THEN RAISE EXCEPTION 'JJF Trim: expected 1.790, got %', jjf; END IF;
  IF round(italo, 3) <> 1.219 THEN RAISE EXCEPTION 'Italo Trim: expected 1.219, got %', italo; END IF;
  IF others_changed <> 0 THEN RAISE EXCEPTION '% Trim rows of other surfers differ between run 1 and run 2', others_changed; END IF;
  IF prefix_changed <> 0 THEN RAISE EXCEPTION '% JJF/Italo rows before the new heat differ between runs', prefix_changed; END IF;
  IF breaks <> 0 THEN RAISE EXCEPTION 'v_trim_recursion_breaks: % rows', breaks; END IF;
  IF steps  <> 0 THEN RAISE EXCEPTION 'v_trim_step_disagreements: % rows', steps; END IF;

  RAISE NOTICE 'OK: Trim run 2, 1845 rows. JJF % (was 1.653), Italo % (was 1.206); 71 other surfers identical to run 1. Walk-forward RMSE % against % predicting zero (n %), shrunk flat mean %, paired t %.',
    round(jjf, 3), round(italo, 3), run2.rmse_walkforward, run2.rmse_predict_zero, run2.n_scored,
    run2.rmse_shrunk_flat_mean, run2.paired_t_vs_shrunk;
END $$;

COMMIT;

-- =====================================================================
-- VERIFY -- run after applying.
--   select * from v_trim_coverage;      -- run 2: claimed 1845 = stored 1845 = datum_rows 1845
--   select * from v_datum_coverage;     -- claimed 1843 (fitted), stored 1845, eligible 1845
--   select full_name, round(trim,3), n_heats, model_run_id from v_trim_current
--     where full_name in ('John John Florence','Italo Ferreira');
--                                       -- 1.790 / 43 / run 2 and 1.219 / 72 / run 2
-- =====================================================================
