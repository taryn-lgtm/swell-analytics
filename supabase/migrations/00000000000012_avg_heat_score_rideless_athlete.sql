-- =====================================================================
-- 00000000000012_avg_heat_score_rideless_athlete.sql
--
-- v_avg_heat_score_disagreements computed the mean over athletes who
-- SCORED. WSL's published average divides by every athlete in the heat and
-- counts one who rode nothing as zero.
--
-- MEASURED, not assumed. 2025 event 6 heat 106361 (Opening Round, Heat 1)
-- is the only heat among 712 retained popups that can tell the two apart:
-- Ryan Callinan is one of three athletes, takes no wave, and has no
-- published heat total.
--
--     published avg heat score                        9.06
--     (13.83 + 13.34 + 0) / 3                         9.0567   <- matches
--     mean over the two who scored                   13.585
--     mean of all 13 ride scores                      3.8331
--     sum of rides / 3                               16.61
--     sum of rides / 2                               24.915
--     mean of counted rides only                      6.7925
--
-- Five candidate readings computed and eliminated; one matches. The other
-- 711 popups carry a heat total for every athlete, so they agree with both
-- readings and are evidence for NEITHER.
--
-- THE OLD RULE IS NOT WRONG ON ANY ROW NOW LOADED. Counted against v2 on
-- 26 August before this migration: 653 heats carry a published average,
-- 0 of them contain a null heat_total, and old rule and new rule both
-- return 0 disagreements over all 653. This changes no existing verdict.
-- It changes what happens when heat 106361's conditions load.
--
-- AN ATHLETE WHO RODE BUT CARRIES NO TOTAL IS NOT ZERO, IT IS UNMEASURABLE.
-- The mean goes NULL for that heat and the view reports it, exactly as
-- before. Only rides = 0 earns the zero, and that is read from `waves`.
--
-- Companion changes, same finding, same day:
--   scripts/lib/parse_popup.ts   three consistency checks
--   scripts/ingest_popups.ts     the counted-pair guard
-- =====================================================================

BEGIN;

CREATE OR REPLACE VIEW v_avg_heat_score_disagreements
WITH (security_invoker = true) AS
WITH per_entry AS (
  SELECT he.heat_id,
         he.heat_total,
         (SELECT count(*) FROM waves w WHERE w.heat_entry_id = he.id) AS rides
  FROM heat_entries he
),
per_heat AS (
  SELECT pe.heat_id,
         count(*)                                                          AS athletes,
         count(*) FILTER (WHERE pe.heat_total IS NULL AND pe.rides > 0)     AS unmeasurable,
         sum(COALESCE(pe.heat_total, 0))                                    AS total_sum
  FROM per_entry pe
  GROUP BY pe.heat_id
)
SELECT h.id AS heat_id,
       h.published_avg_heat_score,
       CASE WHEN ph.unmeasurable = 0 AND ph.athletes > 0
            THEN round(ph.total_sum / ph.athletes, 2)
       END AS mean_of_heat_totals
FROM heats h
JOIN per_heat ph ON ph.heat_id = h.id
WHERE h.published_avg_heat_score IS NOT NULL
  AND (CASE WHEN ph.unmeasurable = 0 AND ph.athletes > 0
            THEN round(ph.total_sum / ph.athletes, 2)
       END) IS DISTINCT FROM h.published_avg_heat_score;

DO $$
DECLARE n int; d int;
BEGIN
  SELECT count(*) INTO n FROM v_avg_heat_score_disagreements;
  SELECT count(*) INTO d FROM heats WHERE published_avg_heat_score IS NOT NULL;
  RAISE NOTICE 'v_avg_heat_score_disagreements: % row(s) over % heats carrying a published average.', n, d;
  IF n > 0 THEN
    RAISE EXCEPTION 'Expected 0 disagreements over the rows loaded when this migration was written. Got %. Do not loosen this view — find out which reading is wrong first.', n;
  END IF;
END $$;

INSERT INTO public.schema_migrations (version) VALUES
  ('00000000000012_avg_heat_score_rideless_athlete.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
