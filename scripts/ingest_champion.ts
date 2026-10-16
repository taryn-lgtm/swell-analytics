#!/usr/bin/env tsx
/**
 * ingest_champion.ts — the world champion, read rather than worked out
 *
 * Reads a retained artefact from disk. Never fetches. Emits SQL for review.
 *
 * M1 ITEM 6: "World champion set as an explicit field. Never derived from
 * points." This script is what makes that true, and the reason it exists as a
 * script rather than two hand-typed UPDATEs is that a fact typed by hand is a
 * fact carried in a summary, which is what this project says goes stale first.
 *
 * WHERE THE CHAMPION COMES FROM, AND THE ONE DEFINITIONAL STEP
 *
 *   The final rankings page does NOT contain the words "world champion". This
 *   was checked: 27 occurrences of "champion" on the 2025 page are the document
 *   title and the site's own nav ("Championship Tour"), and all 22 "trophy"
 *   markers are per-event win icons in the results columns. There is no
 *   world-title marker in the markup.
 *
 *   So one definitional step is taken, and it is stated here rather than buried:
 *
 *     the artefact is titled "Men's Championship Tour FINAL Rankings <year>";
 *     the world champion is the athlete at rank 1 of a season's final rankings.
 *
 *   That is a definition of the sport, not an inference from the data, and it
 *   rests on the project's locked decision that published WSL rankings are the
 *   authority. It is NOT a points calculation, which is the thing item 6 forbids.
 *
 * WHY THE DISTINCTION IS NOT PEDANTRY — THE EVIDENCE, FROM THE PAGES THEMSELVES
 *
 *   Published rank order is not points order. Measured on the two retained
 *   final-rankings pages:
 *
 *     2024   rank 2  Italo Ferreira      37,365
 *            rank 3  Griffin Colapinto   46,600   <- 9,235 MORE points, one place lower
 *
 *     2025   rank 2  Griffin Colapinto   48,965
 *            rank 3  Jordy Smith         50,835   <- 1,870 MORE points, one place lower
 *
 *   A pipeline that sorts by points reproduces neither season's table. The WSL
 *   Finals decides the title and the closing places, so the published rank is
 *   the only thing that carries the result. Both seasons in M1 scope demonstrate
 *   it independently.
 *
 * Usage:
 *   tsx scripts/ingest_champion.ts --season 2025
 *   node --experimental-strip-types scripts/ingest_champion.ts --season 2025
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT, RAW_DIR, decodeEntities, fail, stripTags } from "./lib/retain.ts";
import { stripNonMarkup } from "./lib/parse_results.ts";

const SCRIPT_NAME = "scripts/ingest_champion.ts";
const SEED_DIR = join(REPO_ROOT, "supabase/seeds");

interface RankRow {
  rank: number;
  wslAthleteId: string;
  name: string;
  points: number | null;
}

/**
 * Every row of the final-rankings table, in page order.
 *
 * Scoped to `table.tableType-athlete` first. The page carries other tables and
 * a great deal of nav; a document-wide search for `athlete-rank` returns 74
 * hits against 36 athletes, because the column headers carry the same class.
 */
export function parseFinalRankings(markup: string): RankRow[] {
  const tableStart = /<table[^>]*\btableType-athlete\b[^>]*>/.exec(markup);
  if (!tableStart) fail("no table.tableType-athlete on this page. Is it really a rankings page?");
  const afterOpen = markup.slice(tableStart.index);
  const tableEnd = afterOpen.indexOf("</table>");
  const table = tableEnd === -1 ? afterOpen : afterOpen.slice(0, tableEnd);

  const bodyStart = table.indexOf("<tbody");
  if (bodyStart === -1) fail("table.tableType-athlete has no <tbody>. Header rows only would parse as athletes.");
  const body = table.slice(bodyStart);

  const rows: RankRow[] = [];
  const parts = body.split(/<tr\b/).slice(1);

  for (const raw of parts) {
    // `td`, never `th` — the header cells carry the same class names.
    const rankCell = /<td[^>]*class="[^"]*\bathlete-rank\b[^"]*"[^>]*>([\s\S]*?)<\/td>/.exec(raw);
    const nameCell = /<td[^>]*class="[^"]*\bathlete-headshot-and-name\b[^"]*"[^>]*>([\s\S]*?)<\/td>/.exec(raw);
    if (!rankCell || !nameCell) continue;

    const rank = Number(stripTags(rankCell[1]).replace(/[^\d]/g, ""));
    const idMatch = /\/athletes\/(\d+)\//.exec(nameCell[1]);
    const nameMatch = /class="[^"]*\bathlete-name\b[^"]*"[^>]*>([\s\S]*?)</.exec(nameCell[1]);
    if (!Number.isFinite(rank) || rank === 0 || !idMatch) continue;

    const ptsCell = /<td[^>]*class="[^"]*\bathlete-points\b[^"]*"[^>]*>([\s\S]*?)<\/td>/.exec(raw);
    const ptsRaw = ptsCell ? stripTags(ptsCell[1]).replace(/[^\d]/g, "") : "";

    rows.push({
      rank,
      wslAthleteId: idMatch[1],
      name: nameMatch ? decodeEntities(stripTags(nameMatch[1])).replace(/\s+/g, " ").trim() : "",
      points: ptsRaw.length > 0 ? Number(ptsRaw) : null,
    });
  }
  return rows;
}

