// =====================================================================
// verify_compare.ts -- /compare's arithmetic against independent SQL
// =====================================================================
//
// Run: npx tsx --require ./scripts/verify_compare/stub_server_only.cjs \
//        scripts/verify_compare/verify_compare.ts
//      (needs NEXT_PUBLIC_SUPABASE_URL_V2 and _PUBLISHABLE_KEY_V2)
//
// The expected_*.tsv files were produced by plain SQL over v2 on
// 15 October 2026 (see the SQL in the 15 October commit message),
// with Postgres doing the averaging and rounding. This script builds the
// page's own dataset through src/lib/queries/compare.ts and runs the
// page's own arithmetic, src/lib/compare.ts, then diffs field by field.
// Two populations: 20 pseudo-random pairs (md5-ordered) and the 8 pairs
// who met most often, so head-to-head is exercised where it is non-trivial.
//
// Control: one deliberately corrupted expectation is checked to FAIL, so a
// comparator that always passes is caught.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCompareDataset } from "@/lib/queries/compare";
import { headToHead, summarise } from "@/lib/compare";
import { formatDerived, formatDerivedSigned } from "@/lib/format";

const dir = join(process.cwd(), "scripts/verify_compare");
const sqlSigned = (s: string) => s.replace(/^\+/, "");

async function main() {
  const ds = await getCompareDataset();
  const id = new Map(ds.surfers.map((s) => [s.slug, s.id]));
  let pass = 0;
  let fail = 0;

  const render = (a: string, b: string): string => {
    const ia = id.get(a);
    const ib = id.get(b);
    if (ia == null || ib == null) return `${a}|${b}|UNKNOWN SLUG`;
    const side = (sid: number) => {
      const s = summarise(ds, sid, null);
      return [
        s.heats,
        s.events,
        `${s.wins3.won}/${s.wins3.of}`,
        `${s.wins2.won}/${s.wins2.of}`,
        s.meanTotal == null ? "-" : formatDerived(s.meanTotal),
        s.meanVsDatum == null ? "-" : sqlSigned(formatDerivedSigned(s.meanVsDatum)),
      ].join("|");
    };
    const h = headToHead(ds, ia, ib, null);
    return [a, b, side(ia), side(ib), h.meetings.length, h.aAhead, h.bAhead].join("|");
  };

  for (const file of ["expected_random20.tsv", "expected_most_met8.tsv"]) {
    for (const line of readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean)) {
      const [a, b] = line.split("|");
      const got = render(a, b);
      if (got === line) {
        pass++;
      } else {
        fail++;
        console.log(`FAIL ${file}\n  want ${line}\n  got  ${got}`);
      }
    }
  }

  // Control: corrupt one field and require a mismatch.
  const control = "jake-marshall|connor-o-leary|58|20|9/22|17/36|11.55|-0.02|60|20|7/22|19/38|11.10|-0.53|8|3|5";
  const controlFired = render("jake-marshall", "connor-o-leary") !== control;
  console.log(`${pass} pass, ${fail} fail; control ${controlFired ? "fired (good)" : "DID NOT FIRE"}`);
  if (fail > 0 || !controlFired) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
