#!/usr/bin/env tsx
/**
 * ingest_popups.ts — retained Tier 2 popups to reviewable SQL
 *
 * Reads retained artefacts from disk. Never fetches. Never executes anything:
 * it writes a .sql file for Taryn to read and run. Rule 6.
 *
 * WHAT IT LOADS, AND WHAT TIER 1 ALREADY DID
 *
 *   ingest_event.ts writes seasons, events, rounds, heats, surfers and
 *   heat_entries from the results pages, and deliberately writes NO waves —
 *   the Tier 1 counting pair is ordered by score, `waves.wave_order` means ride
 *   order, and writing one as the other records rank as chronology (trap 15).
 *   It opened a data_gaps row saying so.
 *
 *   This script closes that gap. The popup publishes `.wave-number`, which IS
 *   the chronological ordinal, so the pair can be written as it happened.
 *
 *   Three things land:
 *     waves          one row per ride, `counted` read from the markup
 *     heats          the four published conditions columns, null on 141 of 141
 *     data_gaps      the waves gap closed, orientation opened honestly
 *
 * WHAT IT DOES NOT LOAD, DELIBERATELY
 *
 *   event_entries — needs points, and points come from the rankings page, not
 *   from a heat popup. Deriving them from placings awards points to wildcards
 *   who earned none, which is the v1 failure shape. Its data_gaps row stands.
 *
 *   interferences — the popup does carry the penalty level and which ride was
 *   zeroed, so this is now collectable and its gap is upgradeable. But
 *   parse_popup.ts does not read those fields yet, and a table half-filled from
 *   a parser that was not written for it is worse than an honest gap. Its
 *   data_gaps row stands, with a note that the source is now held.
 *
 *   waves.orientation — left/right is not published in the popup. New gap.
 *
 * THE CHECK THIS ENABLES, WHICH NOTHING BEFORE COULD DO
 *
 *   `heat_entries.heat_total` came from Tier 1. `waves` comes from Tier 2 —
 *   a different page, collected by a different tool, on a different day. The
 *   generated SQL asserts, in the database, that every entry's counted rides
 *   sum to the heat total it already holds.
 *
 *   That is not the popup checking itself, which parse_popup.ts already does.
 *   It is TWO INDEPENDENTLY COLLECTED SOURCES agreeing, row by row, and it is
 *   the strongest statement this project has been able to make about its data.
 *   If it fails, the transaction does not commit.
 *
 * Usage:
 *   tsx scripts/ingest_popups.ts --season 2025 --event 1
 *   node --experimental-strip-types scripts/ingest_popups.ts --season 2025 --event 1
 *
 * Then read the SQL, then run it yourself.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT, fail } from "./lib/retain.ts";
import { loadEventManifest } from "./lib/manifest.ts";
import { parsePopup, type ParsedPopup } from "./lib/parse_popup.ts";
import { waveGapSql } from "./lib/wave_gaps.ts";

const SCRIPT_NAME = "scripts/ingest_popups.ts";
const SEED_DIR = join(REPO_ROOT, "supabase/seeds");
const MANIFEST_DIR = join(REPO_ROOT, "docs/sources/manifests");

interface Args {
  season: number;
  event: number;
}

function parseArgs(argv: string[]): Args {
  let season: number | null = null;
  let event: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--season") season = Number(argv[++i]);
    else if (a === "--event") event = Number(argv[++i]);
    else fail(`unrecognised argument: ${a}`);
  }
  if (season === null || !Number.isInteger(season)) fail("--season <year> is required");
  if (event === null || !Number.isInteger(event)) fail("--event <event number> is required");
  return { season: season!, event: event! };
}

/** SQL string literal, or NULL. Single quotes doubled, never concatenated raw. */
function q(v: string | null): string {
  return v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
}

