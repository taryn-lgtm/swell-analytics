// =====================================================================
// format.test.ts — controls for exactMean + formatDerived
// =====================================================================
//
// Run: npx tsx src/lib/format.test.ts   (exits 1 on any failure)
//
// The cases are real figures from v2, found 1 October 2026 by
// scripts/verify_surfers against the live /surfers pages: two condition
// split means that are exact half-cent ties and rendered one cent low.
//
// Part B is the control. It runs the OLD float-sum mean over the same
// values and asserts it gets them WRONG. If it ever starts passing, these
// cases no longer discriminate and the test proves nothing.

import assert from "node:assert/strict";
import { countOf, exactMean, fixed, formatDerived, formatDerivedSigned } from "./format";
import { formatTrim } from "./trim";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${(e as Error).message}`);
  }
}

// Gabriel Medina, 1-4' wave height: exact mean 14.255.
const MEDINA = [18.0, 14.94, 13.77, 15.0, 13.66, 10.16];
// Kelly Slater, 1-4' wave height: exact mean 9.935.
const SLATER = [10.1, 9.77];
// Kauli Vaast, mean heat total: exact mean 14.075 (the 11 September case).
const VAAST = [9.03, 16.3, 15.43, 15.54];

// ---- Part A: the fix ------------------------------------------------
check("Medina 1-4' mean renders 14.26", () =>
  assert.equal(formatDerived(exactMean(MEDINA, 2)), "14.26"));
check("Slater 1-4' mean renders 9.94", () =>
  assert.equal(formatDerived(exactMean(SLATER, 2)), "9.94"));
check("Vaast mean heat total renders 14.08", () =>
  assert.equal(formatDerived(exactMean(VAAST, 2)), "14.08"));
check("a negative residual tie at six decimals rounds away from zero", () =>
  assert.equal(formatDerivedSigned(exactMean([-2.141, -2.149], 6)), "\u22122.15"));
check("a positive residual tie at six decimals rounds away from zero", () =>
  assert.equal(formatDerivedSigned(exactMean([0.004, 0.006], 6)), "+0.01"));
check("a negative derived figure uses U+2212, never a hyphen", () =>
  assert.equal(formatDerived(-0.338, 3), "\u22120.338"));
check("formatTrim uses U+2212", () => assert.equal(formatTrim(-0.4449), "\u22120.445"));
check("fixed() uses U+2212 for a tick", () => assert.equal(fixed(-0.5, 1), "\u22120.5"));
check("fixed() leaves zero and positives alone", () => assert.equal(fixed(0.5, 1) + fixed(0, 1), "0.50.0"));
check("plural: 1 heat, 2 heats", () => assert.equal(countOf(1, "heat") + "|" + countOf(2, "heat"), "1 heat|2 heats"));
check("an empty population has no mean", () => assert.equal(exactMean([], 2), null));

// ---- Part B: the control — the old float sum must fail these ---------
const floatMean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
check("control: float-sum mean gets Medina wrong (14.25)", () =>
  assert.equal(formatDerived(floatMean(MEDINA)), "14.25"));
check("control: float-sum mean gets Slater wrong (9.93)", () =>
  assert.equal(formatDerived(floatMean(SLATER)), "9.93"));

console.log(failures === 0 ? "\nall checks pass" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
