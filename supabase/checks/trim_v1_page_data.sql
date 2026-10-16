-- =====================================================================
-- trim_v1_page_data.sql -- regenerates data/trim_page_v1.json, the input
-- to scripts/render_trim_page.py (M2 item 6).
--
-- READ-ONLY. Four result sets, pasted into the JSON under the keys named
-- in each header. Every figure on docs/trim_v1.html comes from here.
--
-- TWO MODES, AND THEY MUST AGREE
--
-- Section B below recomputes the recursion from `datum`, which is how the
-- page was first generated on 31 August 2026 -- BEFORE
-- supabase/seeds/trim_v1.sql had been applied. Once the seed is applied,
-- run section B' instead: it reads the stored `trim` table. The two must
-- produce identical series. That is not a formality -- it is the cheapest
-- available check that the seed inserted what the model says it should.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. "events" and "rounds" -- the lookup tables the page indexes into.
--    Event index is (season_year, event_number) order; round index is
--    ascending Datum expected score, which is also the CT ladder order.
-- ---------------------------------------------------------------------
SELECT
 (SELECT json_agg(json_build_array(e.season_year, e.event_number, e.name)
                  ORDER BY e.season_year, e.event_number)::text FROM events e) AS events,
 (SELECT json_agg(json_build_array(dre.round_name, dre.expected_score)
                  ORDER BY dre.expected_score)::text
    FROM datum_round_effects dre) AS rounds;

-- ---------------------------------------------------------------------
-- B. "ranked" and "points" -- PRE-APPLY form, recomputed from datum.
--
--    "points" is one block per surfer, `surfer_id~p;p;p`, each point
--    `event_idx,round_idx,heat_total,trim_after` in career order. seq is
--    implied by position. The compact encoding exists so the whole of
--    Trim -- 1,843 points -- fits in a file a human can diff.
--
--    NOTE the two rounding paths: "ranked" casts to numeric(9,6) first,
--    which is what the database stores, and "points" does not, so two of
--    seventy-three disagree in the fourth decimal. render_trim_page.py
--    renders everything from "points" and asserts "ranked" agrees within
--    1.5e-4 rather than carrying two sources of truth.
-- ---------------------------------------------------------------------
WITH RECURSIVE run AS (
  SELECT 0::bigint AS id, 0.045158396090::numeric AS alpha, 0.0000::numeric AS prior
),
evidx AS (
  SELECT id, (row_number() OVER (ORDER BY season_year, event_number))-1 AS ix FROM events
),
rdidx AS (
  SELECT round_name, (row_number() OVER (ORDER BY expected_score))-1 AS ix
    FROM datum_round_effects
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
         run.id AS model_run_id, run.alpha::numeric AS alpha,
         run.prior::numeric AS trim_before,
         (run.alpha * o.residual + (1 - run.alpha) * run.prior)::numeric AS trim_after,
         (1 - run.alpha)::numeric AS prior_weight
  FROM ord o CROSS JOIN run WHERE o.seq = 1
  UNION ALL
  SELECT o.datum_id, o.heat_entry_id, o.heat_id, o.surfer_id, o.residual,
         o.season_year, o.event_number, o.round_order, o.heat_number, o.seq,
         c.model_run_id, c.alpha, c.trim_after,
         c.alpha * o.residual + (1 - c.alpha) * c.trim_after,
         c.prior_weight * (1 - c.alpha)
  FROM chain c JOIN ord o ON o.surfer_id = c.surfer_id AND o.seq = c.seq + 1
),
fin AS (
  SELECT DISTINCT ON (surfer_id) surfer_id, seq AS n_heats,
         trim_after::numeric(9,6) AS trim, prior_weight::numeric(9,8) AS pw
  FROM chain ORDER BY surfer_id, seq DESC
),
pt AS (
  SELECT c.surfer_id, c.seq, ev.ix AS ev, ri.ix AS rd,
         round(he.heat_total,2) AS ht, round(c.trim_after,4) AS tr
  FROM chain c
  JOIN heats h  ON h.id = c.heat_id
  JOIN rounds r ON r.id = h.round_id
  JOIN evidx ev ON ev.id = r.event_id
  JOIN rdidx ri ON ri.round_name = r.name
  JOIN heat_entries he ON he.id = c.heat_entry_id
)
SELECT
 (SELECT json_agg(json_build_array(f.surfer_id, s.full_name,
                                   round(f.trim,4), f.n_heats, round(f.pw,4))
                  ORDER BY f.trim DESC)::text
    FROM fin f JOIN surfers s ON s.id = f.surfer_id) AS ranked,
 (SELECT string_agg(line, '|' ORDER BY surfer_id) FROM (
    SELECT surfer_id,
           surfer_id || '~' || string_agg(ev||','||rd||','||ht||','||tr, ';' ORDER BY seq) AS line
    FROM pt GROUP BY surfer_id) x) AS points;

-- ---------------------------------------------------------------------
-- B'. POST-APPLY form. Run this instead once the seed is in, and diff the
--     output against B. Any difference means the seed did not insert what
--     the model computes, and the page must not be regenerated until it
--     is explained.
-- ---------------------------------------------------------------------
-- WITH evidx AS (
--   SELECT id, (row_number() OVER (ORDER BY season_year, event_number))-1 AS ix FROM events
-- ),
-- rdidx AS (
--   SELECT round_name, (row_number() OVER (ORDER BY expected_score))-1 AS ix
--     FROM datum_round_effects
-- ),
-- fin AS (
--   SELECT surfer_id, n_heats, trim, prior_weight AS pw
--     FROM v_trim_current
-- ),
-- pt AS (
--   SELECT t.surfer_id, t.seq, ev.ix AS ev, ri.ix AS rd,
--          round(he.heat_total,2) AS ht, round(t.trim_after,4) AS tr
--   FROM trim t
--   JOIN heats h  ON h.id = t.heat_id
--   JOIN rounds r ON r.id = h.round_id
--   JOIN evidx ev ON ev.id = r.event_id
--   JOIN rdidx ri ON ri.round_name = r.name
--   JOIN heat_entries he ON he.id = t.heat_entry_id
-- )
-- SELECT
--  (SELECT json_agg(json_build_array(f.surfer_id, s.full_name,
--                                    round(f.trim,4), f.n_heats, round(f.pw,4))
--                   ORDER BY f.trim DESC)::text
--     FROM fin f JOIN surfers s ON s.id = f.surfer_id) AS ranked,
--  (SELECT string_agg(line, '|' ORDER BY surfer_id) FROM (
--     SELECT surfer_id,
--            surfer_id || '~' || string_agg(ev||','||rd||','||ht||','||tr, ';' ORDER BY seq) AS line
--     FROM pt GROUP BY surfer_id) x) AS points;
