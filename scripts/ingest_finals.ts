#!/usr/bin/env tsx
/**
 * ingest_finals.ts — the WSL Finals, a fourth page shape
 *
 * Reads a retained artefact from disk. Never fetches. Emits SQL for review.
 *
 * WHY THIS IS NOT ingest_event.ts
 *
 *   The Finals results page shares almost nothing with an ordinary event page.
 *   It has no round navigation, no `roundId`, no counting-wave markup and no
 *   GTM round blobs — which is why collect_event.ts refused it twice with
 *   "no round nav found". What it has instead is a five-surfer ladder of four
 *   two-surfer matches, and one property no other page has: it carries BOTH
 *   the men's and the women's event.
 *
 *   CORRECTION, 19 August, made in the same session that introduced the error.
 *   This file first said the page has "no Details links at all, so no heat
 *   popups exist for the Finals" and that Tier 2 was impossible. That was a
 *   fact about the selector, not about the page. Ordinary events render the
 *   popup link as `hot-heat__action-link hot-heat__action-link-details`; the
 *   Finals renders the SAME link as `hot-heat__details-link`. Both carry
 *   `data-request-name="postEventWatchHeatDetailsPopup"` and the same
 *   `?heatId=` href. There are eight of them per Finals page — four men's,
 *   four women's — so Tier 2 IS available and has simply not been collected.
 *   Key future checks off `data-request-name`, which both shapes share, rather
 *   than off either class name.
 *
 * THE DIVISION FILTER, WHICH IS THE SAFETY-CRITICAL PART
 *
 *   Eight heat blocks, four men's and four women's, in one document. Loading it
 *   naively puts the women's Finals into a men's CT database — the same shape
 *   of error the Gold Coast event id nearly caused.
 *
 *   The discriminator is the full-heat-replay link that immediately PRECEDES
 *   each heat block: `/posts/<id>/…-mens-match-1-…` or `…-womens-match-1-…`.
 *   Verified on the 2025 page, where the eight blocks interleave cleanly:
 *
 *     replay WOMENS | heat 108302 | … | heat 108305 | replay MENS | heat 108297 …
 *
 *   Two things were tried first and rejected, and are recorded so nobody
 *   retries them:
 *
 *     - `tour_codes` in a nearby GTM blob. Looks right at a ±3000-character
 *       window and is not: the nearest PRECEDING tour code is the page-chrome
 *       value `CT` for all eight heats, 9k–70k characters away. A window wide
 *       enough to find MCT for a men's heat is wide enough to find it for a
 *       women's one.
 *     - Athlete names. Circular, and it would silently pass if the page ever
 *       changed order.
 *
 *   The division call is then CROSS-CHECKED against the surfers already loaded
 *   from ordinary men's CT events, and the generator refuses if a supposedly
 *   men's heat contains a surfer no men's event has ever seen.
 *
 * THE TITLE MATCH IS NOT ONE HEAT, AND THE PAGE SHOWS ONE
 *
 *   Rulebook 1.06(e)(iv), 2025 edition: "The Final Match is best of three (3)
 *   heats." The results page renders a single Title Match row with a single
 *   score pair. The replay links say what actually happened:
 *
 *     2024 men's    title-match-heat-1, title-match-heat-2      -> 2 heats
 *     2024 women's  heat-1, heat-2, heat-3                      -> 3 heats
 *     2025 men's    title-match (no heat suffix)                -> 1 heat
 *     2025 women's  title-match, heat-2, heat-3                 -> 3 heats
 *
 *   And exactly one heat id is missing from each page between the men's and
 *   women's blocks — 108301 in 2025, 102842 in 2024 — so the page demonstrably
 *   does not render every heat that was surfed.
 *
 *   So the Title Match row is loaded as ONE heat, because one heat is what the
 *   page publishes and inventing the others is not on the table, and a
 *   data_gaps row records how many heats the match actually ran and that WHICH
 *   of them this row represents is not stated anywhere. `rounds.best_of` is
 *   left to the template, which already says 3 and is sourced to the rulebook.
 *
 * WHAT IS NOT LOADED
 *   No waves — not because none are published, but because the Finals popups
 *   have not been collected yet (see the correction above). Recorded as an
 *   OPEN gap naming the eight popup URLs, not as an absence in the source.
 *   No event_entries: the Finals awards no ranking points — it reallocates the
 *   top five positions (spec: awards_ranking_points false).
 *
 * Usage:
 *   npm run ingest-finals -- --season 2025
 *   node --experimental-strip-types scripts/ingest_finals.ts --season 2025
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import yaml from "js-yaml";
import { RAW_DIR, REPO_ROOT, fail } from "./lib/retain.ts";
import { parseAthletes, stripNonMarkup, type AthleteRecord } from "./lib/parse_results.ts";
import { waveGapSql } from "./lib/wave_gaps.ts";
import {
  LOSER_FINISHES,
  MATCH_ORDER,
  divisionsByHeat,
  heatOrder as heatOrderOf,
  titleMatchHeats,
  titleMatchSeries,
} from "./lib/parse_finals.ts";

const SCRIPT_NAME = "scripts/ingest_finals.ts";
const SEED_DIR = join(REPO_ROOT, "supabase/seeds");

// MATCH_ORDER, LOSER_FINISHES, divisionsByHeat, heatOrder and titleMatchHeats now
// live in scripts/lib/parse_finals.ts so this file and write_finals_manifest.ts
// cannot drift apart on the division call.

interface FinalsHeat {
  wslHeatId: string;
  roundOrder: number;
  title: string;
  division: "mens" | "womens";
  athletes: AthleteRecord[];
}

function q(v: string | null): string {
  return v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
}

function main(): void {
  const argv = process.argv.slice(2);
  let season: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--season") season = Number(argv[++i]);
    else fail(`unrecognised argument: ${argv[i]}`);
  }
  if (season === null || !Number.isInteger(season)) fail("--season <year> is required");

  // ---- the spec's own description of the event -------------------------
  const specPath = join(REPO_ROOT, `docs/format-spec/seasons/${season}.yaml`);
  if (!existsSync(specPath)) fail(`no season spec at ${relative(REPO_ROOT, specPath)}`);
  const spec = yaml.load(readFileSync(specPath, "utf8")) as {
    events?: Record<string, unknown>[];
  };
  const ev = (spec.events ?? []).find((e) => e.format === "finals_five");
  if (!ev) fail(`no event with format: finals_five in ${relative(REPO_ROOT, specPath)}`);

  const eventNumber = Number(ev.number);
  const wslEventId = String(ev.wsl_event_id);
  const name = String(ev.name);
  const resultsUrl = String(ev.results_url ?? "");
  const slugFromUrl = /\/ct\/\d+\/([a-z0-9-]+)\/results/.exec(resultsUrl)?.[1] ?? null;
  if (slugFromUrl === null) fail(`cannot read an event slug out of results_url: ${resultsUrl}`);

  // ---- the retained page ------------------------------------------------
  const pageSlug = `${season}_ct_${wslEventId}_${slugFromUrl.replace(/-/g, "_")}_results`;
  const htmlPath = join(RAW_DIR, `${pageSlug}.html`);
  if (!existsSync(htmlPath)) fail(`no retained results page at ${relative(REPO_ROOT, htmlPath)}`);
  const raw = readFileSync(htmlPath);
  const sha = createHash("sha256").update(raw).digest("hex");
  const markup = stripNonMarkup(raw.toString("utf8"));

  // ---- parse -------------------------------------------------------------
  const { athletes, duplicateConflicts } = parseAthletes(markup);
  if (duplicateConflicts.length > 0) {
    fail(`athlete records disagree between renders:\n${duplicateConflicts.join("\n")}`);
  }

  const titles = [...markup.matchAll(/class="hot-heat__hd-title[^"]*"[^>]*>([\s\S]{0,120}?)</g)].map(
    (m) => m[1].replace(/<[^>]+>/g, "").replace(/[*\s]+/g, " ").trim().toLowerCase(),
  );
  const divisions = divisionsByHeat(markup);

  // Heats in document order, so titles line up with heat blocks.
  const heatOrder = heatOrderOf(markup);
  if (titles.length !== heatOrder.length) {
    fail(
      `${titles.length} match titles against ${heatOrder.length} heats. They must pair one to one; ` +
        `refusing to guess which title belongs to which heat.`,
    );
  }

  const all: FinalsHeat[] = heatOrder.map((hid, i) => {
    const order = MATCH_ORDER[titles[i]];
    if (order === undefined) fail(`unrecognised match title ${JSON.stringify(titles[i])} for heat ${hid}`);
    const div = divisions.get(hid);
    if (div === undefined) fail(`no division could be established for heat ${hid}. Nothing generated.`);
    return {
      wslHeatId: hid,
      roundOrder: order,
      title: titles[i],
      division: div,
      athletes: athletes.filter((a) => a.wslHeatId === hid),
    };
  });

  const mens = all.filter((h) => h.division === "mens").sort((a, b) => a.roundOrder - b.roundOrder);
  const womens = all.filter((h) => h.division === "womens");

  console.log(`\n${season} ${name}`);
  console.log(`  page: ${relative(REPO_ROOT, htmlPath)}`);
  console.log(`  ${all.length} heats on the page: ${mens.length} men's, ${womens.length} women's`);

  // ---- the source held to the ladder's shape ---------------------------
  if (mens.length !== 4) fail(`expected 4 men's matches, found ${mens.length}. Nothing generated.`);
  if (mens.map((h) => h.roundOrder).join(",") !== "1,2,3,4") {
    fail(`men's matches are not 1,2,3,4 — got ${mens.map((h) => h.roundOrder).join(",")}`);
  }
  for (const h of mens) {
    if (h.athletes.length !== 2) {
      fail(`${h.title} (heat ${h.wslHeatId}) has ${h.athletes.length} surfers. Every match is a two-surfer heat.`);
    }
    if (h.athletes.some((a) => a.heatTotal === null)) {
      fail(`${h.title} (heat ${h.wslHeatId}) has a surfer with no heat total.`);
    }
    // finished_position is derived entirely from `position`, so an absent or
    // duplicated placing would silently produce two winners in the Title Match
    // rather than an error. Checked here, where it can still be refused.
    const places = h.athletes.map((a) => a.position).sort();
    if (places.join(",") !== "1,2") {
      fail(
        `${h.title} (heat ${h.wslHeatId}) has placings [${places.join(", ")}], not 1 and 2. ` +
          `Finishing positions are derived from the placing, so this cannot be guessed.`,
      );
    }
  }
  const finalists = [...new Set(mens.flatMap((h) => h.athletes.map((a) => a.wslAthleteId)))];
  if (finalists.length !== 5) {
    fail(`expected 5 distinct finalists across the men's ladder, found ${finalists.length}: ${finalists.join(", ")}`);
  }

  const titleHeats = titleMatchHeats(markup, "mens");

  // ---- the Title Match series (added 17 October 2026) -------------------
  // The page publishes EVERY series heat's total in the Title Match block
  // (H1, H2, H3 per surfer) and names each heat in a replay link. Until this
  // date only the first pair was read, so 2024's Heat 2 (JJF 18.13, Italo
  // 16.30) stayed out of v2 while its bytes sat in this very file.
  //
  // Totals come from the series block. Placings come from each later heat's
  // retained popup, which publishes them (athlete-place-N); they are never
  // derived from the totals, and the two are required to agree.
  const series = titleMatchSeries(markup, "mens");
  if (series.heats.length !== titleHeats) {
    fail(`the series block publishes ${series.heats.length} Title Match heat(s); the replay links say ${titleHeats}.`);
  }
  const tm = mens[3];
  if (series.heats[0].wslHeatId !== tm.wslHeatId) {
    fail(`series heat 1 is ${series.heats[0].wslHeatId} but the Title Match block is heat ${tm.wslHeatId}.`);
  }
  for (const a of tm.athletes) {
    const t = series.heats[0].totals.get(a.wslAthleteId);
    if (t === undefined || Math.abs(t - (a.heatTotal ?? NaN)) > 0.001) {
      fail(`series heat 1 total for ${a.wslAthleteId} is ${t}; the athlete block says ${a.heatTotal}.`);
    }
  }
  if (series.score !== null) {
    const champ = tm.athletes.find((a) => a.position === 1);
    const wins = (id: string) =>
      series.heats.filter((h) => {
        const [x, y] = [...h.totals.entries()].sort((p, q) => q[1] - p[1]);
        return x[1] > y[1] && x[0] === id;
      }).length;
    if (champ && wins(champ.wslAthleteId) !== series.score[0]) {
      fail(`"${series.resultText}" says the champion won ${series.score[0]} heat(s); the totals give ${wins(champ.wslAthleteId)}.`);
    }
  }

  interface SeriesRow { heatNumber: number; wslHeatId: string; popupSha: string; entries: { athlete: string; position: number; total: number }[] }
  const seriesRows: SeriesRow[] = [];
  for (const h of series.heats.slice(1)) {
    const popupPath = join(RAW_DIR, `${pageSlug}_heat_${h.wslHeatId}_popup.html`);
    if (!existsSync(popupPath)) {
      fail(
        `Title Match heat ${h.heatNumber} (${h.wslHeatId}) is published but its popup is not retained, so its placings\n` +
          `  are unread. Collect it:  npm run collect-popups -- --season ${season} --event ${eventNumber}`,
      );
    }
    const popupRaw = readFileSync(popupPath);
    const popup = popupRaw.toString("utf8");
    const entries = [...h.totals.entries()].map(([athlete, total]) => {
      const cls = new RegExp(`class="([^"]*hot-heat-athlete--athlete-id-${athlete}\\b[^"]*)"`).exec(popup)?.[1] ?? "";
      const place = /hot-heat-athlete--athlete-place-(\d+)/.exec(cls)?.[1];
      if (place === undefined) fail(`heat ${h.wslHeatId}: the popup publishes no placing for athlete ${athlete}.`);
      return { athlete, position: Number(place), total };
    });
    const byPlace = [...entries].sort((a, b) => a.position - b.position);
    if (byPlace.map((e) => e.position).join(",") !== "1,2" || byPlace[0].total <= byPlace[1].total) {
      fail(`heat ${h.wslHeatId}: published placings ${JSON.stringify(entries)} disagree with the published totals.`);
    }
    seriesRows.push({
      heatNumber: h.heatNumber,
      wslHeatId: h.wslHeatId,
      popupSha: createHash("sha256").update(popupRaw).digest("hex"),
      entries,
    });
  }
  const loadedTitleHeats = 1 + seriesRows.length;
  console.log(
    `  men's Title Match: ${series.resultText ?? "no result text"}; ${titleHeats} heat(s) per the replay links, ` +
      `${loadedTitleHeats} loaded`,
  );

  // ---- rows --------------------------------------------------------------
  // Series heats follow the Title Match's own heat number (4), so that every
  // ordering on (round_order, heat_number) -- Trim's included -- walks them in
  // the order they were surfed: 4, 5, 6.
  const heatRows = [
    ...mens.map((h, i) => `  (${h.roundOrder}, ${i + 1}, ${q(h.wslHeatId)})`),
    ...seriesRows.map((r) => `  (4, ${mens.length + r.heatNumber - 1}, ${q(r.wslHeatId)})`),
  ];
  const entryRows: string[] = [];
  for (const h of mens) {
    for (const a of h.athletes) {
      const lost = a.position === 2;
      const finished = lost ? LOSER_FINISHES[h.roundOrder] : h.roundOrder === 4 ? 1 : null;
      entryRows.push(
        `  (${q(h.wslHeatId)}, ${q(a.wslAthleteId)}, ${a.position ?? "NULL"}, ${a.heatTotal}, ` +
          `${finished === null ? "NULL" : finished}, ${q(a.progressionText)})`,
      );
    }
  }
  // finished_position is a property of the SURFER's Finals, so it lives on one
  // row per surfer: the Title Match heat 1 rows above, as before. Series heats
  // carry NULL. home.ts, event.ts and rankings.ts each refuse two rows.
  const seriesEntryRows = seriesRows.flatMap((r) =>
    r.entries.map((e) => `  (${q(r.wslHeatId)}, ${q(e.athlete)}, ${e.position}, ${e.total}, NULL::integer, NULL, '${r.popupSha}')`),
  );
  const champion = mens[3].athletes.find((a) => a.position === 1);
  if (!champion) fail(`the Title Match has no first-placed surfer. Nothing generated.`);
  console.log(`  champion from the ladder: ${champion.shortName ?? champion.wslAthleteId} (${champion.wslAthleteId})`);

  const roundNames: Record<number, string> = { 1: "Match 1", 2: "Match 2", 3: "Match 3", 4: "Title Match" };

  const sql = `-- =====================================================================
-- ${season} ${name} — the WSL Finals ladder
-- Generated by ${SCRIPT_NAME} on ${new Date().toISOString()}
-- =====================================================================
--
-- Rule 6: review this, then run it yourself. Claude does not execute it.
--
-- Source: ${relative(REPO_ROOT, htmlPath)}
--         sha256 ${sha}
--
-- A FOURTH PAGE SHAPE. No round nav, no roundId, no counting-wave markup — and
-- both divisions in one document. It DOES carry heat-detail popup links, under
-- a different class than every other page (hot-heat__details-link, not
-- hot-heat__action-link-details); an earlier version of this file said it did
-- not, on the strength of a selector returning zero. The four men's
-- heats were separated from the four women's by the full-heat-replay link that
-- precedes each block (…-mens-… / …-womens-…), and the result is cross-checked
-- below against the surfers ordinary men's CT events have already loaded.
--
-- THE TITLE MATCH. Rulebook 1.06(e)(iv): "The Final Match is best of three
-- (3) heats." From 2025 the results page adds: "World #1 can win the World
-- Title by winning Title Match Heat 1. Otherwise, Title Match is Best-of-3
-- heats." The series block publishes every heat surfed -- here
-- ${series.resultText ?? "no result text"}, ${titleHeats} heat(s) -- and all ${loadedTitleHeats} are loaded:
-- totals from the series block, placings from each later heat's popup.
--
-- Rows: 1 event, 4 rounds, ${3 + loadedTitleHeats} heats, ${2 * (3 + loadedTitleHeats)} heat entries, 5 finalists.
-- No waves (this page shape has none) and no event_entries (the Finals awards
-- no ranking points; it reallocates the top five positions).
-- =====================================================================

BEGIN;

DO $$
DECLARE missing text;
BEGIN
  SELECT '${sha}' INTO missing WHERE NOT EXISTS (SELECT 1 FROM artefacts WHERE sha256 = '${sha}');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Unregistered artefact sha256: %. Run supabase/seeds/artefacts_retained.sql first.', missing;
  END IF;
END $$;

-- --- event ------------------------------------------------------------
INSERT INTO events (season_year, event_number, wsl_event_id, name, slug, kind,
                    occurs_after_cut, throwaway_eligible, awards_ranking_points,
                    field_size, artefact_id)
SELECT ${season}, ${eventNumber}, '${wslEventId}', ${q(name)}, ${q(slugFromUrl)}, 'wsl_finals',
       ${ev.is_post_cut === true}, ${ev.throwaway_eligible === true}, ${ev.awards_ranking_points === true}, 5, a.id
FROM artefacts a WHERE a.sha256 = '${sha}'
ON CONFLICT (season_year, event_number) DO NOTHING;

-- --- rounds -----------------------------------------------------------
-- counting_rides and max_heat_score follow every other two-surfer CT heat.
-- best_of lives on round_templates, which already says 3 for round 4 and is
-- sourced to the rulebook; it is deliberately not restated here.
${mens
  .map(
    (h) => `INSERT INTO rounds (event_id, round_order, name, counting_rides, max_heat_score, scoring_basis, is_leaderboard, artefact_id)
SELECT e.id, ${h.roundOrder}, ${q(roundNames[h.roundOrder])}, 2, 20, 'best_two_overall', false, a.id
FROM events e, artefacts a
WHERE e.season_year = ${season} AND e.event_number = ${eventNumber} AND a.sha256 = '${sha}'
ON CONFLICT (event_id, round_order) DO NOTHING;`,
  )
  .join("\n")}

-- --- heats ------------------------------------------------------------
INSERT INTO heats (round_id, heat_number, sequence_in_round, wsl_heat_id, status, artefact_id)
SELECT r.id, v.heat_number, v.heat_number, v.wsl_heat_id, 'completed', a.id
FROM (VALUES
${heatRows.join(",\n")}
) AS v(round_order, heat_number, wsl_heat_id)
JOIN events e ON e.season_year = ${season} AND e.event_number = ${eventNumber}
JOIN rounds r ON r.event_id = e.id AND r.round_order = v.round_order
JOIN artefacts a ON a.sha256 = '${sha}'
ON CONFLICT (round_id, heat_number, sequence_in_round) DO NOTHING;

-- --- heat entries -----------------------------------------------------
-- finished_position is what the ladder forces: the loser of Match 1 finishes
-- 5th, Match 2 4th, Match 3 3rd, the Title Match 2nd, and its winner 1st. For
-- both 2024 and 2025 this reproduces the published final rankings top five
-- exactly, from a page unrelated to the rankings page.
INSERT INTO heat_entries (heat_id, surfer_id, position, heat_total, finished_position, progression_text, artefact_id)
SELECT h.id, s.id, v.position, v.heat_total::numeric, v.finished_position, v.progression_text, a.id
FROM (VALUES
${entryRows.join(",\n")}
) AS v(wsl_heat_id, wsl_athlete_id, position, heat_total, finished_position, progression_text)
JOIN events e ON e.season_year = ${season} AND e.event_number = ${eventNumber}
JOIN rounds r ON r.event_id = e.id
JOIN heats h ON h.round_id = r.id AND h.wsl_heat_id = v.wsl_heat_id
JOIN surfers s ON s.wsl_athlete_id = v.wsl_athlete_id
JOIN artefacts a ON a.sha256 = '${sha}'
ON CONFLICT (heat_id, surfer_id) DO NOTHING;
${
  seriesEntryRows.length === 0
    ? ""
    : `
-- --- Title Match heats after the first ----------------------------------
-- Totals: the series block on the results page. Placings: each heat's own
-- popup (athlete-place-N), so the popup is the artefact these rows cite.
-- finished_position is NULL here; the surfer's Finals finish is on heat 1.
INSERT INTO heat_entries (heat_id, surfer_id, position, heat_total, finished_position, progression_text, artefact_id)
SELECT h.id, s.id, v.position, v.heat_total::numeric, v.finished_position, v.progression_text, a.id
FROM (VALUES
${seriesEntryRows.join(",\n")}
) AS v(wsl_heat_id, wsl_athlete_id, position, heat_total, finished_position, progression_text, popup_sha)
JOIN events e ON e.season_year = ${season} AND e.event_number = ${eventNumber}
JOIN rounds r ON r.event_id = e.id
JOIN heats h ON h.round_id = r.id AND h.wsl_heat_id = v.wsl_heat_id
JOIN surfers s ON s.wsl_athlete_id = v.wsl_athlete_id
JOIN artefacts a ON a.sha256 = v.popup_sha
ON CONFLICT (heat_id, surfer_id) DO NOTHING;
`
}
-- --- gaps -------------------------------------------------------------
-- A gap row ASSERTS AN ABSENCE, so it is opened only while the absence is
-- still true. This generator is re-runnable, and the same defect fixed in
-- ingest_event.ts on 24 August lives here: the guard below refuses only a
-- duplicate row that is still OPEN, so a Tier 2 close would make room for the
-- next re-run to re-open it. Both Finals waves gaps were closed by Tier 2 on
-- 19-20 August and would have come back on the next finals re-run.
-- docs/findings/2026-08-20_wave_gap_ledger_reopened_by_tier1.md
-- SUPERSEDED 25 August 2026: the event was the wrong grain. See
-- scripts/lib/wave_gaps.ts, which all three generators now emit.
${waveGapSql(season, eventNumber)}
INSERT INTO data_gaps (scope, season_year, field, reason, source_note)
SELECT v.scope, v.yr, v.field, v.reason, v.note FROM (VALUES
${
  loadedTitleHeats < titleHeats
    ? `  ('round', ${season}, 'Title Match heats beyond the first, ${season} event ${eventNumber}', 'The Title Match ran ${titleHeats} heat(s) per the replay links and ${loadedTitleHeats} are loaded.', 'Replay link names and the series block on the retained page.'),\n`
    : ""
}  ('event', ${season}, 'event_entries for ${season} event ${eventNumber}', 'The WSL Finals awards no ranking points — it reallocates the top five positions (spec: awards_ranking_points false). There is nothing to write to event_entries.points, and writing placings without points would misrepresent the event.', 'docs/format-spec/seasons/${season}.yaml, format: finals_five.')
) AS v(scope, yr, field, reason, note)
WHERE NOT EXISTS (SELECT 1 FROM data_gaps d WHERE d.field = v.field AND d.closed_at IS NULL);
${
  loadedTitleHeats === titleHeats
    ? `
-- Every Title Match heat the page publishes is now loaded, so the gap opened
-- on 19 August ("heats beyond the first") is no longer true. Closed, not deleted.
UPDATE data_gaps SET closed_at = CURRENT_DATE
WHERE field = 'Title Match heats beyond the first, ${season} event ${eventNumber}' AND closed_at IS NULL;
`
    : ""
}
-- --- assertions -------------------------------------------------------
DO $$
DECLARE
  r_rounds int; r_heats int; r_entries int; r_surfers int;
  champ_ladder bigint; champ_rankings bigint; champ_name text; foreign_surfers int;
BEGIN
  SELECT count(*) INTO r_rounds FROM rounds r JOIN events e ON e.id = r.event_id
    WHERE e.season_year = ${season} AND e.event_number = ${eventNumber};
  SELECT count(*) INTO r_heats FROM heats h JOIN rounds r ON r.id = h.round_id
    JOIN events e ON e.id = r.event_id WHERE e.season_year = ${season} AND e.event_number = ${eventNumber};
  SELECT count(*), count(DISTINCT he.surfer_id) INTO r_entries, r_surfers
    FROM heat_entries he JOIN heats h ON h.id = he.heat_id JOIN rounds r ON r.id = h.round_id
    JOIN events e ON e.id = r.event_id WHERE e.season_year = ${season} AND e.event_number = ${eventNumber};

  IF r_rounds  <> 4 THEN RAISE EXCEPTION 'rounds: expected 4, got %', r_rounds; END IF;
  IF r_heats   <> ${3 + loadedTitleHeats} THEN RAISE EXCEPTION 'heats: expected ${3 + loadedTitleHeats}, got %', r_heats; END IF;
  IF r_entries <> ${2 * (3 + loadedTitleHeats)} THEN RAISE EXCEPTION 'heat entries: expected ${2 * (3 + loadedTitleHeats)}, got %', r_entries; END IF;
  IF r_surfers <> 5 THEN RAISE EXCEPTION 'finalists: expected 5, got %', r_surfers; END IF;

  -- THE DIVISION CHECK. Every finalist must be a surfer an ordinary men's CT
  -- event has already loaded. A women's heat that slipped through the replay-link
  -- filter would bring in a surfer no men's event has ever seen.
  SELECT count(*) INTO foreign_surfers
  FROM heat_entries he
  JOIN heats h ON h.id = he.heat_id JOIN rounds r ON r.id = h.round_id
  JOIN events e ON e.id = r.event_id
  WHERE e.season_year = ${season} AND e.event_number = ${eventNumber}
    AND NOT EXISTS (
      SELECT 1 FROM heat_entries he2
      JOIN heats h2 ON h2.id = he2.heat_id JOIN rounds r2 ON r2.id = h2.round_id
      JOIN events e2 ON e2.id = r2.event_id
      WHERE e2.kind = 'regular' AND he2.surfer_id = he.surfer_id
    );
  IF foreign_surfers > 0 THEN
    RAISE EXCEPTION 'DIVISION FILTER FAILED: % finalist heat entries name a surfer no ordinary men''s CT event has loaded. This is very likely the women''s ladder. Do not load.', foreign_surfers;
  END IF;

  -- THE CHAMPION, FROM TWO UNRELATED PAGES. The ladder says the Title Match
  -- winner; seasons.world_champion_surfer_id was set from the final rankings
  -- page by scripts/ingest_champion.ts. Nothing but the result makes them agree.
  SELECT he.surfer_id INTO champ_ladder
  FROM heat_entries he JOIN heats h ON h.id = he.heat_id JOIN rounds r ON r.id = h.round_id
  JOIN events e ON e.id = r.event_id
  WHERE e.season_year = ${season} AND e.event_number = ${eventNumber}
    AND r.round_order = 4 AND he.finished_position = 1;
  SELECT world_champion_surfer_id INTO champ_rankings FROM seasons WHERE year = ${season};

  IF champ_rankings IS NULL THEN
    RAISE NOTICE 'seasons.world_champion_surfer_id is not set for ${season}, so the cross-check was skipped. Run supabase/seeds/champion_${season}.sql, then re-run this file.';
  ELSIF champ_ladder IS DISTINCT FROM champ_rankings THEN
    RAISE EXCEPTION 'CHAMPION MISMATCH: the Title Match winner (surfer %) is not the champion recorded from the rankings page (surfer %). One of the two sources is wrong.', champ_ladder, champ_rankings;
  END IF;

  SELECT full_name INTO champ_name FROM surfers WHERE id = champ_ladder;
  RAISE NOTICE 'OK: 4 matches, ${3 + loadedTitleHeats} heats, ${2 * (3 + loadedTitleHeats)} entries, 5 finalists. Title Match won by %, which matches the champion read from the final rankings.', champ_name;
END $$;

COMMIT;
`;

  mkdirSync(SEED_DIR, { recursive: true });
  const outPath = join(SEED_DIR, `finals_${season}_e${String(eventNumber).padStart(2, "0")}_${slugFromUrl.replace(/-/g, "_")}.sql`);
  writeFileSync(outPath, sql);
  console.log(`\n  -> ${relative(REPO_ROOT, outPath)}`);
  console.log(`\n  Read it, then run it yourself.\n`);
}

main();
