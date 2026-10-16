-- verify_per_event.sql
-- Per-event / integrity spot-check for wsl-analytics.
-- Run AFTER the Week 1 deploys (analytics views + 2018 Surf Ranch re-ingest + baseline).
-- Sits alongside verify_db.sql; verify_db.sql checks champion-level totals only,
-- this one checks per-surfer / per-event correctness (the actual product requirement).
--
-- NOTE FOR CLAUDE CODE: table/column names below come from the handover, not a live
-- introspection. Sections A and B use only confirmed columns (heat_results.wave_1_score,
-- wave_2_score, heat_total, interference; wave_scores.score, counted) and should run as-is.
-- Sections C and D reference the analytics layer (rankings_current + a per-event points
-- source). Reconcile those names against 20260420000003_analytics_views_v3.sql before running,
-- and fill in the WSL-verified reference values marked TODO. Do NOT invent reference values —
-- pull them from WSL published standings / the handover doc.
-- heat_total may be numeric or text (some em-dash / DNS rows exist), so every arithmetic
-- comparison casts via ::text first and filters to numeric-looking values.


-- ============================================================================
-- A. HEAT-TOTAL INTEGRITY  (the 3 known deferred mismatches watchdog)
--    The two counted waves must sum to heat_total, except on interference rows
--    (penalty deductions legitimately break the sum).
--    EXPECTED: exactly 3 rows — the known, deferred mismatches.
--    More than 3, or a different set of surfer/events, means new drift was
--    introduced (likely by the re-ingest). Investigate before building profiles.
-- ============================================================================
with hr_num as (
  select
    hr.heat_id,
    hr.surfer_id,
    hr.wave_1_score,
    hr.wave_2_score,
    (hr.heat_total::text) as ht_text,
    coalesce(hr.interference, false) as interference
  from heat_results hr
)
select
  s.full_name,
  e.slug                                            as event,
  e.season_year,
  hr.heat_id,
  hr.wave_1_score,
  hr.wave_2_score,
  hr.ht_text                                        as heat_total,
  round((hr.wave_1_score + hr.wave_2_score) - hr.ht_text::numeric, 2) as delta
from hr_num hr
join surfers s on s.id = hr.surfer_id
join heats   h on h.id = hr.heat_id
join events  e on e.id = h.event_id
where hr.interference = false
  and hr.wave_1_score is not null
  and hr.wave_2_score is not null
  and hr.ht_text ~ '^\s*\d+(\.\d+)?\s*$'
  and abs((hr.wave_1_score + hr.wave_2_score) - hr.ht_text::numeric) > 0.001
order by abs((hr.wave_1_score + hr.wave_2_score) - hr.ht_text::numeric) desc;


-- ============================================================================
-- B. SURF RANCH 2018 wave_scores RECONCILE
--    wave_scores was empty DB-wide until the re-ingest; 2018 Surf Ranch is the
--    only event populated. Each surfer/heat must have exactly 2 counted waves,
--    and those must sum to heat_total (best-left + best-right was applied at ingest
--    to set the counted flags).
--    EXPECTED: 0 rows. Any row = wave_scores <-> heat_total inconsistency.
-- ============================================================================
with counted as (
  select
    ws.heat_id,
    ws.surfer_id,
    count(*) filter (where ws.counted)     as n_counted,
    sum(ws.score) filter (where ws.counted) as counted_sum
  from wave_scores ws
  group by ws.heat_id, ws.surfer_id
)
select
  s.full_name,
  c.heat_id,
  c.n_counted,
  c.counted_sum,
  (hr.heat_total::text)                                        as heat_total,
  round(c.counted_sum - (hr.heat_total::text)::numeric, 2)     as delta
from counted c
join heat_results hr on hr.heat_id = c.heat_id and hr.surfer_id = c.surfer_id
join surfers s       on s.id = c.surfer_id
where c.n_counted <> 2
   or (hr.heat_total::text) !~ '^\s*\d+(\.\d+)?\s*$'
   or abs(c.counted_sum - (hr.heat_total::text)::numeric) > 0.001
