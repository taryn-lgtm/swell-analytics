#!/usr/bin/env tsx
/**
 * verify_popup_attribution.ts — run the collector's own attribution guards over
 * every popup already on disk.
 *
 * WHY THIS EXISTS
 *   The 17 August misattribution finding closed with four steps. Three were
 *   done in `278da90` — the guards module, the collector wiring, the controls.
 *   Step 4 was "re-run the sample and confirm distinct sha256 with matching ids
 *   before any bulk collection", and it was never recorded as done. Meanwhile
 *   `docs/CURRENT_MILESTONE.md` and `HANDOVER.md` both still described Tier 2 as
 *   halted, so the fix sat unclaimed for two days.
 *
 *   A guard that runs only at capture time protects the next capture. It says
 *   nothing about the captures already retained. This closes that gap: it reads
 *   the bytes on disk and asks the same two questions the collector asks.
 *
 * WHAT IT CHECKS
 *   A. Every `*_popup.html` in docs/sources/raw/ names the heat its filename
 *      claims, and no two are byte-identical.
 *   B. Both CORRUPT_ fixtures are REJECTED. A guard that never fails has not
 *      been shown to work — the negative half is the half that proves it.
 *   C. duplicateFailure fires on identical bytes.
 *
 *   B and C are the point. A run reporting "all clean" proves nothing unless the
 *   same functions have just been shown to reject known-bad input in the same
 *   pass. This project has recorded an instrument's silence as the world's
 *   silence eleven times.
 *
 * IT IMPORTS THE REAL FUNCTIONS, NOT A COPY
 *   `athleteBlockCount` once had its own regex inside its control; the control
 *   passed while the function was broken. These are the functions
 *   collect_heat_popups.ts calls.
 *
 * Usage:
 *   tsx scripts/verify_popup_attribution.ts
 *   Exit 0 = every check passed. Exit 1 = something needs a human.
 *
 * INSIDE COWORK, USE NODE RATHER THAN TSX
 *   node --experimental-strip-types scripts/verify_popup_attribution.ts
 *
 *   `npx tsx` fails on the Cowork mount with an esbuild `TransformError`. That
 *   is a platform mismatch, not a defect in this script and not a broken repo:
 *   `node_modules/@esbuild/` holds `darwin-arm64` and the Cowork VM is Linux
 *   aarch64, so esbuild cannot find a binary for the host it is running on.
 *   Node's own type stripping needs no native binary and produces the identical
 *   verdict — both paths were run on 19 August and both returned 12 of 12.
 *
 *   Recorded because this project has twice diagnosed a sandbox property as a
 *   code defect (docs/findings/2026-08-10_git_locks_in_sandbox.md). Do not
 *   reinstall node_modules to "fix" it — that would break the native run.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RAW_DIR, REPO_ROOT } from "./lib/retain.ts";
import { attributionFailure, duplicateFailure, heatIdMentions } from "./lib/popup_guards.ts";

const FIXTURE_DIR = join(REPO_ROOT, "docs/sources/fixtures");

/** The known-bad captures from 17 August, kept precisely so this can run. */
const NEGATIVE_CONTROLS: { file: string; filedAs: string }[] = [
  { file: "CORRUPT_claims_heat_105130_contains_105160.html", filedAs: "105130" },
  { file: "CORRUPT_claims_heat_105131_contains_105130.html", filedAs: "105131" },
];

function sha256(html: string): string {
  return createHash("sha256").update(Buffer.from(html, "utf8")).digest("hex");
}

