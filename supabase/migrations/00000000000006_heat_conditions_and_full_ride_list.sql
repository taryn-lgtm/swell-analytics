-- =====================================================================
-- 00000000000006_heat_conditions_and_full_ride_list.sql
-- Reinstate heat conditions; correct two comments that assert a false
-- limit on what WSL publishes
-- =====================================================================
--
-- Depends on: 00000000000001_m1_schema.sql
-- Target:     v2, ref tjwqskjsyluxepdbwjet
--
-- WHY. docs/findings/2026-08-08_wave_level_availability_corrected.md.
-- The WSL Heat Details view publishes, per heat: wave height range, wind
-- conditions, heat duration, total wave count, average heat score — and
-- per surfer, EVERY ride's score with the counting pair marked.
--
-- This reverses a decision taken earlier the same day. The conditions
-- columns were dropped from `heats` on the grounds that conditions are
-- Phase 3 deferred data with no source, and that all-null columns through
-- M1 and M2 are the speculative-column pattern the schema refuses. That
-- was correct on the evidence then held. There is a source, it is on the
-- same page as the ride scores, and PROJECT_PLAN.md names conditions as a
-- Datum input. The columns are no longer speculative.
--
-- TWO COMMENTS IN THE LIVE DATABASE ARE WRONG and are replaced here.
-- `waves` said every non-counting ride "is not available anywhere".
-- `heats` said conditions were dropped until a source appears. Both were
-- written from the 28 July finding, whose §4 inferred what the WSL page
-- contains from what v1's parser captured.
--
-- NOTHING ABOUT `waves` NEEDS ALTERING. The table already carries
-- wave_order and a `counted` boolean, so the full ride list fits it as
-- designed — one row per ride, `counted` true for the pair that makes the
-- heat total. That was luck rather than foresight, but it holds.
--
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Conditions, as published on the Heat Details view.
--
-- Raw strings retained alongside parsed values, following the
-- heat_entries.progression_text precedent: a parsing bug stays fixable
-- without re-fetching.
-- ---------------------------------------------------------------------

ALTER TABLE heats
  ADD COLUMN wave_height_min_ft       numeric(4,1),
  ADD COLUMN wave_height_max_ft       numeric(4,1),
  ADD COLUMN wave_height_published    text,
  ADD COLUMN wind_conditions          text,
  ADD COLUMN duration_minutes         integer,
  ADD COLUMN published_wave_count     integer,
  ADD COLUMN published_avg_heat_score numeric(4,2);

ALTER TABLE heats
  ADD CONSTRAINT heats_wave_height_ordered CHECK (
    wave_height_min_ft IS NULL OR wave_height_max_ft IS NULL
    OR wave_height_max_ft >= wave_height_min_ft
  ),
  ADD CONSTRAINT heats_wave_height_sane CHECK (
    wave_height_min_ft IS NULL OR wave_height_min_ft >= 0
  ),
  ADD CONSTRAINT heats_duration_positive CHECK (
    duration_minutes IS NULL OR duration_minutes > 0
  ),
  ADD CONSTRAINT heats_wave_count_non_negative CHECK (
    published_wave_count IS NULL OR published_wave_count >= 0
  ),
  ADD CONSTRAINT heats_avg_score_range CHECK (
    published_avg_heat_score IS NULL
    OR (published_avg_heat_score >= 0 AND published_avg_heat_score <= 20)
  );

COMMENT ON COLUMN heats.wave_height_published IS
  'WSL''s string verbatim, e.g. "6-8''". Retained as well as parsed. The parsed pair is a range and not a measurement — WSL publishes a band, not a reading, and modelling it as a single number would invent precision.';
COMMENT ON COLUMN heats.wind_conditions IS
  'WSL''s published string, e.g. "Calm". Deliberately text and NOT an enum. Same principle as rounds.wsl_code: record what is published, do not impose a vocabulary nobody has sourced. Collect the distinct values across Era A before deciding whether a controlled list exists.';
COMMENT ON COLUMN heats.duration_minutes IS
  'Published on the Heat Details view — 30 minutes at Pipeline 2025, 40 at Punta Roca 2026. A Datum input: rides available scale with heat length, so a 40-minute heat and a 30-minute heat are not comparable without it.';
COMMENT ON COLUMN heats.published_wave_count IS
  'WSL''s own total across all surfers in the heat. Stored so it can be asserted against the rides actually loaded — v_wave_count_disagreements. This is rule 2 applied to the ride list, and it is the check that catches a truncated parse.';
