// =====================================================================
// parse_popup.test.ts — controls for the Tier 2 popup parser
// =====================================================================
//
// Same principle as docs/sources/controls.json and parse_results.test.ts:
// every count pinned to a retained artefact where the thing is KNOWN
// PRESENT, with an exact expected number read off the artefact.
//
// AND THE HALF THAT MATTERS MORE — Part C deliberately breaks real
// retained bytes and asserts the checks FIRE. A parser whose checks have
// only ever passed has not been shown to work. The four mutations are
// the four ways this parser can be wrong:
//
//   1. a column loses a slot        -> attribution silently shifts
//   2. a counted marker disappears  -> the pair no longer makes the total
//   3. a score is transposed        -> 4.67 becomes 6.47, counts unchanged
//   4. the stat bar moves           -> conditions go null, unnoticed
//
// Mutation 3 is the one nothing else in this project would catch: the
// ride count is right, the attribution is right, the digest is honest,
// and the number is wrong. It is caught here only because the popup
// publishes the heat total independently of the rides that make it.
//
// Run: npx tsx scripts/lib/parse_popup.test.ts

import { readdirSync } from "node:fs";
import {
  parsePopup,
  parsePopupMarkup,
  parseStatBar,
  parseWaveColumns,
  athleteIdsBySlot,
} from "./parse_popup.ts";
import { readRetainedHtml, stripNonMarkup } from "./parse_results.ts";

const SAMPLE = "2025_ct_322_meo_rip_curl_pro_portugal_results_heat_105133_popup";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}` +
      (ok
        ? ` = ${JSON.stringify(actual)}`
        : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`),
  );
}

// =====================================================================
// Part A — one popup, pinned exactly
// =====================================================================

console.log("\nA. Heat 105133 — every field pinned to the retained artefact\n");

const p = parsePopup(SAMPLE);

check("heat id", p.wslHeatId, "105133");
check("athletes", p.athletes.length, 2);
check("athlete names", p.athletes.map((a) => a.shortName), ["I. deVault", "J. Marshall"]);
check("rides parsed", p.rides.length, 19);
check("conditions: wave range", p.conditions.waveRangePublished, "4-6'");
check("conditions: min/max ft", [p.conditions.waveHeightMinFt, p.conditions.waveHeightMaxFt], [4, 6]);
check("conditions: wind", p.conditions.windConditions, "Onshore");
check("conditions: published wave count", p.conditions.publishedWaveCount, 19);
check("conditions: published avg heat score", p.conditions.publishedAvgHeatScore, 9.12);
check("stat labels all as expected", parseStatBar(stripNonMarkup(readRetainedHtml(SAMPLE))).labelMismatches, []);

// Attribution, spelled out. deVault is athlete-index 1 and place 1 — the two
// agree here, which is why they are read from different attributes.
const deVault = p.rides.filter((r) => r.wslAthleteId === "4491");
const marshall = p.rides.filter((r) => r.wslAthleteId === "3122");
check("deVault ride count", deVault.length, 11);
check("marshall ride count", marshall.length, 8);
check(
  "deVault counted pair, in ride order",
  deVault.filter((r) => r.counted).map((r) => [r.waveOrder, r.score]),
  [[8, 4], [9, 5.43]],
);
check(
  "marshall counted pair, in ride order",
  marshall.filter((r) => r.counted).map((r) => [r.waveOrder, r.score]),
  [[4, 4.67], [5, 4.13]],
);

// The whole reason Tier 2 exists. Tier 1 publishes the pair as "5.43 + 4.00",
// ordered by score. Those are rides 9 and 8. Writing the caption's order into
// wave_order would record rank as chronology — trap 15.
check(
  "caption order is NOT ride order",
  p.athletes[0].countedWaves,
  [5.43, 4],
);
check(
  "ride order of the same pair is ascending by wave_order",
  deVault.filter((r) => r.counted).map((r) => r.waveOrder),
  [8, 9],
);

check("wave ids captured", deVault.every((r) => r.wslWaveId !== null), true);
check("wave orders are 1..11 with no gaps", deVault.map((r) => r.waveOrder), [1,2,3,4,5,6,7,8,9,10,11]);
check("consistent", p.consistent, true);

