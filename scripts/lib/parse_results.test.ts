// =====================================================================
// parse_results.test.ts — controls for the results parser
// =====================================================================
//
// Same principle as docs/sources/controls.json: every count is pinned
// to a retained artefact where the thing is KNOWN PRESENT, with an
// exact expected number, established by reading the artefact.
//
// A parser that has stopped matching returns zero. Zero is a plausible
// number. These assertions are what stop a plausible zero being written
// into the database as a fact about surfing.
//
// Run: npx tsx scripts/lib/parse_results.test.ts

import { parseResultsPage, stripNonMarkup, readRetainedHtml } from "./parse_results.ts";

const PIPE = "2025_ct_320_lexus_pipe_pro_results";
const ELIM = "2025_ct_320_lexus_pipe_pro_results_round_24740";
const BRACKET = "2025_ct_320_lexus_pipe_pro_results_round_24741";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  const mark = ok ? "PASS" : "FAIL";
  console.log(
    `${mark}  ${name}` + (ok ? ` = ${JSON.stringify(actual)}` : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`),
  );
}

// ---------------------------------------------------------------------
// The stylesheet trap, asserted directly
// ---------------------------------------------------------------------

const rawPipe = readRetainedHtml(PIPE);
const strippedPipe = stripNonMarkup(rawPipe);

check(
  "raw bytes mention has-interference on a page with no interference",
  rawPipe.includes("hot-heat-athlete--has-interference"),
  true,
);
check(
  "stripped markup does not",
  strippedPipe.includes("hot-heat-athlete--has-interference"),
  false,
);

// ---------------------------------------------------------------------
// Opening Round — list view, 12 heats of 3
// ---------------------------------------------------------------------

const opening = parseResultsPage(PIPE);
check("opening: shape", opening.shape, "list");
check("opening: heats", opening.heats.length, 12);
check("opening: athlete records", opening.athletes.length, 36);
check(
  "opening: every record has a counting pair",
  opening.athletes.filter((a) => a.countedWaves?.length === 2).length,
  36,
);
check(
  "opening: every record has a progression string",
  opening.athletes.filter((a) => a.progressionText !== null).length,
  36,
);
check(
  "opening: every record has a full name",
  opening.athletes.filter((a) => a.fullName !== null).length,
  36,
);
check(
  "opening: every record has a placing",
  opening.athletes.filter((a) => a.position !== null).length,
  36,
);
check("opening: no interference", opening.athletes.filter((a) => a.hasInterference).length, 0);
check("opening: no duplicate renders", opening.duplicatesCollapsed, 0);
check("opening: rounds represented", [...new Set(opening.heats.map((h) => h.roundNameGtm))], [
  "Opening Round",
]);

// The single record checked field by field, from the retained bytes.
// Dora, heat 104704: heat total 8.53, counting pair 4.53 + 4.00, 7 rides,
// placed 3rd, advanced to the Elimination Round.
const dora = opening.athletes.find(
  (a) => a.wslHeatId === "104704" && a.wslAthleteId === "3994",
);
check("Dora: found", dora !== undefined, true);
check("Dora: full name", dora?.fullName, "Yago Dora");
check("Dora: country title", dora?.countryTitle, "Brazil");
check("Dora: heat total", dora?.heatTotal, 8.53);
check("Dora: counting pair", dora?.countedWaves, [4.53, 4.0]);
check("Dora: ride count", dora?.rideCount, 7);
check("Dora: placing", dora?.position, 3);
check("Dora: progression", dora?.progressionText, "Adv to ER - HT 2");
check("Dora: status", dora?.athleteStatus, "active");

// The decomposition is ordered by score, not chronology — 4.53 is ride
// 7 and 4.00 is ride 5. Asserted so nothing later matches the pair to
// rides positionally. CLAUDE.md trap 15.
check(
  "Dora: counting pair is in descending score order",
  dora?.countedWaves?.[0] !== undefined &&
    dora.countedWaves[1] !== undefined &&
    dora.countedWaves[0] >= dora.countedWaves[1],
  true,
);
// 4.53 + 4.00 is 8.530000000000001 in IEEE 754, not 8.53. Surf scores
// are hundredths, so compare in hundredths — never `===` on a sum of
// parsed scores, and never round for display and then store the
// rounded value. Postgres `numeric` does not have this problem, which
// is why heat_total is numeric and not double precision.
const hundredths = (n: number): number => Math.round(n * 100);
check(
  "Dora: counting pair sums to the heat total, in hundredths",
  dora?.countedWaves?.reduce((a, b) => a + hundredths(b), 0),
  dora?.heatTotal !== null && dora?.heatTotal !== undefined ? hundredths(dora.heatTotal) : null,
);

// ---------------------------------------------------------------------
// Elimination Round — list view, 4 heats of 3
// ---------------------------------------------------------------------

const elim = parseResultsPage(ELIM);
check("elimination: shape", elim.shape, "list");
check("elimination: heats", elim.heats.length, 4);
check("elimination: athlete records", elim.athletes.length, 12);
check(
  "elimination: every record has a counting pair",
  elim.athletes.filter((a) => a.countedWaves?.length === 2).length,
  12,
);

// ---------------------------------------------------------------------
// Bracket — rounds 3-7 on one page, every record rendered twice
// ---------------------------------------------------------------------

const bracket = parseResultsPage(BRACKET);
check("bracket: shape", bracket.shape, "bracket");
check("bracket: heats", bracket.heats.length, 31);
check("bracket: distinct athlete records after collapsing", bracket.athletes.length, 62);
check("bracket: duplicate renders collapsed", bracket.duplicatesCollapsed, 62);
check("bracket: duplicate renders that disagreed", bracket.duplicateConflicts, []);
check(
  "bracket: no record carries a counting pair",
  bracket.athletes.filter((a) => a.countedWaves !== null).length,
  0,
);
check(
  "bracket: no record carries a progression string",
  bracket.athletes.filter((a) => a.progressionText !== null).length,
  0,
);
check(
  "bracket: every record still carries a heat total",
  bracket.athletes.filter((a) => a.heatTotal !== null).length,
  62,
);
check(
  "bracket: interference markers",
  bracket.athletes.filter((a) => a.hasInterference).length,
  2,
);
check(
  "bracket: five rounds on one page",
  [...new Set(bracket.heats.map((h) => h.roundNameGtm))].sort(),
  ["Final", "Quarterfinals", "Round of 16", "Round of 32", "Semifinals"],
);
check(
  "bracket: heats per round",
  Object.fromEntries(
    [...new Set(bracket.heats.map((h) => h.roundNumberGtm))]
      .sort((a, b) => a - b)
      .map((n) => [n, bracket.heats.filter((h) => h.roundNumberGtm === n).length]),
  ),
  { 3: 16, 4: 8, 5: 4, 6: 2, 7: 1 },
);

// ---------------------------------------------------------------------
// Cross-page: the event as a whole
// ---------------------------------------------------------------------

const allHeats = [...opening.heats, ...elim.heats, ...bracket.heats];
check("event: distinct heat ids", new Set(allHeats.map((h) => h.wslHeatId)).size, 47);
check(
  "event: distinct athletes",
  new Set([...opening.athletes, ...elim.athletes, ...bracket.athletes].map((a) => a.wslAthleteId))
    .size,
  36,
);
check(
  "event: every bracket athlete has a full name from rounds 1-2",
  bracket.athletes.every((b) =>
    [...opening.athletes, ...elim.athletes].some(
      (a) => a.wslAthleteId === b.wslAthleteId && a.fullName !== null,
    ),
  ),
  true,
);

console.log(
  `\n${failures === 0 ? "ALL CONTROLS PASS" : `${failures} CONTROL(S) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
