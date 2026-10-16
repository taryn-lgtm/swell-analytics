#!/usr/bin/env tsx
/**
 * write_manual_sidecar.ts — provenance sidecar for a manually saved artefact
 *
 *   tsx scripts/write_manual_sidecar.ts --season 2022
 *   tsx scripts/write_manual_sidecar.ts --season 2022 --force
 *
 * Written for the three manual page saves described in HANDOVER.md §3: browser
 * saves made by hand, under personal use, with no automated collection involved.
 *
 * WHY THIS EXISTS. `reconstruct_season.ts --no-fetch` tolerates a missing sidecar
 * but enforces the hash when one is present. A sidecar written by hand with a
 * guessed hash therefore fails the run, and a sidecar written before the file
 * exists is worse than none at all. This computes the hash from the bytes on
 * disk, so the artefact and its record cannot disagree.
 *
 * WHAT IT DOES NOT DO. It never touches the network. It cannot, and must not.
 *
 * Provenance is recorded honestly: a browser save is NOT a wire-level artefact,
 * and the sidecar says so. See the `provenance_warning` field, which follows the
 * pattern set by docs/sources/raw/worldsurfleague_robots.json.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = join(REPO_ROOT, "docs/sources/raw");

/** Structural markers the rankings parser depends on. */
const REQUIRED_MARKERS: ReadonlyArray<{ marker: string; why: string }> = [
  { marker: "<table", why: "the rankings table itself" },
  { marker: "data-tooltip", why: "per-event place and points live in the tooltip" },
  { marker: "athletes/tour/mct", why: "confirms this is the men's CT rankings page" },
];

/** Markers that should be present but are not fatal on their own. */
const EXPECTED_MARKERS: ReadonlyArray<{ marker: string; why: string }> = [
  { marker: "no-count", why: "the published throwaway flag" },
];

interface Args {
  season: number;
  force: boolean;
}

function fail(message: string): never {
  console.error(`\n  FAIL  ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: readonly string[]): Args {
  let season: number | null = null;
  let force = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--season") {
      const value = argv[i + 1];
      if (value === undefined) fail("--season requires a value");
      season = Number(value);
      i += 1;
    } else if (arg === "--force") {
      force = true;
    } else {
      fail(`unrecognised argument: ${arg}`);
    }
  }
  if (season === null || Number.isNaN(season)) {
    fail("usage: tsx scripts/write_manual_sidecar.ts --season <year> [--force]");
  }
  return { season, force };
}

interface Sidecar {
  url: string;
  fetched_at: string;
  sha256: string;
  content_length_bytes: number;
  http_status: null;
  content_type: null;
  fetched_by: string;
  collection_method: string;
  provenance_warning: string;
  captured_for: string;
  sidecar_written_by: string;
}

function buildSidecar(season: number, sha256: string, bytes: number, savedAt: string): Sidecar {
  return {
    url: `https://www.worldsurfleague.com/athletes/tour/mct?year=${season}`,
    fetched_at: savedAt,
    sha256,
    content_length_bytes: bytes,
    http_status: null,
    content_type: null,
    fetched_by: "Taryn, manual browser save (File > Save As, HTML source only)",
    collection_method:
      "MANUAL. No automated process, robot, spider, scraper or crawler was used. " +
      "A single page was opened in a browser by a person and saved to disk by hand, " +
      "for personal use. See docs/findings/2026-07-26_terms_of_use.md.",
    provenance_warning:
      "NOT A WIRE-LEVEL ARTEFACT. These are the bytes the browser wrote to disk, which " +
      "for a server-rendered page are normally the response body but are not guaranteed " +
      "to be byte-identical to it — the browser may normalise encoding or line endings, " +
      "and http_status and content_type were not observable through this path. " +
      "fetched_at is the file's modification time, i.e. when it was saved, not when the " +
      "server responded. The sha256 is over the file as written here. Sufficient for " +
      "reconstruction and re-parsing; re-capture at wire level before relying on it in " +
      "any dispute.",
    captured_for: `Stage 1 reconstruction, ${season}. Validates the counting-events throwaway form beyond 2024 — docs/format-spec/seasons/era_a.yaml throwaway.untested`,
    sidecar_written_by: "scripts/write_manual_sidecar.ts",
  };
}

function main(): void {
  const { season, force } = parseArgs(process.argv.slice(2));
  const slug = `${season}_mct_final_rankings`;
  const htmlPath = join(RAW_DIR, `${slug}.html`);
  const sidecarPath = join(RAW_DIR, `${slug}.json`);

  console.log(`\n  ${season} — manual artefact sidecar\n`);

  if (!existsSync(htmlPath)) {
    fail(
      `no artefact at ${relative(REPO_ROOT, htmlPath)}\n` +
        `        Save https://www.worldsurfleague.com/athletes/tour/mct?year=${season}\n` +
        `        from your browser as HTML source only, to that exact path.`,
    );
  }

  if (existsSync(sidecarPath) && !force) {
    const existing = JSON.parse(readFileSync(sidecarPath, "utf8")) as Partial<Sidecar>;
    fail(
      `sidecar already exists at ${relative(REPO_ROOT, sidecarPath)}\n` +
        `        Recorded sha256: ${existing.sha256 ?? "(none)"}\n` +
        `        Refusing to overwrite a provenance record. Pass --force if you\n` +
        `        genuinely re-saved the page and mean to replace it.`,
    );
  }

  const bytes = readFileSync(htmlPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const savedAt = statSync(htmlPath).mtime.toISOString();

  console.log(`  file      ${relative(REPO_ROOT, htmlPath)}`);
  console.log(`  size      ${bytes.length.toLocaleString()} bytes`);
  console.log(`  sha256    ${sha256}`);
  console.log(`  saved at  ${savedAt}\n`);

  // Sanity checks. A login wall, a JavaScript shell or the wrong year all
  // produce a file of plausible size, and all three fail silently later.
  const html = bytes.toString("utf8");
  const missing = REQUIRED_MARKERS.filter((m) => !html.includes(m.marker));
  if (missing.length > 0) {
    fail(
      `the saved file does not look like the rankings page. Missing:\n` +
        missing.map((m) => `          "${m.marker}" — ${m.why}`).join("\n") +
        `\n        No sidecar written. Re-save the page and check you saved the\n` +
        `        HTML source rather than a rendered or partial copy.`,
    );
  }

  if (!html.includes(`year=${season}`) && !html.includes(`>${season}<`)) {
    console.log(`  WARNING: no reference to ${season} found. Check you saved the right season.\n`);
  }

  for (const { marker, why } of EXPECTED_MARKERS) {
    const count = html.split(marker).length - 1;
    if (count === 0) {
      console.log(`  WARNING: "${marker}" not present — ${why}. Stage 1 may not reconcile.`);
    } else {
      console.log(`  ok        ${count} x "${marker}" — ${why}`);
    }
  }

  writeFileSync(
    sidecarPath,
    `${JSON.stringify(buildSidecar(season, sha256, bytes.length, savedAt), null, 2)}\n`,
    "utf8",
  );

  console.log(`\n  written   ${relative(REPO_ROOT, sidecarPath)}`);
  console.log(`\n  next      tsx scripts/reconstruct_season.ts --season ${season} --stage 1 --no-fetch\n`);
}

main();