function main(): void {
  let failures = 0;

  // ---- A. the retained set -------------------------------------------------
  console.log("\nA. Retained popups — attribution and distinctness\n");

  const files = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith("_popup.html"))
    .sort();

  if (files.length === 0) {
    console.error("  no *_popup.html in docs/sources/raw/ — nothing to verify.");
    console.error("  That is not a pass. Exiting non-zero so it cannot read as one.");
    process.exit(1);
  }

  const bySha = new Map<string, string>();
  let clean = 0;

  for (const f of files) {
    const heatId = /_heat_(\d+)_popup\.html$/.exec(f)?.[1] ?? null;
    if (heatId === null) {
      console.log(`  FAIL  ${f} — filename carries no heat id, so it cannot be checked.`);
      failures++;
      continue;
    }

    const html = readFileSync(join(RAW_DIR, f), "utf8");
    const sha = sha256(html);

    const attribution = attributionFailure(html, heatId);
    const duplicate = bySha.has(sha)
      ? `byte-identical to ${bySha.get(sha)} (sha256 ${sha.slice(0, 16)}…)`
      : null;

    // Other heat ids in the chrome are expected — the popup links on to the
    // next-round heat. Reported, never treated as a failure on its own.
    const others = [...new Set([...html.matchAll(/heatId=(\d+)/g)].map((m) => m[1]))].filter(
      (x) => x !== heatId,
    );

    if (attribution === null && duplicate === null) {
      clean++;
      console.log(
        `  PASS  heat ${heatId}  ${String(Buffer.byteLength(html, "utf8")).padStart(6)}B  ` +
          `sha ${sha.slice(0, 12)}…  self-refs=${heatIdMentions(html, heatId)}` +
          (others.length > 0 ? `  also-names=[${others.join(",")}]` : ""),
      );
    } else {
      failures++;
      console.log(`  FAIL  heat ${heatId}  ${f}`);
      if (attribution !== null) console.log(`        ${attribution}`);
      if (duplicate !== null) console.log(`        ${duplicate}`);
    }

    if (!bySha.has(sha)) bySha.set(sha, `heat ${heatId}`);
  }

  console.log(
    `\n  ${clean} of ${files.length} clean. ` +
      `${bySha.size} distinct sha256 across ${files.length} files.`,
  );

  // ---- B. the negative controls -------------------------------------------
  console.log("\nB. Negative controls — the guard must REJECT these\n");

  let caught = 0;
  for (const { file, filedAs } of NEGATIVE_CONTROLS) {
    const path = join(FIXTURE_DIR, file);
    if (!existsSync(path)) {
      console.log(`  FAIL  ${file} is missing. The negative control cannot run, so`);
      console.log(`        section A above is unverified — a guard not shown to fail`);
      console.log(`        has not been shown to work. Restore it from git.`);
      failures++;
      continue;
    }
    const bad = attributionFailure(readFileSync(path, "utf8"), filedAs);
    if (bad !== null) {
      caught++;
      console.log(`  CAUGHT  ${file}\n          ${bad}\n`);
    } else {
      failures++;
      console.log(`  MISSED  ${file} — guard (a) did not fire on a known-bad capture.`);
      console.log(`          Section A's result means nothing until this is fixed.\n`);
    }
  }

  // ---- C. the duplicate guard ---------------------------------------------
  console.log("C. Duplicate guard — exercised directly\n");

  const probe = sha256("identical bytes");
  const dup = duplicateFailure(probe, "105130", { sha: probe, heatId: "105160" });
  const notDup = duplicateFailure(probe, "105130", { sha: sha256("other bytes"), heatId: "105160" });

  if (dup !== null) console.log(`  CAUGHT  ${dup}`);
  else {
    console.log("  MISSED  guard (b) did not fire on identical bytes.");
    failures++;
  }
  if (notDup === null) console.log("  PASS    and it does not fire on differing bytes.");
  else {
    console.log(`  FAIL    guard (b) fired on differing bytes: ${notDup}`);
    failures++;
  }

  // ---- verdict -------------------------------------------------------------
  console.log(`\nVERDICT`);
  console.log(`  computed over ${files.length} retained popups and ${NEGATIVE_CONTROLS.length} fixtures`);
  console.log(`  negative controls firing: ${caught} of ${NEGATIVE_CONTROLS.length}`);
  console.log(`  failures: ${failures}`);
  console.log(
    failures === 0
      ? `\n  PASS — every retained popup names its own heat, all distinct, and the\n` +
          `  guards were shown to reject known-bad input in the same pass.\n`
      : `\n  FAIL — ${failures} problem(s). Do not run bulk collection.\n`,
  );

  process.exit(failures === 0 ? 0 : 1);
}

main();