// =====================================================================
// Part A2 — the three-surfer shape
// =====================================================================
//
// Rounds 1-2 are heats of THREE, and until 19 August no popup of that shape had
// ever been collected: the round filter skipped them, so every control above ran
// on heats of two. A column-slot parser that happens to work at two surfers and
// breaks at three is exactly the bug this file exists to catch, so the shape is
// pinned separately rather than trusted to Part B's aggregate.
//
// This heat is also the one CLAUDE.md trap 15 is written about. Dora's counting
// pair is published as "4.53 + 4.00" — score order — and the grid puts 4.00
// first, because it is the earlier ride. The parser reproduces the trap's own
// worked example from bytes collected three weeks after it was written down.

console.log("\nA2. Heat 104704 — Opening Round, three surfers\n");

const three = parsePopup("2025_ct_320_lexus_pipe_pro_results_heat_104704_popup");

check("three athletes", three.athletes.length, 3);
check("columns x slots", parseWaveColumns(stripNonMarkup(readRetainedHtml("2025_ct_320_lexus_pipe_pro_results_heat_104704_popup"))).every((c) => c.slots.length === 3), true);
check("rides", three.rides.length, 16);
check("published wave count agrees", three.conditions.publishedWaveCount, 16);
check("names", three.athletes.map((a) => a.shortName), ["S. Moniz", "E. Groggia", "Y. Dora"]);
check("heat totals", three.athletes.map((a) => a.heatTotal), [12.06, 8.73, 8.53]);
check("ride counts", three.athletes.map((a) => a.rideCount), [6, 3, 7]);

// Trap 15, as a control rather than a comment.
const dora = three.rides.filter((r) => r.wslAthleteId === "3994");
check("Dora ride count", dora.length, 7);
check(
  "Dora counted rides in RIDE order",
  dora.filter((r) => r.counted).map((r) => [r.waveOrder, r.score]),
  [[5, 4], [7, 4.53]],
);
check("Dora caption is in SCORE order", three.athletes[2].countedWaves, [4.53, 4]);
check("the two orders differ, and both are right", true, true);
check("all checks pass on three surfers", three.consistent, true);

// =====================================================================
// Part A3 — a surfer who caught ONE wave
// =====================================================================
//
// Added 19 August 2026 after this file's own rule refused four legitimate
// heats. The check demanded exactly two counted rides; rulebook 10.05(c) sets
// two as a MAXIMUM. Seth Moniz rode once at Bells in 2024, scored 5.00, and his
// heat total is 5.00 — the source was right and the control was wrong.
//
// Pinned so the relaxation cannot quietly widen: one counted ride is correct
// only when one ride was taken.

console.log("\nA3. Heat 100179 — a surfer with a single ride\n");

const oneRide = parsePopup("2024_ct_199_rip_curl_pro_bells_beach_results_heat_100179_popup");
const moniz = oneRide.rides.filter((r) => r.wslAthleteId === oneRide.athletes[2].wslAthleteId);

check("three surfers", oneRide.athletes.length, 3);
check("Moniz rode once", moniz.length, 1);
check("and that one ride counted", moniz.filter((r) => r.counted).length, 1);
check("his heat total is that ride", oneRide.athletes[2].heatTotal, 5);
check("Slater rode five, counted two", [
  oneRide.rides.filter((r) => r.wslAthleteId === oneRide.athletes[0].wslAthleteId).length,
  oneRide.rides.filter((r) => r.wslAthleteId === oneRide.athletes[0].wslAthleteId && r.counted).length,
], [5, 2]);
check("the heat is consistent", oneRide.consistent, true);

// The 2dp arithmetic that a float got wrong: 18.40 and 14.87 mean exactly
// 16.635, which WSL publishes as 16.64. Math.round(mean*100)/100 gave 16.63.
console.log("\n    and the rounding case\n");
const rounding = parsePopup("2024_ct_200_western_australia_margaret_river_pro_results_heat_100528_popup");
check("published average", rounding.conditions.publishedAvgHeatScore, 16.64);
check("heat totals", rounding.athletes.map((a) => a.heatTotal), [18.4, 14.87]);
check("the average check passes", rounding.consistent, true);

// =====================================================================
// Part B — every retained popup
// =====================================================================

console.log("\nB. All retained popups — the source held to its own arithmetic\n");

const slugs = readdirSync(new URL("../../docs/sources/raw", import.meta.url))
  .filter((f) => f.endsWith("_popup.html"))
  .map((f) => f.replace(/\.html$/, ""))
  .sort();

