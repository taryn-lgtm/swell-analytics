// =====================================================================
// digest_from_disk.ts — the disk half of the disk-vs-database check
// =====================================================================
//
// Usage:
//   npx tsx scripts/digest_from_disk.ts --season 2025 --event 3
//
// Re-parses the retained artefacts for one event and emits the SAME four
// canonical serialisations that supabase/checks/digest_event.sql computes
// inside Postgres, hashed the same way. Two independent paths from the same
// retained bytes: if they agree, the loaded rows are what the pages say.
//
// It does NOT read the generated SQL file. Hashing the intermediate would
// only prove the intermediate matches itself; the question is whether the
// rows in the database still say what the retained HTML says, so this walks
// the parser from the bytes on disk exactly as the generator did.
//
// The two implementations must be kept in step. The canonical form is
// documented once, in supabase/checks/digest_event.sql — read it there.
//
// Assertions written into the ingest that this check does NOT re-assert:
// row counts. Counts are what the ingest's own assertion block already
// guards. Digests catch what counts cannot — a transposition like
// 17.06 -> 17.60 that leaves every count identical.

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { fail } from "./lib/retain.ts";
import { loadEventManifest } from "./lib/manifest.ts";
import { parseResultsPage } from "./lib/parse_results.ts";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const seasonArg = arg("season");
const eventArg = arg("event");
if (!seasonArg || !eventArg) {
  fail("Usage: digest_from_disk.ts --season <year> --event <number>");
}
const season = Number(seasonArg);
const eventNumber = Number(eventArg);

const manifest = loadEventManifest(season, eventNumber);

const pageBySlug = new Map<string, ReturnType<typeof parseResultsPage>>();
for (const r of manifest.rounds) {
  const slug = basename(r.file_path).replace(/\.html$/, "");
  if (!pageBySlug.has(slug)) pageBySlug.set(slug, parseResultsPage(slug));
}

interface RoundBuild {
  roundOrder: number;
  nameGtm: string;
  heats: { heatNumber: number | null; wslHeatId: string }[];
  athletes: {
    wslHeatId: string;
    wslAthleteId: string;
    fullName: string | null;
    position: number | null;
    heatTotal: number | null;
    progressionText: string | null;
  }[];
}

const rounds = new Map<number, RoundBuild>();
for (const page of pageBySlug.values()) {
  for (const heat of page.heats) {
    let rb = rounds.get(heat.roundNumberGtm);
    if (!rb) {
      rb = { roundOrder: heat.roundNumberGtm, nameGtm: heat.roundNameGtm, heats: [], athletes: [] };
      rounds.set(heat.roundNumberGtm, rb);
    }
    rb.heats.push(heat);
    rb.athletes.push(...page.athletes.filter((a) => a.wslHeatId === heat.wslHeatId));
  }
}
const roundList = [...rounds.values()].sort((a, b) => a.roundOrder - b.roundOrder);

/** Postgres `trim_scale(numeric)::text`: drop trailing zeros, keep the value.
 *  Trap 16 — the GTM blob strips them and the rendered markup does not, so the
 *  two sides can only agree numerically. */
const num = (v: number | null): string =>
  v === null || v === undefined ? "" : String(v);

const sha = (lines: string[]): string =>
  createHash("sha256")
    .update(Buffer.from([...lines].sort().join("\n"), "utf8"))
    .digest("hex");

// rounds — the cross-session anchor, 482c728b… See the long note in
// supabase/checks/digest_event.sql before touching this line. The SQL side
// uses concat_ws, which DROPS the NULL wsl_code rather than leaving an empty
// field, so there are six fields here and not seven. max_heat_score renders at
// its stored scale ('20.00') and is_leaderboard renders 'f'. The last four are
// Era A constants the generator writes from the rulebook, not values read off
// the page — mirrored here as the constants they are.
const roundLines = roundList.map(
  (rb) => `${rb.roundOrder}|${rb.nameGtm}|2|20.00|best_two_overall|f`,
);

// heats: round_order|heat_number|sequence_in_round|wsl_heat_id|status
// sequence_in_round is written equal to heat_number by the generator.
const heatLines = roundList.flatMap((rb) =>
  rb.heats.map(
    (h) => `${rb.roundOrder}|${num(h.heatNumber)}|${num(h.heatNumber)}|${h.wslHeatId}|completed`,
  ),
);

// surfers: wsl_athlete_id|full_name|country_code
// country_code is never written by the Tier 1 ingest — the page publishes a
// flag title, not a code, and that gap is a data_gaps row. Empty on both sides.
const surfers = new Map<string, string>();
for (const rb of roundList) {
  for (const a of rb.athletes) {
    if (a.fullName && !surfers.has(a.wslAthleteId)) surfers.set(a.wslAthleteId, a.fullName);
  }
}
const surferLines = [...surfers.entries()].map(([id, name]) => `${id}|${name}|`);

// heat_entries: wsl_heat_id|wsl_athlete_id|position|heat_total|finished_position|progression_text
// finished_position is not written by the Tier 1 ingest. Empty on both sides.
const entryLines = roundList.flatMap((rb) =>
  rb.athletes.map(
    (a) =>
      `${a.wslHeatId}|${a.wslAthleteId}|${num(a.position)}|${num(a.heatTotal)}||${a.progressionText ?? ""}`,
  ),
);

console.log(`rounds|${sha(roundLines)}`);
console.log(`heats|${sha(heatLines)}`);
console.log(`surfers|${sha(surferLines)}`);
console.log(`heat_entries|${sha(entryLines)}`);