order by delta desc nulls last;


-- ============================================================================
-- C. PER-EVENT POINTS — cross-era anchors vs WSL-verified values
--    This is the core non-champion check. It needs a per-event points source.
--    If analytics_views_v3 only computes per-event points inside a CTE of
--    rankings_current, expose it as a view first (e.g. surfer_event_points) —
--    profile pages will need it queryable anyway, so this isn't throwaway work.
--
--    Expected view shape: surfer_event_points(surfer_id, event_id, points)
--    Fill one or two anchors PER ERA (2015-17, 2018, 2019, 2021+). Confirmed
--    2018 Surf Ranch anchors are pre-filled; everything marked TODO needs a real
--    full_name + WSL points value before this section is meaningful.
--    EXPECTED: delta = 0 on every row. NULL actual_points = missing row / bad join.
-- ============================================================================
with expected(full_name, event_slug, expected_points) as (
  values
    -- 2018 Surf Ranch qualifying-only non-advancers (confirmed vs WSL):
    ('Griffin Colapinto', 'surf-ranch-pro-2018', 1665),   -- rank 17, Equal 13th
    ('Michael Rodrigues', 'surf-ranch-pro-2018', 1665),   -- rank 18, Equal 13th (name confirmed from re-ingest)
    ('Wade Carmichael',   'surf-ranch-pro-2018', 420),    -- rank 25, Equal 25th
    -- 2015-2017 era anchor(s):
    -- ('<full_name>', '<event-slug>', <points>),          -- TODO
    -- 2018 era anchor (non-Surf-Ranch):
    -- ('<full_name>', '<event-slug>', <points>),          -- TODO
    -- 2019 era anchor:
    -- ('<full_name>', '<event-slug>', <points>),          -- TODO
    -- 2021+ era anchor:
    ('__placeholder__', '__none__', -1)                    -- keep VALUES non-empty; delete once real rows added
)
select
  ex.full_name,
  ex.event_slug,
  ex.expected_points,
  sep.points                                 as actual_points,
  (sep.points - ex.expected_points)          as delta
from expected ex
left join surfers s              on s.full_name = ex.full_name
left join events  e              on e.slug = ex.event_slug
left join surfer_event_points sep on sep.surfer_id = s.id and sep.event_id = e.id
where ex.event_slug <> '__none__'
order by ex.event_slug, ex.full_name;


-- ============================================================================
-- D. CHAMPION SEASON TOTALS — calibration (re-run because verify_db.sql is stale)
--    Champion is the explicit DB field — never derived from points. Pull each
--    champion's season total from rankings_current and compare to WSL.
--    Confirmed 2021-2025 values pre-filled; 2015-2019 marked TODO (they were all
--    verified previously — pull the exact figures from the handover doc / WSL).
--    Reconcile column names: rankings_current season / points columns below are
--    best-guess (season_year, is_champion, season_total). Adjust to match the view.
--    EXPECTED: delta = 0 on every row.
-- ============================================================================
with expected(season_year, expected_total) as (
  values
    -- (2015, <total>),   -- TODO
    -- (2016, <total>),   -- TODO
    -- (2017, <total>),   -- TODO
    -- (2018, <total>),   -- TODO
    -- (2019, <total>),   -- TODO
    -- 2020 cancelled (COVID) — no row
    (2021, 43400),
    (2022, 54690),
    (2023, 58300),
    (2024, 49530),
    (2025, 54750)
)
select
  ex.season_year,
  rc.full_name                       as champion,
  ex.expected_total,
  rc.season_total                    as actual_total,
  (rc.season_total - ex.expected_total) as delta
from expected ex
left join rankings_current rc
       on rc.season_year = ex.season_year
      and rc.is_champion = true
order by ex.season_year;
