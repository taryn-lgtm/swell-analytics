// =====================================================================
// wave_gaps.ts — the wave gap, recorded at the grain item 5 asks for
// =====================================================================
//
// ONE implementation, emitted by all three generators. It used to be three
// copies of a similar idea in ingest_event.ts, ingest_finals.ts and
// ingest_popups.ts, and they disagreed with each other in two ways that
// cancelled out — see docs/findings/2026-08-25_wave_gap_ledger_fixed.md.
// A rule enforced in three places is a rule enforced nowhere.
//
// WHY THE HEAT AND NOT THE EVENT
//
// Item 5: "Both counting-wave scores present for every completed heat — or
// the gap is recorded in a data_gaps table with a reason and a source
// reference. Silent absence is a failure."
//
// The unit of that sentence is the HEAT. An event-scoped row cannot carry it.
// It closes the moment ANY wave anywhere in the event lands, so a
// part-collected event reports itself complete while heats inside it hold
// nothing. Measured against v2 on 25 August 2026: 100 of 753 heats held no
// waves, and 73 of them carried no gap row at all, because three of the four
// affected events were part-collections whose event-scoped row had closed
// correctly, by its own logic, on the first wave loaded. Seventy-three heats
// met no branch of item 5's sentence.
//
// WHY THE HEAT AND NOT THE HEAT ENTRY
//
// Measured, not assumed: 0 of 753 heats hold waves for some of their entries
// and not others. Waves arrive per heat, all or nothing, because the Tier 2
// popup is a per-heat document. A heat_entry row would add 1,742 rows and
// record nothing these do not.
//
// A NOTE ON WHAT IS NOT A GAP
//
// Seven heat entries hold exactly one ride and one counting wave. They are
// not gaps: the surfer caught one wave, and heat_total equals that ride's
// score in all seven. A naive "counted = 2" test flags all seven as failures.
// The pair is the best two of what was ridden, not a guarantee of two rides.
// =====================================================================

/**
 * The three statements that maintain the wave gap for one event.
 *
 * Both halves are computed in SQL at write time, so the block is safe to run
 * from Tier 1 or Tier 2, in either order, any number of times. Whichever runs
 * last leaves the ledger correct and a second run is a no-op.
 */
export function waveGapSql(season: number, eventNumber: number): string {
  const scoped = `e.season_year = ${season} AND e.event_number = ${eventNumber}`;

  // The em dash is part of the pattern and it is not cosmetic. Without it
  // 'waves for 2025 event 1 %' also matches events 10, 11 and 12 — twelve rows
  // across four events, counted against v2 on 25 August 2026.
  const eventRowPattern = `waves for ${season} event ${eventNumber} —%`;

  return `-- --- wave gaps, one row per heat -------------------------------------
-- Emitted by scripts/lib/wave_gaps.ts. Do not edit here; edit there.
-- docs/findings/2026-08-25_wave_gap_heat_granularity.md

-- 1. Retire the event-scoped row. It is SUPERSEDED by the per-heat rows
--    below, not answered. Closing it says the event is no longer the grain
--    at which this absence is recorded; it says nothing about waves having
--    arrived. Unconditional for that reason.
UPDATE data_gaps SET closed_at = CURRENT_DATE
WHERE closed_at IS NULL
  AND field LIKE '${eventRowPattern}';

-- 2. Close the per-heat rows whose absence has ended.
UPDATE data_gaps SET closed_at = CURRENT_DATE
WHERE closed_at IS NULL
  AND scope = 'heat'
  AND field LIKE 'waves for %'
  AND scope_id IN (
    SELECT h.id
    FROM heats h
    JOIN rounds r ON r.id = h.round_id
    JOIN events e ON e.id = r.event_id
    WHERE ${scoped}
      AND EXISTS (
        SELECT 1 FROM heat_entries he
        JOIN waves w ON w.heat_entry_id = he.id
        WHERE he.heat_id = h.id));

-- 3. Open one row per heat whose absence is still true.
--    The heat is named by its WSL id, falling back to the internal id rather
--    than being skipped — a heat with no wsl_heat_id must still be recorded,
--    or the fix reintroduces the silence it exists to remove.
--    source_note is computed per heat, so a popup that IS retained is
--    described as held back rather than as uncollected.
INSERT INTO data_gaps (scope, scope_id, season_year, field, reason, source_note)
SELECT
  'heat',
  h.id,
  e.season_year,
  'waves for ' || e.season_year || ' event ' || e.event_number
    || ' heat ' || COALESCE(h.wsl_heat_id, 'id:' || h.id) || ' —',
  'This heat holds no waves. Rounds 1-2 publish the counting pair on the Tier 1 results page, but waves.wave_order is NOT NULL and that pair is ordered by score rather than chronology, so writing it would record rank as if it were ride order. Rounds 3-7 publish no pair at all. The Tier 2 heat-detail popup carries every ride in chronological order, which ride counted, and the heat conditions.',
  CASE WHEN EXISTS (
         SELECT 1 FROM artefacts a
         WHERE strpos(a.file_path, '_heat_' || h.wsl_heat_id || '_popup') > 0)
       THEN 'The popup for this heat IS retained and registered — artefacts.file_path contains _heat_' || h.wsl_heat_id || '_popup. It is held back, not missing: docs/findings/2026-08-20_abu_dhabi_wave_order_collision.md.'
       ELSE 'No popup retained for this heat. Collect with scripts/collect_heat_popups.ts --season ' || e.season_year || ' --event ' || e.event_number || ', then apply the Tier 2 seed for this event.'
  END
FROM heats h
JOIN rounds r ON r.id = h.round_id
JOIN events e ON e.id = r.event_id
WHERE ${scoped}
  AND NOT EXISTS (
    SELECT 1 FROM heat_entries he
    JOIN waves w ON w.heat_entry_id = he.id
    WHERE he.heat_id = h.id)
  AND NOT EXISTS (
    SELECT 1 FROM data_gaps d
    WHERE d.scope = 'heat'
      AND d.scope_id = h.id
      AND d.field LIKE 'waves for %'
      AND d.closed_at IS NULL);
`;
}
