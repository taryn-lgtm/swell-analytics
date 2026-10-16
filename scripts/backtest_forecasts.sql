-- backtest_forecasts.sql — read-only. Run 8 October 2026 against v2 before migration 19.
-- Re-run it whenever Trim or Datum is refitted; the figures in predictions.model_params
-- must match what this returns.

-- 1. Head-to-head: P(A beats B) = 1 / (1 + exp(-k (trim_before_A - trim_before_B)))
--    over two-surfer heats with a clean 1/2 result. Fit k on 2024, test on 2025.
--    8 Oct: best k 0.4 (2024 log loss 0.6826); 2025 test n 297, log loss 0.6621,
--    Brier 0.2348, right 57.9% — coin flip 0.6931 / 0.2500 / 50%.
with e as (select he.heat_id, he.surfer_id, he.position, t.trim_before, t.season_year
           from heat_entries he join trim t on t.heat_entry_id = he.id),
h2 as (select heat_id from e group by heat_id
       having count(*) = 2 and count(distinct position) = 2 and bool_and(position in (1, 2))),
p as (select a.season_year y, (a.trim_before - b.trim_before)::float8 d,
             case when a.position = 1 then 1 else 0 end w
      from e a join e b on a.heat_id = b.heat_id and a.surfer_id < b.surfer_id
      where a.heat_id in (select heat_id from h2)),
k as (select generate_series(0, 40) / 10.0 k),
s as (select k.k, p.y, count(*) n,
             avg(-(p.w * ln(1 / (1 + exp(-k.k * p.d))) + (1 - p.w) * ln(1 - 1 / (1 + exp(-k.k * p.d))))) ll,
             avg((1 / (1 + exp(-k.k * p.d)) - p.w) ^ 2) brier,
             avg(case when (p.d > 0) = (p.w = 1) then 1.0 else 0 end) acc
      from p, k group by k.k, p.y)
select * from s order by y, k;

-- 2. Heat total: expected gap = Trim before the heat.
--    8 Oct, 2025: n 1008, r 0.204, RMSE 2.916 against 2.978 for Datum alone, MAE 2.255 / 2.337.
select season_year, count(*) n, corr(trim_before, residual) r,
       sqrt(avg((residual - trim_before) ^ 2)) rmse_trim, sqrt(avg(residual ^ 2)) rmse_datum,
       avg(abs(residual - trim_before)) mae_trim, avg(abs(residual)) mae_datum
from trim group by season_year order by 1;
