// =====================================================================
// finals.test.ts — Title Match labels and series notes
// =====================================================================
//
// Run: npx tsx src/lib/finals.test.ts   (exits 1 on any failure)
//
// The cases are the two published Title Matches: 2024 "J. Florence Wins
// 2 - 0" (best of three, two heats) and 2025 "Y. Dora Wins 1 - 0" (world #1
// won Heat 1). Plus the state v2 was in until migration 21: one 2024 heat,
// which must NOT render as a 1–0 win in a best-of-three.

import assert from "node:assert/strict";
import { displayHeatNumber, seriesResult, shortName, titleMatchNote, titleMatchNoteFor } from "./finals";

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${(e as Error).message}`);
  }
}

const jjf = "John John Florence";
const italo = "Italo Ferreira";
const h = (a: number, b: number) => ({ entries: [{ fullName: jjf, position: a }, { fullName: italo, position: b }] });

check("2024, both heats: best of three · J. Florence won 2–0", () =>
  assert.equal(titleMatchNote(2024, seriesResult([h(1, 2), h(1, 2)])), "best of three · J. Florence won 2–0"));
check("2024, one heat held: never a 1–0 win in a best-of-three", () =>
  assert.equal(titleMatchNote(2024, seriesResult([h(1, 2)])), "best of three · 1 heat of the series held; result incomplete"));
check("2025, Heat 1 rule: Y. Dora won 1–0", () =>
  assert.equal(
    titleMatchNote(2025, seriesResult([{ entries: [{ fullName: "Yago Dora", position: 1 }, { fullName: "Griffin Colapinto", position: 2 }] }])),
    "world #1 wins the title by winning Heat 1, otherwise best of three · Y. Dora won 1–0",
  ));
check("a surfer's own side: lost 0–2", () => assert.equal(titleMatchNoteFor(2024, 0, 2), "best of three · lost 0–2"));
check("an unlisted season shows no rule, only the result", () =>
  assert.equal(titleMatchNote(2030, seriesResult([h(1, 2), h(2, 1), h(1, 2)])), "J. Florence won 2–1"));
check("shortName: John John Florence -> J. Florence", () => assert.equal(shortName(jjf), "J. Florence"));
check("Finals match: no heat number", () => assert.equal(displayHeatNumber("wsl_finals", 2, 2), null));
check("Title Match stored heat 5 is series heat 2", () => assert.equal(displayHeatNumber("wsl_finals", 4, 5), 2));
check("ordinary events keep the stored number", () => assert.equal(displayHeatNumber("regular", 1, 7), 7));

console.log(failures === 0 ? "\nall checks pass" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
