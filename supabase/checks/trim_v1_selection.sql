-- =====================================================================
-- trim_v1_selection.sql -- how Trim V1's half-life was chosen, and the
-- measurement that says the decay barely matters.
--
-- READ-ONLY. Re-run against v2 to reproduce every figure in
-- data/trim_run_v1.json, migration 15's header and supabase/seeds/trim_v1.sql.
-- There is no cells CSV for Trim: the selection is pure SQL, so the
-- harness is the query rather than a retained copy that can drift.
--
-- SCORING DESIGN
--   Walk-forward. For each surfer-heat with at least one earlier heat,
--   predict this heat's Datum residual from Trim as it stood BEFORE the
--   heat. Nothing from the heat being predicted enters its own
--   prediction, so there is no leakage in the time direction and no fold
--   design to argue about.
--
--   ONE LEAKAGE REMAINS, STATED RATHER THAN HIDDEN: Datum V1 was fitted
--   on all 1,843 entries, so the residuals these queries consume have
--   already seen the heats being predicted. Datum is twelve numbers over
--   1,843 rows, so the effect is small -- but it is not zero, and every
--   RMSE below is very slightly optimistic because of it.
--
-- POPULATION
--   1,770 of 1,843 entries. The 73 excluded are each surfer's first
--   heat, which has no prior heat to predict from. Stated because a
--   verdict without its population is not a verdict.
-- =====================================================================

-- ---------------------------------------------------------------------
-- QUERY 1 -- the half-life sweep.
--
-- Result, 31 August 2026 (RMSE over 1,770 entries):
--   predicting zero                      2.9675
--   half-life  2 heats                   3.0193   worse than nothing
--   half-life  5                         2.9348
--   half-life 10                         2.9135
--   half-life 12                         2.9113
--   half-life 15                         2.9101   <- V1
--   half-life 20                         2.9112
--   half-life 30                         2.9166
--   undecayed mean of prior residuals    3.0694
--
-- The basin is flat from about 10 to 25 heats. 15 is the whole-set
-- optimum and is not identified to better than that range.
-- ---------------------------------------------------------------------

WITH ord AS (
  SELECT d.surfer_id, d.residual::float8 r, e.season_year,
         row_number() OVER (PARTITION BY d.surfer_id
           ORDER BY e.season_year, e.event_number, rd.round_order, h.heat_number) seq
  FROM datum d
  JOIN heats h   ON h.id  = d.heat_id
  JOIN rounds rd ON rd.id = h.round_id
  JOIN events e  ON e.id  = rd.event_id
),
grid(hl) AS (VALUES (2.0),(3.0),(4.0),(5.0),(6.0),(8.0),(10.0),(12.0),(15.0),(20.0),(30.0)),
p AS (SELECT hl, 1 - power(0.5, 1.0/hl) alpha FROM grid),
calc AS (
  SELECT p.hl, o.surfer_id, o.seq, o.r,
         p.alpha * power(1-p.alpha, o.seq)
           * sum(o.r * power(1-p.alpha, -o.seq))
             OVER (PARTITION BY p.hl, o.surfer_id ORDER BY o.seq) AS t_incl,
         avg(o.r) OVER (PARTITION BY o.surfer_id ORDER BY o.seq) AS flat_incl
  FROM ord o CROSS JOIN p
),
lagged AS (
  SELECT *, lag(t_incl)    OVER (PARTITION BY hl, surfer_id ORDER BY seq) trim_before,
            lag(flat_incl) OVER (PARTITION BY hl, surfer_id ORDER BY seq) flat_before
  FROM calc
)
SELECT hl AS half_life_heats, count(*) n_scored,
       round(sqrt(avg(r*r))::numeric,4)                    rmse_predict_zero,
       round(sqrt(avg(power(r-trim_before,2)))::numeric,4) rmse_trim,
       round(sqrt(avg(power(r-flat_before,2)))::numeric,4) rmse_undecayed_mean
FROM lagged WHERE trim_before IS NOT NULL
GROUP BY hl ORDER BY hl;