COMMENT ON COLUMN heats.published_avg_heat_score IS
  'WSL''s published average. Observed to be the mean of the surfers'' heat totals in both views held (Pipeline 2025: 9.77; Punta Roca 2026: 8.82). Asserted rather than assumed in v_avg_heat_score_disagreements.';

-- ---------------------------------------------------------------------
-- The two comments that were wrong.
-- ---------------------------------------------------------------------

COMMENT ON TABLE waves IS
  'ONE ROW PER RIDE, not per counting wave. WSL publishes every ride a surfer caught, in order, and marks the two that make the heat total — `counted` is that mark. Corrected 8 August 2026: this comment previously asserted that non-counting rides were "not available anywhere", which was inferred from v1''s two-column CSV rather than from the WSL page. See docs/findings/2026-08-08_wave_level_availability_corrected.md. Still NOT published, on current evidence: judge-by-judge breakdown, ride times, priority.';

COMMENT ON TABLE heats IS
  'Conditions columns were dropped on 8 August 2026 and reinstated the same day. They are published on the Heat Details view — wave height range, wind, duration, total waves, average heat score — and PROJECT_PLAN.md names conditions as a Datum input. The earlier reasoning ("Phase 3 deferred data, no source") rested on the same mistaken finding as the waves comment above.';

COMMENT ON COLUMN waves.counted IS
  'True for the two rides that make the heat total. NOT derivable by taking the best two: an interference penalty can zero a counting ride while leaving higher-scoring rides uncounted — Punta Roca 2026, where a 5.13 + 0.00 pair stood while a 2.50 and two 2.17s were not promoted. Read the flag from the page; never recompute it.';

COMMENT ON COLUMN waves.wave_order IS
  'Chronological position in the heat, 1-based, as listed on the Heat Details view. NOT the order the counting pair is printed in — WSL decomposes the heat total by score descending (Dora at Pipeline 2025 reads "4.53 + 4.00", rides 7 and 5). A parser matching the decomposition to rides positionally will mismatch.';

-- ---------------------------------------------------------------------
-- Two more independently-published signals, asserted to agree.
-- ---------------------------------------------------------------------

CREATE VIEW v_wave_count_agreement AS
SELECT
  h.id AS heat_id,
  h.published_wave_count,
  count(w.id) AS rides_loaded
FROM heats h
LEFT JOIN heat_entries he ON he.heat_id = h.id
LEFT JOIN waves w         ON w.heat_entry_id = he.id
GROUP BY h.id, h.published_wave_count;

COMMENT ON VIEW v_wave_count_agreement IS
  'WSL''s published total wave count for a heat against the rides actually loaded. Pipeline 2025: Moniz 6 + Groggia 3 + Dora 7 = 16, which is what the page prints.';

CREATE VIEW v_wave_count_disagreements AS
SELECT *
FROM v_wave_count_agreement
WHERE published_wave_count IS NOT NULL
  AND published_wave_count IS DISTINCT FROM rides_loaded;

COMMENT ON VIEW v_wave_count_disagreements IS
  'Must be empty for any heat whose rides have been ingested. A row here means the ride list was truncated, which is the failure this whole correction exists to make loud. Heats with no waves loaded yet appear with rides_loaded = 0 and are caught by the same rule — filter on ingest state, do not weaken the view.';

CREATE VIEW v_avg_heat_score_disagreements AS
SELECT
  h.id AS heat_id,
  h.published_avg_heat_score,
  round(avg(he.heat_total), 2) AS mean_of_heat_totals
FROM heats h
JOIN heat_entries he ON he.heat_id = h.id
WHERE h.published_avg_heat_score IS NOT NULL
GROUP BY h.id, h.published_avg_heat_score
HAVING round(avg(he.heat_total), 2) IS DISTINCT FROM h.published_avg_heat_score;

COMMENT ON VIEW v_avg_heat_score_disagreements IS
  'Expected empty, but treat a row as a question rather than a failure until Era A has been checked. That the published average is the mean of the heat totals is an observation from two views, not a sourced definition — it holds at Pipeline 2025 and Punta Roca 2026. If rows appear, WSL means something else by "average heat score" and this view is how that gets found.';

-- security_invoker on the new views, per 00000000000004. Without it these
-- three would reopen the RLS bypass that migration closed.
ALTER VIEW v_wave_count_agreement        SET (security_invoker = on);
ALTER VIEW v_wave_count_disagreements    SET (security_invoker = on);
ALTER VIEW v_avg_heat_score_disagreements SET (security_invoker = on);

COMMIT;
