#!/usr/bin/env tsx
/**
 * rebuild_popup_manifest.ts — give an event its Tier 2 manifest from the bytes
 * already on disk. Fetches nothing. Opens no browser.
 *
 * WHY THIS EXISTS
 *   `collect_heat_popups.ts` writes the popups manifest at the end of a run.
 *   A run that failed part-way used to write none at all, so three events —
 *   2024 e1, 2025 e5, 2025 e8 — ended 19 August with 52 popups retained on
 *   disk, each with a complete sidecar, and no manifest naming them.
 *   `ingest_popups.ts` reads the manifest and not the directory, deliberately,
 *   so those 52 heats were unreachable.
 *
 *   The collector already treats the manifest as an index of the DISK rather
 *   than a log of one run — that is what `recordsFromDisk()` is for. This
 *   script is that function with no browser attached.
 *
 * WHAT IT IS NOT
 *   It is NOT a record of a collection run and does not claim to be.
 *   `generated_by` names this script, `reconstructed_from_disk` is true, and
 *   `retained_this_run` is 0. A manifest that said "scripts/collect_heat_popups.ts"
 *   would be a fabricated provenance record, which is the one thing the
 *   retention contract exists to prevent.
 *
 * WHAT IT CHECKS BEFORE WRITING
 *   1. Every .html is re-hashed and must equal its sidecar's sha256. A manifest
 *      built over bytes that have changed since capture indexes a lie.
 *   2. No heat may appear twice.
 *   3. Every heat must be named by a round in the Tier 1 event manifest, and
 *      the sidecar's round id must be that round. Two independent records have
 *      to agree before a heat is indexed — the same two-source rule the
 *      collector applies to division on the Finals page.
 *   4. It refuses to overwrite an existing manifest. A real collection record
 *      outranks a reconstruction; use --force only when you mean it.
 *
 * Usage:
 *   tsx scripts/rebuild_popup_manifest.ts --season 2025 --event 8
 *   tsx scripts/rebuild_popup_manifest.ts --season 2025 --event 11 --check
 *
 *   --check compares what this script would produce against the manifest
 *   already on disk and writes nothing. Run it against an event collected
 *   normally BEFORE trusting it on one that was not — that is the control.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { MANIFEST_DIR, REPO_ROOT, fail } from "./lib/retain.ts";
import { loadEventManifest } from "./lib/manifest.ts";
import { recordsFromDisk } from "./collect_heat_popups.ts";

const SCRIPT_NAME = "scripts/rebuild_popup_manifest.ts";

function parseArgs(argv: string[]): { season: number; event: number; check: boolean; force: boolean } {
  let season: number | null = null;
  let event: number | null = null;
  let check = false;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--season") season = Number(argv[++i]);
    else if (a === "--event") event = Number(argv[++i]);
    else if (a === "--check") check = true;
    else if (a === "--force") force = true;
    else fail(`unrecognised argument: ${a}`);
  }
  if (season === null || !Number.isInteger(season)) fail("--season <year> is required");
  if (event === null || !Number.isInteger(event)) fail("--event <event number> is required");
  return { season: season!, event: event!, check, force };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const ev = loadEventManifest(args.season, args.event);
  const out = join(MANIFEST_DIR, `${ev.stem}_popups.json`);

  const records = recordsFromDisk(ev.stem);
  if (records.length === 0) {
    fail(
      `no retained popups on disk for ${ev.stem}. Nothing to index.\n` +
        `  Collect first: npm run collect-popups -- --season ${args.season} --event ${args.event}`,
    );
  }

  // --- guard 1: the bytes are the bytes that were captured -----------------
  let rehashed = 0;
  for (const r of records) {
    if (r.sha256 === "" || r.file_path === "") {
      fail(`heat ${r.heat_id}: sidecar carries no sha256 or file_path. Not indexable.`);
    }
    const abs = join(REPO_ROOT, r.file_path);
    if (!existsSync(abs)) fail(`heat ${r.heat_id}: ${r.file_path} is named by its sidecar but absent.`);
    const actual = createHash("sha256").update(readFileSync(abs)).digest("hex");
    if (actual !== r.sha256) {
      fail(
        `heat ${r.heat_id}: ${r.file_path} hashes to ${actual} but its sidecar says ${r.sha256}.\n` +
          `  The retained bytes changed after capture. Do not index them.`,
      );
    }
    rehashed++;
  }

  // --- guard 2: no heat twice ----------------------------------------------
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.heat_id)) fail(`heat ${r.heat_id} appears twice on disk for this event.`);
    seen.add(r.heat_id);
  }

  // --- guard 3: two records must agree on where each heat belongs ----------
  //
  // A heat legitimately appears under MORE THAN ONE round. When one round page
  // serves a later round's heats — `spans_multiple_rounds` on the serving round,
  // `served_by_round_page` on the served one — the heat is listed in both. On
  // 2025 e11 heat 108008 is named by round 24801 (Round of 16, the page it was
  // clicked from) and by 24802 (Quarterfinals, the round it belongs to). The
  // collector records the page, so the check is membership in the set, not
  // equality with one arbitrary member. A first draft used a single-valued map,
  // which kept whichever round came last and refused the control run.
  const roundsOfHeat = new Map<string, Array<{ id: string | null; name: string | null }>>();
  for (const rd of ev.rounds) {
    for (const h of rd.heat_ids) {
      const list = roundsOfHeat.get(h) ?? [];
      list.push({ id: rd.round_id, name: rd.round_name_gtm });
      roundsOfHeat.set(h, list);
    }
  }
  for (const r of records) {
    const t1 = roundsOfHeat.get(r.heat_id);
    if (t1 === undefined || t1.length === 0) {
      fail(
        `heat ${r.heat_id} has a retained popup but is named by no round in the Tier 1 manifest.\n` +
          `  Two independent records have to agree before a heat is indexed. Fix the Tier 1\n` +
          `  manifest or find out where this popup came from.`,
      );
    }
    if (r.round_id === "" || r.round_id === null) {
      const only = t1[0];
      r.round_id = only.id;
      r.round_name_gtm = only.name;
      continue;
    }
    const match = t1.find((c) => c.id === r.round_id);
    if (match === undefined) {
      fail(
        `heat ${r.heat_id}: the sidecar says round ${r.round_id}; the Tier 1 manifest names it only ` +
          `under ${t1.map((c) => String(c.id)).join(", ")}.\n` +
          `  Attribution disagreement. Do not index.`,
      );
    }
    r.round_name_gtm = match.name;
  }

  const merged = [...records].sort((a, b) => a.heat_id.localeCompare(b.heat_id));
  const roundsSeen = [...new Set(merged.map((r) => (r.round_id === null || r.round_id === "" ? "(no round nav)" : r.round_id)))].sort();

  const manifest = {
    generated_at: new Date().toISOString(),
    generated_by: SCRIPT_NAME,
    reconstructed_from_disk: true,
    reconstruction_note:
      "NOT a record of a collection run. Built from the retained popups and their sidecars " +
      "after a partial run left no manifest. Every file was re-hashed against its sidecar and " +
      "every heat checked against the Tier 1 manifest's round attribution before being indexed. " +
      "retained_this_run is 0 because this script retains nothing.",
    user_agent:
      "wsl-analytics-research/0.1 (tier 2 heat details, headless chromium; +https://github.com/taryn-lgtm/swell-analytics)",
    season: args.season,
    event: { number: args.event, name: ev.name, wsl_event_id: ev.wslEventId },
    capture_method: "Playwright chromium, popup DOM after click",
    provenance_warning: "Serialised DOM, not wire bytes. No HTTP response contains this markup.",
    rounds_visited: roundsSeen,
    retained_this_run: 0,
    popups: merged,
    totals: {
      popups: merged.length,
      wave_scores: merged.reduce((n, r) => n + r.wave_scores, 0),
      with_interference: merged.filter((r) => r.interference_markers > 0).length,
    },
  };

  console.log(`  ${ev.stem}`);
  console.log(`  ${merged.length} popup(s) on disk, ${rehashed} re-hashed and matching their sidecars`);
  console.log(`  ${manifest.totals.wave_scores} wave scores, ${manifest.totals.with_interference} popup(s) carrying interference markers`);

  if (args.check) {
    if (!existsSync(out)) fail(`--check needs an existing manifest to compare against; ${relative(REPO_ROOT, out)} does not exist.`);
    const prior = JSON.parse(readFileSync(out, "utf8")) as { popups?: unknown[] };
    const a = JSON.stringify(prior.popups ?? []);
    const b = JSON.stringify(merged);
    if (a === b) {
      console.log(`\n  CONTROL PASSED: reproduces ${relative(REPO_ROOT, out)}'s popups array byte for byte.`);
    } else {
      console.log(`\n  CONTROL FAILED: differs from ${relative(REPO_ROOT, out)}.`);
      const pa = (prior.popups ?? []) as Array<{ heat_id?: string }>;
      console.log(`    on disk: ${pa.length} popups; rebuilt: ${merged.length}`);
      for (let i = 0; i < Math.max(pa.length, merged.length); i++) {
        const x = JSON.stringify(pa[i]);
        const y = JSON.stringify(merged[i]);
        if (x !== y) {
          console.log(`    first difference at index ${i}:`);
          console.log(`      on disk: ${x}`);
          console.log(`      rebuilt: ${y}`);
          break;
        }
      }
      process.exit(1);
    }
    return;
  }

  if (existsSync(out) && !args.force) {
    fail(
      `${relative(REPO_ROOT, out)} already exists.\n` +
        `  A manifest written by a real collection run outranks a reconstruction.\n` +
        `  Pass --force only if you mean to replace it.`,
    );
  }

  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n  written -> ${relative(REPO_ROOT, out)}`);
  console.log(`  Next: npx tsx scripts/ingest_popups.ts --season ${args.season} --event ${args.event}`);
}

main();