-- ---------------------------------------------------------------------
-- QUERY 2 -- THE FINDING. Is the decay doing the work, or the prior?
--
-- The undecayed mean above (3.0694) loses to Trim, but it is also
-- UNSHRUNK: at a surfer's second heat it is simply their first residual.
-- Shrink it toward zero by a prior count c and it catches up.
--
-- Result, 31 August 2026:
--   c =  0   3.0694     c = 8    2.9158
--   c =  1   2.9793     c = 12   2.9125   <- best, no decay at all
--   c =  3   2.9378     c = 20   2.9133
--   c =  5   2.9240     c = 60   2.9285
--
-- Best undecayed 2.9125 against Trim's 2.9101. The recency weighting is
-- worth 0.0024 RMSE. See query 3.
-- ---------------------------------------------------------------------

WITH ord AS (
  SELECT d.surfer_id, d.residual::float8 r,
         row_number() OVER (PARTITION BY d.surfer_id
           ORDER BY e.season_year, e.event_number, rd.round_order, h.heat_number) seq
  FROM datum d
  JOIN heats h   ON h.id  = d.heat_id
  JOIN rounds rd ON rd.id = h.round_id
  JOIN events e  ON e.id  = rd.event_id
),
cum AS (
  SELECT *, sum(r) OVER (PARTITION BY surfer_id ORDER BY seq
                         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) sum_before,
            (seq - 1)::float8 n_before
  FROM ord
),
grid(c) AS (VALUES (0.0),(1.0),(2.0),(3.0),(5.0),(8.0),(12.0),(20.0),(35.0),(60.0))
SELECT g.c AS prior_count, count(*) n_scored,
       round(sqrt(avg(power(cum.r - cum.sum_before/(cum.n_before+g.c),2)))::numeric,4) rmse
FROM cum CROSS JOIN grid g
WHERE cum.n_before > 0
GROUP BY g.c ORDER BY g.c;

-- ---------------------------------------------------------------------
-- QUERY 3 -- is that 0.0024 real? Paired, on the same 1,770 entries.
--
-- Result: mean squared-error difference 0.014014, standard error
-- 0.026075, t = 0.537. It is not.
--
-- On two seasons the exponential decay cannot be shown to beat no decay
-- at all. PROJECT_PLAN.md specifies EWMA and EWMA is what is built; this
-- query is why migration 15 does not claim the decay earns its place,
-- and why trim_model_runs stores rmse_shrunk_flat_mean beside the
-- headline figure instead of leaving it in a findings file.
-- ---------------------------------------------------------------------

WITH ord AS (
  SELECT d.surfer_id, d.residual::float8 r,
         row_number() OVER (PARTITION BY d.surfer_id
           ORDER BY e.season_year, e.event_number, rd.round_order, h.heat_number) seq
  FROM datum d
  JOIN heats h   ON h.id  = d.heat_id
  JOIN rounds rd ON rd.id = h.round_id
  JOIN events e  ON e.id  = rd.event_id
),
a AS (SELECT 1 - power(0.5, 1.0/15.0) alpha),
calc AS (
  SELECT o.*, a.alpha,
         a.alpha * power(1-a.alpha, o.seq)
           * sum(o.r * power(1-a.alpha, -o.seq))
             OVER (PARTITION BY o.surfer_id ORDER BY o.seq) t_incl,
         sum(o.r) OVER (PARTITION BY o.surfer_id ORDER BY o.seq
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) sum_before,
         (o.seq-1)::float8 n_before
  FROM ord o CROSS JOIN a
),
l AS (SELECT *, lag(t_incl) OVER (PARTITION BY surfer_id ORDER BY seq) trim_before FROM calc)
SELECT count(*) n,
  round(avg(power(r-sum_before/(n_before+12.0),2) - power(r-trim_before,2))::numeric,6) mean_sq_err_diff,
  round((stddev_samp(power(r-sum_before/(n_before+12.0),2) - power(r-trim_before,2))
         /sqrt(count(*)))::numeric,6) standard_error,
  round((avg(power(r-sum_before/(n_before+12.0),2) - power(r-trim_before,2))
         /(stddev_samp(power(r-sum_before/(n_before+12.0),2) - power(r-trim_before,2))
           /sqrt(count(*))))::numeric,3) t_stat