/** SQL numeric literal, or NULL. */
function n(v: number | null): string {
  return v === null ? "NULL" : String(v);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const ev = loadEventManifest(args.season, args.event);

  // ---- read the popup manifest, not the directory -----------------------
  // The manifest is the index of what was collected and is rebuilt from disk
  // on every collection run. Reading the directory instead would pick up any
  // stray file that happens to match the name pattern.
  const manifestPath = join(MANIFEST_DIR, `${ev.stem}_popups.json`);
  let manifest: { popups?: { heat_id: string; sha256: string; file_path: string }[] };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof manifest;
  } catch {
    return fail(
      `no popup manifest at ${relative(REPO_ROOT, manifestPath)}.\n` +
        `  Collect first: npm run collect-popups -- --season ${args.season} --event ${args.event}`,
    );
  }
  const entries = manifest.popups ?? [];
  if (entries.length === 0) fail(`${relative(REPO_ROOT, manifestPath)} lists no popups.`);

  console.log(`\n${args.season} CT event ${args.event} — ${ev.name}`);
  console.log(`  ${entries.length} popup(s) in the manifest`);

  // ---- parse everything, and refuse to emit if anything is off ----------
  const parsed: ParsedPopup[] = [];
  const badPopups: string[] = [];
  for (const e of entries) {
    const slug = `${ev.stem}_heat_${e.heat_id}_popup`;
    const p = parsePopup(slug);
    parsed.push(p);
    if (!p.consistent) {
      badPopups.push(
        `  heat ${p.wslHeatId}:\n` +
          p.checks.filter((c) => !c.ok).map((c) => `      ${c.name} — ${c.detail}`).join("\n"),
      );
    }
  }

  if (badPopups.length > 0) {
    fail(
      `${badPopups.length} popup(s) fail their own internal checks. Nothing generated.\n\n` +
        badPopups.join("\n") +
        `\n\n  These are the source disagreeing with itself. Do not load them and do not\n` +
        `  "fix" them by loosening a check — find out which reading is wrong first.`,
    );
  }

  // sha lookup by heat, from the manifest rather than recomputed: the manifest
  // is what register_artefacts.ts registered against.
  const shaByHeat = new Map<string, string>();
  for (const e of entries) shaByHeat.set(e.heat_id, e.sha256);

  // ---- rows ------------------------------------------------------------
  const waveRows: string[] = [];
  const waveKeys: string[] = [];
  const heatRows: string[] = [];
  let rides = 0;
  let countedRides = 0;
  const entriesWithoutPair: string[] = [];

  for (const p of parsed) {
    const heatId = p.wslHeatId;
    if (heatId === null) fail(`a parsed popup carries no heat id. Refusing to guess which heat it is.`);
    const sha = shaByHeat.get(heatId);
    if (sha === undefined) fail(`heat ${heatId} parsed but is not in the manifest.`);

    const c = p.conditions;
    heatRows.push(
      `  (${q(heatId)}, ${n(c.waveHeightMinFt)}, ${n(c.waveHeightMaxFt)}, ` +
        `${q(c.waveRangePublished)}, ${q(c.windConditions)}, ` +
        `${n(c.publishedWaveCount)}, ${n(c.publishedAvgHeatScore)})`,
    );

    for (const r of p.rides) {
      rides++;
      if (r.counted) countedRides++;
      // The natural key the database enforces, kept in parallel with the SQL
      // row so the collision guard below can test it before anything is
      // written. waves is UNIQUE on (heat_entry_id, wave_order), and
      // heat_entry is (heat, athlete).
      waveKeys.push(`heat ${heatId} athlete ${r.wslAthleteId} wave_order ${r.waveOrder}`);
      waveRows.push(
        `  (${q(heatId)}, ${q(r.wslAthleteId)}, ${r.waveOrder}, ${r.score}, ` +
          `${r.counted ? "true" : "false"}, ${q(sha)})`,
      );
    }

    // Counted rides must equal min(2, rides ridden). Two is a maximum, not a
    // minimum: a surfer who caught one wave has a heat total of that one wave.
    // SEVEN such records exist across 2024 and 2025, counted from v2 on
    // 25 August — this comment said four, which was written before both
    // seasons were fully loaded and was never recounted. In all seven,
    // heat_total equals the single ride's score, so nothing is missing.
    for (const a of p.athletes) {
      const ridden = p.rides.filter((r) => r.wslAthleteId === a.wslAthleteId).length;
      const counted = p.rides.filter((r) => r.wslAthleteId === a.wslAthleteId && r.counted).length;
      const expected = Math.min(2, ridden);
      // `counted === 0` was the same minimum-of-one assumption the comment above
      // disowns, one step further down. An athlete who rode NOTHING has nothing
      // counted, and that is correct: 2025 event 6 heat 106361, Ryan Callinan,
      // the only such record in 712 retained popups. The guard's real target is
      // an athlete who DID ride and has no counted wave -- a parse failure --
      // and that still fires.
      if (counted !== expected || (counted === 0 && ridden > 0)) {
        entriesWithoutPair.push(
          `heat ${heatId} athlete ${a.wslAthleteId}: ${counted} counted of ${ridden} ridden, expected ${expected}`,
        );
      }
    }
  }

  if (entriesWithoutPair.length > 0) {
    fail(
      `${entriesWithoutPair.length} athlete-heat record(s) do not carry exactly two counted rides:\n` +
        entriesWithoutPair.map((s) => `    ${s}`).join("\n") +
        `\n\n  Rulebook 10.05(c) sets a MAXIMUM of two counting waves. One counted ride\n` +
        `  is correct when the surfer caught one; three, or fewer than were ridden,\n` +
        `  is a parse failure or a non-standard round. Nothing generated.`,
    );
  }

  // Athlete-heat records the popup shows with no rides at all. Named
  // explicitly in the orphan-entry assertion below rather than loosening it.
  const rideless: Array<[string, string]> = [];
  for (const p of parsed) {
    if (p.wslHeatId === null) continue;
    for (const a of p.athletes) {
      if (p.rides.some((r) => r.wslAthleteId === a.wslAthleteId)) continue;
      rideless.push([p.wslHeatId, a.wslAthleteId]);
    }
  }
  if (rideless.length > 0) {
    console.log(
      `  ${rideless.length} athlete-heat record(s) rode nothing: ` +
        rideless.map(([h2, a2]) => `heat ${h2} athlete ${a2}`).join(", "),
    );
  }

  // ---- REFUSE A SEED THAT CANNOT LOAD --------------------------------
  //
  // waves is UNIQUE on (heat_entry_id, wave_order) and the insert is
  // ON CONFLICT DO NOTHING, so a duplicated key does not error — it is
  // silently dropped, and only the row-count assertion at the bottom of the
  // seed catches the shortfall. That is a guard firing at apply time, on
  // production, at the end of a psql loop. It should never get that far.
  //
  // FOUND THE HARD WAY, TWICE. 2025 event 2 (Surf Abu Dhabi) is the wave
  // pool: its popup labels rides R1, L1, R2, L2 — right and left, set one and
  // set two — and parse_popup.ts reads the digit and discards the letter, so
  // R1 and L1 both become wave_order 1. 144 rides collapse to 72 keys, each
  // used twice. The seed was generated on 19 August, refused to load on
  // 20 August, was regenerated unchanged, and aborted a production apply
  // again on 25 August because a `for f in popups_*.sql` loop cannot know
  // which of its files is the poisoned one.
  //
  // Writing the finding down did not stop it. Refusing at the generator does.
  // Same pattern as ingest_event.ts refusing format: finals_five.
  //
  // The test is STRUCTURAL, not a check for R/L. Any future page shape that
  // produces two rides with the same key is caught by the same guard.
  {
    const seen = new Map<string, number>();
    for (const k of waveKeys) seen.set(k, (seen.get(k) ?? 0) + 1);
    const collisions = [...seen.entries()].filter(([, n]) => n > 1);
    if (collisions.length > 0) {
      const stub = refusalStub(args.season, args.event, ev.name, waveKeys.length, seen.size, collisions);
      mkdirSync(SEED_DIR, { recursive: true });
      const outPath = join(SEED_DIR, `popups_${ev.stem.replace(/_results$/, "")}.sql`);
      writeFileSync(outPath, stub);
      console.error(
        `\nREFUSED: ${collisions.length} duplicate (heat, athlete, wave_order) key(s) — ` +
          `${waveKeys.length} rides collapse to ${seen.size} keys.\n` +
          `  waves is UNIQUE on (heat_entry_id, wave_order); this seed would silently\n` +
          `  drop ${waveKeys.length - seen.size} rides and abort on its own assertion.\n` +
          `  docs/findings/2026-08-20_abu_dhabi_wave_order_collision.md\n` +
          `  A refusal stub was written to ${relative(REPO_ROOT, outPath)}, so a\n` +
          `  popups_*.sql loop stays safe. Nothing loadable was generated.\n`,
      );
      process.exit(3);
    }
  }

  const distinctShas = [...new Set(shaByHeat.values())].sort();
  const heatCount = parsed.length;
  const athleteHeatRecords = parsed.reduce((t, p) => t + p.athletes.length, 0);

  console.log(`  ${heatCount} heats · ${rides} rides · ${countedRides} counted · ${athleteHeatRecords} athlete-heat records`);

  // ---- the SQL ---------------------------------------------------------
  const stamp = new Date().toISOString();
  const sql = `-- =====================================================================
-- Tier 2: waves and heat conditions for ${args.season} CT event ${args.event} — ${ev.name}
-- Generated by ${SCRIPT_NAME} on ${stamp}
-- =====================================================================
--
-- Rule 6: review this, then run it yourself. Claude does not execute it.
--
-- Source: ${heatCount} retained heat-detail popups, listed in
-- ${relative(REPO_ROOT, manifestPath)}. Serialised DOM, not wire bytes —
-- retrieval = script_browser_dom, permitted by migration 00000000000009.
--
-- Idempotent. waves is keyed on (heat_entry_id, wave_order) and inserts with
-- ON CONFLICT DO NOTHING; the heats update is a straight assignment of the
-- same values. Re-running changes nothing.
--
-- PRECONDITION: supabase/seeds/artefacts_retained.sql must have been run, so
-- the ${distinctShas.length} popup artefacts below exist. The preflight block aborts if not.
--
-- Rows: ${rides} waves (${countedRides} counted), ${heatCount} heats updated with conditions.
--
-- WAVE ORDER IS RIDE ORDER HERE. Tier 1 could not write these because it
-- publishes the counting pair sorted by score — Dora's "4.53 + 4.00" are rides
-- 7 and 5. \`.wave-number\` in the popup is the chronological ordinal, so
-- wave_order below means what the column says it means. CLAUDE.md trap 15.
--
-- \`counted\` IS READ FROM THE MARKUP, never derived by taking the best two.
-- Trap 14: where an interference penalty applies, the best two rides are not
-- the counting two. The popup marks the real pair with .wave--counted and that
-- mark is what is stored. The cross-source assertion at the foot is what proves
-- the mark was read correctly — a "best two" derivation would fail it on
-- exactly the heats where it matters.
-- =====================================================================

BEGIN;

-- --- preflight -------------------------------------------------------
-- Abort loudly rather than insert a row whose provenance is missing.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(x.sha, ', ') INTO missing
  FROM (VALUES
${distinctShas.map((s) => `    ('${s}')`).join(",\n")}
  ) AS x(sha)
  WHERE NOT EXISTS (SELECT 1 FROM artefacts a WHERE a.sha256 = x.sha);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Unregistered artefact sha256: %. Run: npm run register-artefacts, review, then run supabase/seeds/artefacts_retained.sql.', missing;
  END IF;
END $$;

-- --- heat conditions -------------------------------------------------
-- Published on the popup's stat bar and read by class modifier, not by
-- position. Null on every heat in the database until now.
UPDATE heats h SET
  wave_height_min_ft       = v.min_ft,
  wave_height_max_ft       = v.max_ft,
  wave_height_published    = v.published,
  wind_conditions          = v.wind,
  published_wave_count     = v.wave_count,
  published_avg_heat_score = v.avg_score
FROM (VALUES
${heatRows.join(",\n")}
) AS v(wsl_heat_id, min_ft, max_ft, published, wind, wave_count, avg_score)
WHERE h.wsl_heat_id = v.wsl_heat_id
  AND h.round_id IN (
    SELECT r.id FROM rounds r
    JOIN events e ON e.id = r.event_id
    WHERE e.season_year = ${args.season} AND e.event_number = ${args.event}
  );

-- --- waves -----------------------------------------------------------
-- One row per RIDE, not per counting wave. orientation stays null: the popup
-- does not publish left/right. See the data_gaps row below.
INSERT INTO waves (heat_entry_id, wave_order, score, counted, artefact_id)
SELECT he.id, v.wave_order, v.score, v.counted, a.id
FROM (VALUES
${waveRows.join(",\n")}
) AS v(wsl_heat_id, wsl_athlete_id, wave_order, score, counted, sha)
JOIN events e ON e.season_year = ${args.season} AND e.event_number = ${args.event}
JOIN rounds r ON r.event_id = e.id
JOIN heats h ON h.round_id = r.id AND h.wsl_heat_id = v.wsl_heat_id
JOIN surfers s ON s.wsl_athlete_id = v.wsl_athlete_id
JOIN heat_entries he ON he.heat_id = h.id AND he.surfer_id = s.id
JOIN artefacts a ON a.sha256 = v.sha
ON CONFLICT (heat_entry_id, wave_order) DO NOTHING;

-- --- gaps ------------------------------------------------------------
-- SUPERSEDED 25 August 2026. This block used to close the event-scoped wave
-- row unconditionally on a prefix match, with no test of whether the absence
-- was still true. That is the granularity defect: 13 popups loaded against 47
-- heats closed the whole event, and the 34 heats still holding nothing became
-- silent. The wave gap is now maintained per heat by scripts/lib/wave_gaps.ts,
-- which both generators emit, and the statements below are computed in SQL at
-- write time in both directions.
${waveGapSql(args.season, args.event)}
-- Open what Tier 2 still cannot answer.
INSERT INTO data_gaps (scope, season_year, field, reason, source_note)
SELECT v.scope, v.yr, v.field, v.reason, v.note FROM (VALUES
  ('event', ${args.season}, 'waves.orientation for ${args.season} event ${args.event}', 'The heat-detail popup publishes each ride''s score, its chronological position and whether it counted. It does not publish which way the wave broke. waves.orientation is constrained to left/right and stays null rather than being inferred from the break.', 'Not published on any page shape collected so far. Pipeline breaks both ways, so a venue-level default would be wrong here specifically.'),
  ('event', ${args.season}, 'interferences detail for ${args.season} event ${args.event}', 'The interferences table stays empty. The source is now held — the retained popups carry the penalty and the affected ride — but scripts/lib/parse_popup.ts does not read those fields, and filling a table from a parser not written for it is worse than an honest gap. Upgraded from "not published" to "held but not parsed".', 'docs/sources/raw/${ev.stem}_heat_*_popup.html. Add interference parsing to parse_popup.ts with its own controls before writing this table.')
) AS v(scope, yr, field, reason, note)
WHERE NOT EXISTS (SELECT 1 FROM data_gaps d WHERE d.field = v.field AND d.closed_at IS NULL);

-- --- assertions ------------------------------------------------------
-- Counted from the retained popups by ${SCRIPT_NAME}. If the database
-- disagrees, this transaction must not commit.
DO $$
DECLARE
  r_waves int; r_counted int; r_conditions int; r_heats int;
  bad_totals int; orphan_entries int; bad_pair int;
BEGIN
  SELECT count(*) INTO r_waves FROM waves w
    JOIN heat_entries he ON he.id = w.heat_entry_id JOIN heats h ON h.id = he.heat_id
    JOIN rounds r ON r.id = h.round_id JOIN events e ON e.id = r.event_id
    WHERE e.season_year = ${args.season} AND e.event_number = ${args.event};

  SELECT count(*) INTO r_counted FROM waves w
    JOIN heat_entries he ON he.id = w.heat_entry_id JOIN heats h ON h.id = he.heat_id
    JOIN rounds r ON r.id = h.round_id JOIN events e ON e.id = r.event_id
    WHERE e.season_year = ${args.season} AND e.event_number = ${args.event} AND w.counted;

  SELECT count(*), count(*) FILTER (WHERE h.published_wave_count IS NOT NULL)
    INTO r_heats, r_conditions
    FROM heats h JOIN rounds r ON r.id = h.round_id JOIN events e ON e.id = r.event_id
    WHERE e.season_year = ${args.season} AND e.event_number = ${args.event};

  -- THE CROSS-SOURCE CHECK. heat_total came from the Tier 1 results page;
  -- these waves came from the Tier 2 popup, a different page collected by a
  -- different tool. Nothing but the sport itself makes them agree.
  SELECT count(*) INTO bad_totals FROM (
    SELECT he.id
    FROM heat_entries he
    JOIN heats h ON h.id = he.heat_id JOIN rounds r ON r.id = h.round_id
    JOIN events e ON e.id = r.event_id
    JOIN waves w ON w.heat_entry_id = he.id AND w.counted
    WHERE e.season_year = ${args.season} AND e.event_number = ${args.event}
    GROUP BY he.id, he.heat_total
    HAVING round(sum(w.score), 2) <> he.heat_total
  ) t;

  -- Counting rides must equal least(2, rides ridden). Two is the rulebook
  -- maximum, not a minimum — a surfer who caught one wave counts one.
  SELECT count(*) INTO bad_pair FROM (
    SELECT he.id FROM heat_entries he
    JOIN heats h ON h.id = he.heat_id JOIN rounds r ON r.id = h.round_id
    JOIN events e ON e.id = r.event_id
    JOIN waves w ON w.heat_entry_id = he.id
    WHERE e.season_year = ${args.season} AND e.event_number = ${args.event}
      AND h.wsl_heat_id IN (${parsed.map((p) => `'${p.wslHeatId}'`).join(", ")})
    GROUP BY he.id
    HAVING count(*) FILTER (WHERE w.counted) <> least(2, count(*))
  ) t;

  -- A heat entry with no waves at all after this ran means a join failed
  -- silently — a surfer id or heat id in the popup that Tier 1 never loaded.
  -- Scoped to heats named in this file. On a partial event the uncollected
  -- heats legitimately have no waves; an entry with no waves in a heat we DID
  -- collect means a join matched nothing, which is the real failure.
  --
  -- EXCEPT for an athlete the popup itself shows riding nothing. 2025 event 6
  -- heat 106361: Ryan Callinan is in the heat, takes no wave, has no heat
  -- total. His entry legitimately gets no wave rows. The pairs below are
  -- named ONE BY ONE from the retained popups rather than the check being
  -- relaxed, so a genuine join failure — an entry with no waves that is NOT
  -- on this list — still fires.
  SELECT count(*) INTO orphan_entries FROM heat_entries he
    JOIN heats h ON h.id = he.heat_id JOIN rounds r ON r.id = h.round_id
    JOIN events e ON e.id = r.event_id
${rideless.length > 0 ? `    JOIN surfers s ON s.id = he.surfer_id\n` : ``}\
    WHERE e.season_year = ${args.season} AND e.event_number = ${args.event}
      AND h.wsl_heat_id IN (${parsed.map((p) => `'${p.wslHeatId}'`).join(", ")})
      AND NOT EXISTS (SELECT 1 FROM waves w WHERE w.heat_entry_id = he.id)${
        rideless.length > 0
          ? `\n      AND (h.wsl_heat_id, s.wsl_athlete_id) NOT IN (${rideless
              .map(([h2, a2]) => `('${h2}', '${a2}')`)
              .join(", ")})`
          : ``
      };

  IF r_waves   <> ${rides} THEN RAISE EXCEPTION 'waves: expected ${rides}, got %', r_waves; END IF;
  IF r_counted <> ${countedRides} THEN RAISE EXCEPTION 'counted waves: expected ${countedRides}, got %', r_counted; END IF;
  -- Against the number of popups held, NOT the event's heat count. An event
  -- collected in part is a legitimate state — 2024 event 1 holds 12 of 47 —
  -- and the honest assertion is that every heat we have a popup for got its
  -- conditions, not that every heat in the event did. The shortfall is reported
  -- and recorded as a data_gaps row rather than blocking the load.
  IF r_conditions < ${heatCount} THEN
    RAISE EXCEPTION 'conditions: % heats carry a published wave count, expected at least ${heatCount} (one per retained popup)', r_conditions;
  END IF;
  IF r_conditions <> r_heats THEN
    RAISE NOTICE 'PARTIAL EVENT: % of % heats carry conditions. % heats have no popup retained yet.',
      r_conditions, r_heats, r_heats - r_conditions;
  END IF;
  IF orphan_entries > 0 THEN
    RAISE EXCEPTION '% heat entries got no waves. A join matched nothing — check surfer and heat ids.', orphan_entries;
  END IF;
  IF bad_pair > 0 THEN
    RAISE EXCEPTION '% heat entries do not carry least(2, rides) counted waves.', bad_pair;
  END IF;
  IF bad_totals > 0 THEN
    RAISE EXCEPTION 'CROSS-SOURCE MISMATCH: % heat entries where the Tier 2 counted rides do not sum to the Tier 1 heat total. Do not load. Find out which source is wrong.', bad_totals;
  END IF;

  RAISE NOTICE 'OK: % waves (% counted) across % heats, conditions on % of %, and every counted pair sums to the Tier 1 heat total.',
    r_waves, r_counted, r_heats, r_conditions, r_heats;
END $$;

COMMIT;
`;

  mkdirSync(SEED_DIR, { recursive: true });
  const slug = ev.stem.replace(/_results$/, "");
  const outPath = join(SEED_DIR, `popups_${slug}.sql`);
  writeFileSync(outPath, sql);

  console.log(`\n  -> ${relative(REPO_ROOT, outPath)}`);
  console.log(`\n  Read it, then run it yourself. Claude does not execute it.\n`);
}