function main(): void {
  const argv = process.argv.slice(2);
  let season: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--season") season = Number(argv[++i]);
    else fail(`unrecognised argument: ${argv[i]}`);
  }
  if (season === null || !Number.isInteger(season)) fail("--season <year> is required");

  const slug = `${season}_mct_final_rankings`;
  const htmlPath = join(RAW_DIR, `${slug}.html`);
  const sidecarPath = join(RAW_DIR, `${slug}.json`);
  if (!existsSync(htmlPath)) {
    fail(
      `no retained final-rankings page for ${season} at ${relative(REPO_ROOT, htmlPath)}.\n` +
        `  This script reads disk only. Collect it first.`,
    );
  }

  const html = readFileSync(htmlPath, "utf8");
  const rows = parseFinalRankings(stripNonMarkup(html));

  // ---- the source held to its own shape --------------------------------
  if (rows.length === 0) fail(`parsed 0 athlete rows from ${slug}. The selectors have stopped matching.`);

  const rank1 = rows.filter((r) => r.rank === 1);
  if (rank1.length !== 1) {
    fail(
      `expected exactly one athlete at rank 1, found ${rank1.length}.\n` +
        `  Refusing to pick one. ${rank1.map((r) => `${r.name} (${r.wslAthleteId})`).join(", ")}`,
    );
  }
  const champion = rank1[0];
  if (champion.name.length === 0) fail(`rank 1 is athlete ${champion.wslAthleteId} but no name could be read.`);

  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  const contiguous = ranks.every((r, i) => r === i + 1);
  if (!contiguous) {
    fail(`ranks are not 1..${rows.length} without gaps: ${ranks.join(", ")}. Some rows were missed.`);
  }

  // The evidence for reading rank rather than computing it, recomputed each run
  // rather than quoted from a comment written once.
  const byPoints = [...rows]
    .filter((r) => r.points !== null)
    .sort((a, b) => (b.points as number) - (a.points as number));
  const inversions = rows.filter((r) => {
    const byPointsRank = byPoints.findIndex((x) => x.wslAthleteId === r.wslAthleteId) + 1;
    return byPointsRank > 0 && byPointsRank !== r.rank;
  });

  // sha of the artefact, from the sidecar where possible and recomputed as a
  // control. A sidecar that disagrees with the bytes is a retention failure.
  const computed = createHash("sha256").update(Buffer.from(html, "utf8")).digest("hex");
  let sha = computed;
  if (existsSync(sidecarPath)) {
    const side = JSON.parse(readFileSync(sidecarPath, "utf8")) as { sha256?: string };
    if (typeof side.sha256 === "string" && side.sha256 !== computed) {
      fail(
        `sidecar sha256 does not match the bytes on disk for ${slug}.\n` +
          `  sidecar  ${side.sha256}\n  computed ${computed}\n` +
          `  The artefact changed after capture. Do not use it.`,
      );
    }
    if (typeof side.sha256 === "string") sha = side.sha256;
  }

  console.log(`\n${season} Men's CT final rankings — ${relative(REPO_ROOT, htmlPath)}`);
  console.log(`  ${rows.length} athletes, ranks 1..${rows.length}, no gaps`);
  console.log(`  rank 1: ${champion.name} (WSL athlete ${champion.wslAthleteId}), ${champion.points ?? "?"} points`);
  console.log(`  ${inversions.length} of ${rows.length} rows sit at a different place than a points sort would give`);

  const evidence = rows
    .filter((r) => r.rank <= 5)
    .map((r) => `--     rank ${String(r.rank).padStart(2)}  ${r.name.padEnd(22)} ${r.points === null ? "?" : r.points.toLocaleString("en-GB")}`)
    .join("\n");

  const sql = `-- =====================================================================
-- M1 item 6 — world champion for ${season}
-- Generated by ${SCRIPT_NAME} on ${new Date().toISOString()}
-- =====================================================================
--
-- Rule 6: review this, then run it yourself. Claude does not execute it.
--
-- Source: ${relative(REPO_ROOT, htmlPath)}
--         sha256 ${sha}
--
-- READ, NOT COMPUTED. The champion is the athlete at rank 1 of the season's
-- FINAL rankings, taken from the published table. The page carries no
-- world-title marker of any kind — that was checked, not assumed — so the one
-- definitional step is: rank 1 of the final rankings IS the world champion.
-- It rests on the locked decision that published WSL rankings are the
-- authority. It is not a points calculation.
--
-- WHY THAT MATTERS, measured on this page each time this file is generated:
-- ${inversions.length} of ${rows.length} rows sit at a different place than sorting by points would
-- give. The top five as published:
--
${evidence}
--
-- The WSL Finals decides the title and the closing places, so points order and
-- rank order are different things. A pipeline that sorts by points does not
-- reproduce this table.
--
-- Idempotent: a straight assignment of the same two values.
-- =====================================================================

BEGIN;

UPDATE seasons s
SET world_champion_surfer_id = su.id,
    champion_artefact_id     = a.id
FROM surfers su, artefacts a
WHERE s.year = ${season}
  AND su.wsl_athlete_id = '${champion.wslAthleteId}'
  AND a.sha256 = '${sha}';

DO $$
DECLARE
  has_season boolean; has_surfer boolean; has_artefact boolean;
  champ text; art bigint;
BEGIN
  SELECT EXISTS (SELECT 1 FROM seasons WHERE year = ${season}) INTO has_season;
  SELECT EXISTS (SELECT 1 FROM surfers WHERE wsl_athlete_id = '${champion.wslAthleteId}') INTO has_surfer;
  SELECT EXISTS (SELECT 1 FROM artefacts WHERE sha256 = '${sha}') INTO has_artefact;

  IF NOT has_season THEN
    RAISE NOTICE 'No seasons row for ${season} yet, so nothing was set. Re-run this after the season is ingested. Not an error.';
    RETURN;
  END IF;
  IF NOT has_surfer THEN
    RAISE EXCEPTION 'WSL athlete ${champion.wslAthleteId} (${champion.name.replace(/'/g, "''")}) is not in surfers. Ingest the events first — do not insert a bare surfer row to satisfy this.';
  END IF;
  IF NOT has_artefact THEN
    RAISE EXCEPTION 'Rankings artefact ${sha} is not registered. Run supabase/seeds/artefacts_retained.sql first.';
  END IF;

  SELECT su.full_name, s.champion_artefact_id INTO champ, art
  FROM seasons s JOIN surfers su ON su.id = s.world_champion_surfer_id
  WHERE s.year = ${season};

  IF champ IS NULL THEN
    RAISE EXCEPTION 'seasons.world_champion_surfer_id is still null for ${season} after the update.';
  END IF;
  IF art IS NULL THEN
    RAISE EXCEPTION 'champion_artefact_id is null for ${season}. An explicit field with no provenance is item 7 failing to notice item 6.';
  END IF;

  RAISE NOTICE '${season} world champion: % (artefact %). Read from rank 1 of the published final rankings.', champ, art;
END $$;

COMMIT;
`;

  mkdirSync(SEED_DIR, { recursive: true });
  const outPath = join(SEED_DIR, `champion_${season}.sql`);
  writeFileSync(outPath, sql);
  console.log(`\n  -> ${relative(REPO_ROOT, outPath)}`);
  console.log(`\n  Read it, then run it yourself.\n`);
}

main();