FROM l WHERE trim_before IS NOT NULL;

-- ---------------------------------------------------------------------
-- QUERY 4 -- STABILITY. Does the half-life hold across seasons?
--
-- Result: no. 2024's optimum is 12 heats (2.9108), 2025's is 20
-- (2.9077). Trim beats predicting zero in both seasons at every
-- half-life tried, so the DIRECTION is stable and only the parameter is
-- not. Decision 26 established that a result whose sign flips with the
-- fold design is evidence of nothing; here the sign holds and the
-- parameter wanders, which is a weaker complaint and still worth
-- recording.
-- ---------------------------------------------------------------------

WITH ord AS (
  SELECT d.surfer_id, d.residual::float8 r, e.season_year,
         row_number() OVER (PARTITION BY d.surfer_id
           ORDER BY e.season_year, e.event_number, rd.round_order, h.heat_number) seq
  FROM datum d
  JOIN heats h   ON h.id  = d.heat_id
  JOIN rounds rd ON rd.id = h.round_id
  JOIN events e  ON e.id  = rd.event_id
),
grid(hl) AS (VALUES (6.0),(8.0),(10.0),(12.0),(15.0),(20.0),(25.0),(30.0)),
p AS (SELECT hl, 1 - power(0.5, 1.0/hl) alpha FROM grid),
calc AS (
  SELECT p.hl, o.surfer_id, o.season_year, o.seq, o.r,
         p.alpha * power(1-p.alpha, o.seq)
           * sum(o.r * power(1-p.alpha, -o.seq))
             OVER (PARTITION BY p.hl, o.surfer_id ORDER BY o.seq) t_incl
  FROM ord o CROSS JOIN p
),
l AS (SELECT *, lag(t_incl) OVER (PARTITION BY hl, surfer_id ORDER BY seq) trim_before FROM calc)
SELECT hl AS half_life_heats, season_year, count(*) n,
       round(sqrt(avg(r*r))::numeric,4) rmse_predict_zero,
       round(sqrt(avg(power(r-trim_before,2)))::numeric,4) rmse_trim
FROM l WHERE trim_before IS NOT NULL
GROUP BY hl, season_year ORDER BY season_year, hl;

-- ---------------------------------------------------------------------
-- QUERY 5 -- CHECK THE INSTRUMENT (rule 8). The sweep above uses a
-- closed form for the EWMA; the seed uses a recursion. They must agree.
--
-- Result: 1,843 rows compared, maximum absolute difference 2.0e-15.
-- ---------------------------------------------------------------------

WITH RECURSIVE ord AS (
  SELECT d.surfer_id, d.residual::float8 r,
         row_number() OVER (PARTITION BY d.surfer_id
           ORDER BY e.season_year, e.event_number, rd.round_order, h.heat_number) seq
  FROM datum d
  JOIN heats h   ON h.id  = d.heat_id
  JOIN rounds rd ON rd.id = h.round_id
  JOIN events e  ON e.id  = rd.event_id
),
rec AS (
  SELECT surfer_id, seq, (1-power(0.5,1/15.0))*r AS t FROM ord WHERE seq = 1
  UNION ALL
  SELECT o.surfer_id, o.seq,
         (1-power(0.5,1/15.0))*o.r + power(0.5,1/15.0)*rec.t
  FROM rec JOIN ord o ON o.surfer_id = rec.surfer_id AND o.seq = rec.seq + 1
),
closed AS (
  SELECT surfer_id, seq,
         (1-power(0.5,1/15.0)) * power(power(0.5,1/15.0), seq)
           * sum(r * power(power(0.5,1/15.0), -seq))
             OVER (PARTITION BY surfer_id ORDER BY seq) AS t
  FROM ord
)
SELECT count(*) rows_compared, max(abs(rec.t - closed.t)) max_abs_difference
FROM rec JOIN closed USING (surfer_id, seq);