check("popups on disk", slugs.length > 0, true);

let rides = 0;
let checksRun = 0;
for (const slug of slugs) {
  const r = parsePopup(slug);
  rides += r.rides.length;
  checksRun += r.checks.length;
  const failed = r.checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    failures++;
    console.log(`FAIL  ${slug}`);
    for (const f of failed) console.log(`        ${f.name} — ${f.detail}`);
  } else {
    console.log(
      `PASS  heat ${r.wslHeatId}  ${String(r.rides.length).padStart(2)} rides  ` +
        `${r.conditions.waveRangePublished} ${r.conditions.windConditions}  ` +
        `avg ${r.conditions.publishedAvgHeatScore}  (${r.checks.length} checks)`,
    );
  }
}
console.log(`\n      ${slugs.length} popups · ${rides} rides · ${checksRun} checks run`);

// =====================================================================
// Part C — the checks must FIRE on broken bytes
// =====================================================================

console.log("\nC. Negative controls — real bytes, deliberately broken\n");

const good = stripNonMarkup(readRetainedHtml(SAMPLE));

function firesOn(name: string, mutated: string, expectFailing: string): void {
  const r = parsePopupMarkup(mutated, `${SAMPLE}__MUTATED`);
  const failed = r.checks.filter((c) => !c.ok).map((c) => c.name);
  const caught = failed.some((n) => n.includes(expectFailing));
  if (!caught) failures++;
  console.log(
    `${caught ? "CAUGHT" : "MISSED"}  ${name}\n` +
      `        consistent=${r.consistent}  failing: ${failed.length > 0 ? failed.join(" | ") : "(none)"}`,
  );
}

// 1. Drop one slot from a column. Every later slot in that column shifts up,
//    so athlete 2's ride is read as athlete 1's.
firesOn(
  "a column loses a slot",
  good.replace(/<div class="wave wave--empty"[^>]*>[\s\S]*?<\/div>/, ""),
  "every column has one slot per surfer",
);

// 2. Remove one counted marker. The remaining single ride cannot make the
//    published heat total.
firesOn(
  "a counting marker disappears",
  good.replace(/wave wave--counted/, "wave"),
  "counted rides sum to the heat total",
);

// 3. Transpose a score: 4.67 -> 6.47. Same digits, same ride count, same
//    attribution, honest digest. Nothing else in this project sees it.
firesOn(
  "a score is transposed (4.67 -> 6.47)",
  good.replace(">4.67<", ">6.47<"),
  "counted rides sum to the heat total",
);

// 4. The stat bar changes shape. Conditions go null — which is the failure
//    that hid for one draft of this parser and was caught only by the
//    published-count check.
firesOn(
  "the stat bar is not where we look",
  good.replace(/stat-bar__stat-item/g, "stat-bar__statXitem"),
  "published total waves equals rides parsed",
);

// And the control on the control: unmutated bytes must still pass, in the
// same run, or "CAUGHT" above proves nothing about the good case.
const controlOfControls = parsePopupMarkup(good, SAMPLE);
check("unmutated bytes still pass in the same run", controlOfControls.consistent, true);

// =====================================================================
// Part D — the small parts, exercised directly
// =====================================================================

console.log("\nD. Component parts\n");

const cols = parseWaveColumns(good);
check("columns", cols.length, 11);
check("every column has 2 slots", cols.every((c) => c.slots.length === 2), true);
check("column wave numbers", cols.map((c) => c.waveOrder), [1,2,3,4,5,6,7,8,9,10,11]);
check("empty slots", cols.reduce((n, c) => n + c.slots.filter((s) => s.empty).length, 0), 3);
check("11 + 8 = 19 non-empty slots", cols.reduce((n, c) => n + c.slots.filter((s) => !s.empty).length, 0), 19);

const slots = athleteIdsBySlot(good);
check("slot 1 -> deVault", slots.get(1), "4491");
check("slot 2 -> marshall", slots.get(2), "3122");
check("only the two identified blocks have a slot", slots.size, 2);

// =====================================================================

console.log(
  failures === 0
    ? `\nPASS — 0 failures. ${slugs.length} popups, ${rides} rides, all four negative controls fired.\n`
    : `\nFAIL — ${failures} failure(s). Do not load waves from these popups.\n`,
);
process.exit(failures === 0 ? 0 : 1);