/**
 * A seed that is SAFE TO RUN and loads nothing.
 *
 * The alternative — leaving the last good-looking seed on disk, or deleting it
 * — either poisons a `for f in popups_*.sql` loop or leaves a hole nobody can
 * see. This file runs, says why, changes nothing, and lets the loop continue.
 */
function refusalStub(
  season: number,
  event: number,
  eventName: string,
  rides: number,
  keys: number,
  collisions: Array<[string, number]>,
): string {
  const sample = collisions
    .slice(0, 5)
    .map(([k, n]) => `--     ${k}  (x${n})`)
    .join("\n");
  return `-- =====================================================================
-- REFUSAL STUB — ${season} event ${event}, ${eventName}
-- Generated by ${SCRIPT_NAME} on ${new Date().toISOString()}
--
-- THIS SEED LOADS NOTHING, ON PURPOSE, AND IS SAFE TO RUN.
--
-- The retained popups for this event produce ${rides} rides that collapse to
-- ${keys} distinct (heat, athlete, wave_order) keys. waves is UNIQUE on
-- (heat_entry_id, wave_order), so ${rides - keys} rides would be dropped
-- silently by ON CONFLICT DO NOTHING and the seed would abort on its own
-- row-count assertion, part-way through a production apply.
--
-- First ${Math.min(5, collisions.length)} of ${collisions.length} colliding key(s):
${sample}
--
-- Owed before this event can load, in order:
--   1. parse_popup.ts must read wave-number as a LABEL, not an integer.
--   2. Decide what wave_order means in a pool. The true ride order is not
--      recoverable from the retained markup as currently read. Do not invent
--      one. This is a decision, not an implementation detail.
--   3. Only then regenerate and run.
--
-- docs/findings/2026-08-20_abu_dhabi_wave_order_collision.md
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE 'SKIPPED ${season} event ${event} (${eventName}): wave_order collision, % rides to % keys. Nothing loaded. See docs/findings/2026-08-20_abu_dhabi_wave_order_collision.md', ${rides}, ${keys};
END $$;
`;
}

main();
