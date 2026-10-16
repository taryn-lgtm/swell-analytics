// =====================================================================
// ingest_event.ts — Tier 1 ingest: retained artefacts to reviewable SQL
// =====================================================================
//
// Reads the retained pages for one event from disk and writes a single
// idempotent SQL file. It does not connect to the database and it does
// not fetch. Rule 6: Claude prepares and verifies, Taryn executes.
//
// Usage:
//   npx tsx scripts/ingest_event.ts --season 2025 --event 1
//   node --experimental-strip-types scripts/ingest_event.ts --season 2025 --event 1
//
// Output: supabase/seeds/ingest_<season>_e<nn>_<slug>.sql
//
// ---------------------------------------------------------------------
// WHAT THIS WRITES, AND WHAT IT REFUSES TO WRITE
// ---------------------------------------------------------------------
//
// Writes: seasons, events, rounds, heats, surfers, heat_entries, and a
// data_gaps row for everything below that is absent.
//
// Refuses, with a gap row instead of a value:
//
//   events.start_date / end_date / venue_id
//     ONLY when this season's calendar page is not retained — checked
//     against disk on every run, never asserted. Both 2024 and 2025
//     calendars were retained on 19 August 2026, so for those seasons
//     this generator writes no gap row and the values come from
//     supabase/seeds/venues_and_heat_venues.sql instead.
//
//   surfers.country_code
//     The page publishes a flag title ("Brazil", "Hawaii"). That is not
//     a country code, `countries` is empty, and "Hawaii" is not a
//     country at all. Mapping title to code is a derivation with no
//     source. The titles stay recoverable from the artefact.
//
//   heat_entries.advanced_to_round_id
//     The progression string ("Adv to ER - HT 2") is stored verbatim.
//     Resolving "ER" to a round row means expanding an abbreviation
//     nobody has sourced. Round names are data, never an enum —
//     CLAUDE.md trap 6.
//
//   waves — nothing at all, for a reason that changes the Tier 2 plan.
//     Rounds 1-2 DO publish the counting pair, so item 5 is satisfiable
//     from Tier 1 as published data. But `waves.wave_order` is NOT NULL
//     and the pair is ordered by SCORE, not chronology — Dora's
//     "4.53 + 4.00" is rides 7 and 5. Writing the pair as wave_order
//     1 and 2 records rank as if it were ride order, which is trap 15
//     committed deliberately. The popup gives real ride order.
//     Consequence: Tier 2 is needed for rounds 1-2 as well, so the
//     figure is 47 popups per pre-cut event, not 31. See the gap row.
//
//   event_entries — not here. Event placings and points come from the
//     rankings page, and deriving points from placings is the exact v1
//     failure: wildcards score no points despite having a placing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import yaml from "js-yaml";
import { REPO_ROOT, fail, isRecord } from "./lib/retain.ts";
import { loadEventManifest } from "./lib/manifest.ts";
import { parseResultsPage, type AthleteRecord, type HeatRecord } from "./lib/parse_results.ts";
import { verifyControls } from "./lib/controls.ts";
import { waveGapSql } from "./lib/wave_gaps.ts";

// ---------------------------------------------------------------------
// Season facts, from the format spec. Each carries its own grade.
// ---------------------------------------------------------------------

interface SeasonFacts {
  year: number;
  eraCode: string;
  preCutEventCount: number;
  cutAfterEvent: number | null;
  /** `unsourced` forces cut_source_artefact_id NULL by CHECK. */
  cutSourceGrade: "declarative" | "corroborating" | "interpolated" | "unsourced";
  cutSourceNote: string;
}

const SEASONS: Record<number, SeasonFacts> = {
  2025: {
    year: 2025,
    eraCode: "A",
    preCutEventCount: 7,
    cutAfterEvent: 7,
    cutSourceGrade: "unsourced",
    cutSourceNote:
      "docs/format-spec/seasons/2025.yaml cut.source is null. after_event 7 is inferred from " +
      "the calendar position of the Margaret River Pro and is consistent with the throwaway " +
      "validation, but no published WSL announcement has been cited. Consistency is not a source.",
  },
  2024: {
    year: 2024,
    eraCode: "A",
    preCutEventCount: 5,
    cutAfterEvent: 5,
    cutSourceGrade: "unsourced",
    cutSourceNote: "docs/format-spec/seasons/2024.yaml cut.source is null.",
  },
};

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const seasonArg = arg("season");
const eventArg = arg("event");
if (!seasonArg || !eventArg) {
  fail("Usage: ingest_event.ts --season <year> --event <number>");
}
const season = Number(seasonArg);
const eventNumber = Number(eventArg);

const facts = SEASONS[season];
if (!facts) {
  fail(
    `No season facts recorded for ${season}. Add them from docs/format-spec/seasons/${season}.yaml ` +
      `with their source grades. Not inferred from another season — several Era A rules are known ` +
      `not to generalise.`,
  );
}

// ---------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------

function q(v: string | null): string {
  return v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
}
function n(v: number | null): string {
  return v === null ? "NULL" : String(v);
}
function b(v: boolean): string {
  return v ? "true" : "false";
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------
// Gather
// ---------------------------------------------------------------------

console.log(`\ningest_event — season ${season}, event ${eventNumber}\n`);

// The controls run first and their failure is fatal. A parser that has
// stopped matching returns zero, and zero is a plausible number.
// verifyControls aborts the process itself on any mismatch — a control
// failure does not mean WSL changed, it means the selector and the
// retained artefact disagree, and which of the two is wrong is a
// question for a human, not for this script.
const controls = verifyControls(true);
console.log(`controls: ${controls.checked} checked, ${controls.skipped.length} skipped`);
for (const s of controls.skipped) console.log(`  SKIPPED ${s}`);

const manifest = loadEventManifest(season, eventNumber);

interface RoundBuild {
  roundOrder: number;
  nameGtm: string;
  wslRoundId: string;
  /** sha256 of the page the round's data was actually read from. */
  artefactSha: string;
  heats: HeatRecord[];
  athletes: AthleteRecord[];
  countingPairPublished: boolean;
}

// Parse every distinct retained page once, then attribute rounds to the
// page each was read from — not to the page whose URL names it. Rounds
// 4-7 are served by the bracket page and `?roundId=` for any of them
// returns that same page byte-for-byte.
/** sha256 comes from the sidecar written beside the bytes, never recomputed
 *  here — the sidecar is the provenance record and the two must agree by
 *  construction, not by a second independent hash. */
function shaOf(slug: string): string {
  const p = join(REPO_ROOT, "docs/sources/raw", `${slug}.json`);
  if (!existsSync(p)) fail(`no sidecar for ${slug}. Bytes without provenance are not usable.`);
  const parsed: unknown = JSON.parse(readFileSync(p, "utf8"));
  const sha = isRecord(parsed) ? parsed.sha256 : undefined;
  if (typeof sha !== "string") fail(`sidecar ${slug}.json has no sha256`);
  return sha;
}

/** The venue and dates the season spec states for this event, quoted verbatim
 *  into the data_gaps row that records them as unsourced. Read from the file
 *  rather than written inline: the inline version said "venue Pipeline,
 *  2025-01-27 to 2025-02-08" for every event, which was true of event 1 and
 *  false of the rest, and put a fabricated fact in a provenance record. Event 1
 *  could not reveal it — only a second event could. */
function specEventFacts(season: number, eventNumber: number): string {
  const path = join(REPO_ROOT, "docs/format-spec/seasons", `${season}.yaml`);
  if (!existsSync(path)) fail(`no season spec at docs/format-spec/seasons/${season}.yaml`);
  const doc = yaml.load(readFileSync(path, "utf8"));
  if (!isRecord(doc) || !Array.isArray(doc.events)) {
    fail(`docs/format-spec/seasons/${season}.yaml has no \`events\` list`);
  }
  const ev = doc.events.find(
    (e): e is Record<string, unknown> => isRecord(e) && e.number === eventNumber,
  );
  if (!ev) fail(`season ${season} has no event number ${eventNumber} in the spec`);

  // js-yaml resolves an unquoted YAML timestamp to a Date, so render it back
  // to the ISO day the file actually carries rather than to a locale string.
  const day = (v: unknown): string =>
    v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v : "null";

  const venue = typeof ev.venue === "string" ? ev.venue : "null";
  return `venue ${venue}, ${day(ev.start_date)} to ${day(ev.end_date)}`;
}

/**
 * The three booleans the season spec DECLARES about an event.
 *
 * ADDED 19 August 2026, after v_pre_cut_count_check reported (2024, declared 5,
 * counted 9) and (2025, declared 7, counted 10).
 *
 * These were hard-coded `false, true, true` for every event. The season spec
 * has always carried the right values — 2024 marks events 6-9 post-cut, 2025
 * marks 8-11 — and this generator never read them. So every loaded event
 * claimed to sit before the cut and to be throwaway-eligible.
 *
 * That is not cosmetic. occurs_after_cut decides who is still on tour, and
 * throwaway_eligible decides which result a surfer gets to discard. The cut is
 * the single most consequential fact in an Era A season.
 *
 * It went unnoticed because the check that catches it, v_pre_cut_count_check,
 * compares seasons.pre_cut_event_count against the events loaded — and until
 * both seasons were fully loaded it had nothing to disagree with. The first
 * complete load found it immediately.
 */
function specEventFlags(
  season: number,
  eventNumber: number,
): { isPostCut: boolean; throwawayEligible: boolean; awardsRankingPoints: boolean } {
  const path = join(REPO_ROOT, "docs/format-spec/seasons", `${season}.yaml`);
  const doc = yaml.load(readFileSync(path, "utf8"));
  if (!isRecord(doc) || !Array.isArray(doc.events)) {
    fail(`docs/format-spec/seasons/${season}.yaml has no \`events\` list`);
  }
  const ev = doc.events.find(
    (e): e is Record<string, unknown> => isRecord(e) && e.number === eventNumber,
  );
  if (!ev) fail(`season ${season} has no event number ${eventNumber} in the spec`);

  // is_post_cut and throwaway_eligible must be STATED. Every event in both
  // season files states both, and a missing key silently defaulting to false
  // would reintroduce the same silence in a quieter form.
  for (const key of ["is_post_cut", "throwaway_eligible"]) {
    if (typeof ev[key] !== "boolean") {
      fail(
        `season ${season} event ${eventNumber} does not state \`${key}\` in the spec.\n` +
          `  Refusing to assume it. These two decide the cut and the throwaway rule.`,
      );
    }
  }

  // awards_ranking_points is different, and the guard above caught the
  // difference rather than my noticing it: the spec states it ONLY as an
  // exception, once per season, on the WSL Finals. Awarding ranking points is
  // the defining property of a Championship Tour event, so absence here means
  // "yes" — which is also the column's own default in the schema. Written as
  // an explicit `!== false` so the reader can see it is a convention being
  // read, not a value being invented.
  if ("awards_ranking_points" in ev && typeof ev.awards_ranking_points !== "boolean") {
    fail(
      `season ${season} event ${eventNumber} states awards_ranking_points as ` +
        `${JSON.stringify(ev.awards_ranking_points)}, which is not a boolean.`,
    );
  }
  return {
    isPostCut: ev.is_post_cut === true,
    throwawayEligible: ev.throwaway_eligible === true,
    awardsRankingPoints: ev.awards_ranking_points !== false,
  };
}

const pageBySlug = new Map<string, ReturnType<typeof parseResultsPage>>();
const shaBySlug = new Map<string, string>();
for (const r of manifest.rounds) {
  const slug = basename(r.file_path).replace(/\.html$/, "");
  if (!pageBySlug.has(slug)) {
    pageBySlug.set(slug, parseResultsPage(slug));
    shaBySlug.set(slug, shaOf(slug));
  }
}

const rounds = new Map<number, RoundBuild>();
for (const [slug, page] of pageBySlug) {
  const sha = shaBySlug.get(slug);
  if (!sha) continue;
  for (const heat of page.heats) {
    let rb = rounds.get(heat.roundNumberGtm);
    if (!rb) {
      rb = {
        roundOrder: heat.roundNumberGtm,
        nameGtm: heat.roundNameGtm,
        wslRoundId: heat.wslRoundId,
        artefactSha: sha,
        heats: [],
        athletes: [],
        countingPairPublished: page.shape === "list",
      };
      rounds.set(heat.roundNumberGtm, rb);
    }
    rb.heats.push(heat);
    rb.athletes.push(
      ...page.athletes.filter((a) => a.wslHeatId === heat.wslHeatId),
    );
  }
  if (page.duplicateConflicts.length > 0) {
    fail(
      `${slug}: ${page.duplicateConflicts.length} duplicate render(s) disagree. ` +
        `Choosing between them is a decision, not a de-duplication.\n` +
        page.duplicateConflicts.join("\n"),
    );
  }
}

const roundList = [...rounds.values()].sort((a, b2) => a.roundOrder - b2.roundOrder);

// Surfers: full names come from the list-view rounds only. Asserted
// rather than assumed — a surfer known only by "B. Mamiya" must not be
// written as if that were their name.
const surfers = new Map<string, { fullName: string; sha: string }>();
for (const rb of roundList) {
  for (const a of rb.athletes) {
    if (a.fullName && !surfers.has(a.wslAthleteId)) {
      surfers.set(a.wslAthleteId, { fullName: a.fullName, sha: rb.artefactSha });
    }
  }
}
const allAthleteIds = new Set(roundList.flatMap((r) => r.athletes.map((a) => a.wslAthleteId)));
const missingNames = [...allAthleteIds].filter((id) => !surfers.has(id));
if (missingNames.length > 0) {
  fail(
    `${missingNames.length} athlete(s) appear only on the bracket view, which publishes short ` +
      `names only: ${missingNames.join(", ")}. A short name is not a full name and will not be ` +
      `written as one. Collect the round page that introduces them.`,
  );
}

// FIELD SIZE is the size of the field, which is round 1's entry count -- NOT
// the number of distinct athletes seen across the event. Those two differ the
// moment anyone is replaced mid-event, and `field_size` is what round_templates
// and points_band_occupancy are keyed on: there is no template for 37.
//
// Corrected 26 August 2026. The old rule was `surfers.size`, which agreed with
// round 1 on all 19 regular events loaded before that date -- 0 of them had any
// athlete enter after round 1 -- and was therefore right nineteen times by
// coincidence. 2025 event 6 is the first event that tests it: Ryan Callinan is
// drawn into the Elimination Round and never surfs again, Morgan Cibilic takes
// his place from that round on, and the event has 36 in its field and 37
// athletes in its results.
const roundOne = roundList.find((r) => r.roundOrder === 1) ?? null;
if (roundOne === null) {
  fail(
    `no round_order 1 in this event, so the field size cannot be read from the ` +
      `draw. Refusing to fall back to a distinct-athlete count, which is a ` +
      `different quantity.`,
  );
}
const fieldSize = roundOne.athletes.length;
const roundOneIds = new Set(roundOne.athletes.map((a) => a.wslAthleteId));
const enteredAfterRoundOne = [...surfers.keys()].filter((id) => !roundOneIds.has(id));

const totalEntries = roundList.reduce((s, r) => s + r.athletes.length, 0);
const totalHeats = roundList.reduce((s, r) => s + r.heats.length, 0);

console.log(`rounds: ${roundList.length}`);
console.log(`heats: ${totalHeats}`);
console.log(`surfers: ${surfers.size}`);
console.log(`heat entries: ${totalEntries}`);
for (const rb of roundList) {
  console.log(
    `  round ${rb.roundOrder} ${rb.nameGtm.padEnd(16)} ` +
      `heats ${String(rb.heats.length).padStart(2)}  entries ${String(rb.athletes.length).padStart(3)}  ` +
      `counting pair ${rb.countingPairPublished ? "published" : "ABSENT (Tier 2 needed)"}`,
  );
}

// ---------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------

const eventSlug = slugify(manifest.name);
const baseSlug = basename(manifest.rounds[0].file_path).replace(/\.html$/, "");
const baseSha = shaBySlug.get(baseSlug) ?? fail("no base artefact");

const roundsWithoutPair = roundList.filter((r) => !r.countingPairPublished);
const entriesWithoutPair = roundsWithoutPair.reduce((s, r) => s + r.athletes.length, 0);

const L: string[] = [];
const w = (s = ""): void => {
  L.push(s);
};

w(`-- =====================================================================`);
w(`-- ${season} event ${eventNumber} — ${manifest.name}`);
w(`-- Generated by scripts/ingest_event.ts on ${new Date().toISOString()}`);
w(`-- =====================================================================`);
w(`--`);
w(`-- Rule 6: review this, then run it yourself. Claude does not execute it.`);
w(`--`);
w(`-- Idempotent. Every insert is keyed on a natural unique constraint and`);
w(`-- re-running changes nothing: seasons(year), events(season_year,`);
w(`-- event_number), rounds(event_id, round_order), heats(round_id,`);
w(`-- heat_number, sequence_in_round), surfers(slug), heat_entries(heat_id,`);
w(`-- surfer_id).`);
w(`--`);
w(`-- Artefacts are resolved by sha256, never by hardcoded id. If an`);
w(`-- artefact is not registered this aborts rather than inserting a row`);
w(`-- with no provenance.`);
w(`--`);
w(`-- PRECONDITION: supabase/seeds/artefacts_retained.sql must have been`);
w(`-- run. It registers the Tier 1 pages this file cites. As of 10 August`);
w(`-- the artefacts table holds only the six rulebooks.`);
w(`--`);
w(`-- Rows: ${roundList.length} rounds, ${totalHeats} heats, ${surfers.size} surfers, ${totalEntries} heat entries.`);
w(`-- =====================================================================`);
w();
w(`BEGIN;`);
w();
w(`-- --- preflight -------------------------------------------------------`);
w(`-- Abort loudly rather than insert a row whose provenance is missing.`);
w(`DO $$`);
w(`DECLARE missing text;`);
w(`BEGIN`);
w(`  SELECT string_agg(x.sha, ', ') INTO missing`);
w(`  FROM (VALUES`);
const shas = [...new Set([...roundList.map((r) => r.artefactSha)])];
shas.forEach((s, i) => w(`    ('${s}')${i === shas.length - 1 ? "" : ","}`));
w(`  ) AS x(sha)`);
w(`  WHERE NOT EXISTS (SELECT 1 FROM artefacts a WHERE a.sha256 = x.sha);`);
w(`  IF missing IS NOT NULL THEN`);
w(`    RAISE EXCEPTION 'Unregistered artefact sha256: %. Run supabase/seeds/artefacts_retained.sql first.', missing;`);
w(`  END IF;`);
w(`END $$;`);
w();

w(`-- --- season ----------------------------------------------------------`);
w(`INSERT INTO seasons (year, era_code, cut_after_event, cut_source_grade, cut_source_note, pre_cut_event_count)`);
w(`VALUES (${facts.year}, ${q(facts.eraCode)}, ${n(facts.cutAfterEvent)}, ${q(facts.cutSourceGrade)},`);
w(`        ${q(facts.cutSourceNote)}, ${facts.preCutEventCount})`);
w(`ON CONFLICT (year) DO NOTHING;`);
w(`-- world_champion_surfer_id stays NULL: it is set from the rankings page,`);
w(`-- never derived from points. 2024 proves why — Colapinto finished on`);
w(`-- 46,600 against Ferreira's 37,365 and ranked below him.`);
w();

const flags = specEventFlags(season, eventNumber);
w(`-- --- event -----------------------------------------------------------`);
w(`-- occurs_after_cut, throwaway_eligible and awards_ranking_points are READ`);
w(`-- from docs/format-spec/seasons/${season}.yaml. They were hard-coded false,`);
w(`-- true, true until 19 August 2026, which marked every event as sitting before`);
w(`-- the cut. v_pre_cut_count_check found it the first time both seasons were`);
w(`-- fully loaded — before that it had nothing to disagree with.`);
w(`--`);
w(`-- DO UPDATE, not DO NOTHING, for exactly these three columns: the spec is`);
w(`-- their authority, so re-running this seed must be able to correct a row that`);
w(`-- is already there. Everything else about an existing event is left alone.`);
w(`INSERT INTO events (season_year, event_number, wsl_event_id, name, slug, kind,`);
w(`                    occurs_after_cut, throwaway_eligible, awards_ranking_points,`);
w(`                    field_size, artefact_id)`);
w(`SELECT ${season}, ${eventNumber}, ${q(String(manifest.wslEventId))}, ${q(manifest.name)}, ${q(eventSlug)}, 'regular',`);
w(`       ${flags.isPostCut}, ${flags.throwawayEligible}, ${flags.awardsRankingPoints}, ${fieldSize}, a.id`);
// Whether this season's calendar page is actually retained is READ FROM DISK,
// never asserted. The line this replaces hardcoded "none has been collected",
// and went on emitting that sentence for seven days after both calendars were
// collected on 19 August — so 20 gap rows instructed a collection that had
// already happened. A generator that states the world's contents from a string
// literal will always eventually be wrong; this one looks.
// Sidecar naming is <slug>.json, NOT <file>.html.json — the same convention
// shaOf() above uses. The first version of this check appended ".json" to the
// .html path, found nothing, and went on emitting the stale gap row. It looked
// correct and was verified only by running the generator and reading its output.
const calendarSlug = `${season}_ct_calendar`;
const calendarRetained =
  existsSync(join(REPO_ROOT, "docs/sources/raw", `${calendarSlug}.html`)) &&
  existsSync(join(REPO_ROOT, "docs/sources/raw", `${calendarSlug}.json`));

w(`FROM artefacts a WHERE a.sha256 = '${baseSha}'`);
w(`ON CONFLICT (season_year, event_number) DO UPDATE SET`);
w(`  occurs_after_cut      = EXCLUDED.occurs_after_cut,`);
w(`  throwaway_eligible    = EXCLUDED.throwaway_eligible,`);
w(`  awards_ranking_points = EXCLUDED.awards_ranking_points;`);
w(
  calendarRetained
    ? `-- venue_id, start_date and end_date are set by supabase/seeds/venues_and_heat_venues.sql,`
    : `-- venue_id, start_date and end_date stay NULL — see the data_gaps rows.`,
);
if (calendarRetained) {
  w(`-- from the retained calendar page and the heat popups. Not written here.`);
}
// The comparison is RUN and its outcome printed. The line this replaces read
// "They agree here; that is a check, not an input" and was emitted whether or
// not they agreed -- a check that always reports success.
const eraAFigure = flags.isPostCut ? 24 : 36;
w(`-- field_size ${fieldSize} is COUNTED from round 1 of the retained draw, not`);
w(`-- assumed from the Era A figure of ${eraAFigure} for this event shape.`);
w(
  fieldSize === eraAFigure
    ? `-- They AGREE. That is a check, not an input.`
    : `-- They DISAGREE: draw ${fieldSize}, Era A ${eraAFigure}. Recorded, not reconciled.`,
);
if (enteredAfterRoundOne.length > 0) {
  w(`-- ${surfers.size} distinct athletes appear in this event, ${fieldSize} of them in round 1.`);
  w(`-- ${enteredAfterRoundOne.length} entered later; see the replacement data_gaps row below.`);
}
w();

w(`-- --- rounds ----------------------------------------------------------`);
w(`-- name is WSL's own name from its data layer. wsl_code stays NULL: the`);
w(`-- column is for attested codes like NS, and WSL's numeric round id`);
w(`-- (${roundList.map((r) => r.wslRoundId).join(", ")}) has no column on this table at all.`);
w(`-- counting_rides, scoring_basis and max_heat_score are the ocean Era A`);
w(`-- values, cited to the 2025 rule book, not read off the results page.`);
for (const rb of roundList) {
  w(`INSERT INTO rounds (event_id, round_order, name, counting_rides, max_heat_score, scoring_basis, is_leaderboard, artefact_id)`);
  w(`SELECT e.id, ${rb.roundOrder}, ${q(rb.nameGtm)}, 2, 20, 'best_two_overall', false, a.id`);
  w(`FROM events e, artefacts a`);
  w(`WHERE e.season_year = ${season} AND e.event_number = ${eventNumber} AND a.sha256 = '${rb.artefactSha}'`);
  w(`ON CONFLICT (event_id, round_order) DO NOTHING;`);
}
w();

w(`-- --- surfers ---------------------------------------------------------`);
w(`-- country_code stays NULL. The page publishes a flag title ("Brazil",`);
w(`-- "Hawaii"); that is not a country code, and "Hawaii" is not a country.`);
w(`INSERT INTO surfers (wsl_athlete_id, full_name, slug, artefact_id)`);
w(`SELECT v.wsl_id, v.full_name, v.slug, a.id`);
w(`FROM (VALUES`);
const surferRows = [...surfers.entries()].sort((x, y) => x[0].localeCompare(y[0]));
surferRows.forEach(([id, s], i) => {
  w(`  (${q(id)}, ${q(s.fullName)}, ${q(slugify(s.fullName))}, ${q(s.sha)})${i === surferRows.length - 1 ? "" : ","}`);
});
w(`) AS v(wsl_id, full_name, slug, sha)`);
w(`JOIN artefacts a ON a.sha256 = v.sha`);
w(`ON CONFLICT (slug) DO NOTHING;`);
w();

w(`-- --- heats -----------------------------------------------------------`);
w(`INSERT INTO heats (round_id, heat_number, sequence_in_round, wsl_heat_id, status, artefact_id)`);
w(`SELECT r.id, v.heat_number, v.heat_number, v.wsl_heat_id, 'completed', a.id`);
w(`FROM (VALUES`);
const heatRows: string[] = [];
for (const rb of roundList) {
  const ordered = [...rb.heats].sort((x, y) => (x.heatNumber ?? 0) - (y.heatNumber ?? 0));
  for (const h of ordered) {
    heatRows.push(
      `  (${rb.roundOrder}, ${n(h.heatNumber)}, ${q(h.wslHeatId)}, ${q(rb.artefactSha)})`,
    );
  }
}
heatRows.forEach((r, i) => w(r + (i === heatRows.length - 1 ? "" : ",")));
w(`) AS v(round_order, heat_number, wsl_heat_id, sha)`);
w(`JOIN events e ON e.season_year = ${season} AND e.event_number = ${eventNumber}`);
w(`JOIN rounds r ON r.event_id = e.id AND r.round_order = v.round_order`);
w(`JOIN artefacts a ON a.sha256 = v.sha`);
w(`ON CONFLICT (round_id, heat_number, sequence_in_round) DO NOTHING;`);
w();

w(`-- --- heat entries ----------------------------------------------------`);
w(`-- progression_text is stored verbatim. advanced_to_round_id stays NULL:`);
w(`-- resolving "Adv to ER - HT 2" means expanding an abbreviation nobody`);
w(`-- has sourced, and round names are data, never an enum.`);
w(`INSERT INTO heat_entries (heat_id, surfer_id, position, heat_total, progression_text, artefact_id)`);
// heat_total is cast explicitly. A VALUES column that is NULL in every row is
// typed `text` by Postgres, and the insert then fails with "column heat_total
// is of type numeric but expression is of type text" — which is what Abu Dhabi
// did. The cast makes the generator robust to an all-null numeric column
// whatever the cause, rather than only to this one.
w(`SELECT h.id, s.id, v.position, v.heat_total::numeric, v.progression_text, a.id`);
w(`FROM (VALUES`);
const entryRows: string[] = [];
for (const rb of roundList) {
  for (const a of rb.athletes) {
    entryRows.push(
      `  (${q(a.wslHeatId)}, ${q(a.wslAthleteId)}, ${n(a.position)}, ${n(a.heatTotal)}, ${q(a.progressionText)}, ${q(rb.artefactSha)})`,
    );
  }
}
entryRows.forEach((r, i) => w(r + (i === entryRows.length - 1 ? "" : ",")));
w(`) AS v(wsl_heat_id, wsl_athlete_id, position, heat_total, progression_text, sha)`);
w(`JOIN events e ON e.season_year = ${season} AND e.event_number = ${eventNumber}`);
w(`JOIN rounds r ON r.event_id = e.id`);
w(`JOIN heats h ON h.round_id = r.id AND h.wsl_heat_id = v.wsl_heat_id`);
w(`JOIN surfers s ON s.wsl_athlete_id = v.wsl_athlete_id`);
w(`JOIN artefacts a ON a.sha256 = v.sha`);
w(`ON CONFLICT (heat_id, surfer_id) DO NOTHING;`);
w();

w(`-- --- gaps ------------------------------------------------------------`);
w(`-- Silent absence is a failure. Each of these is a thing the source or`);
w(`-- the schema does not currently give us, recorded with its reason.`);
w(`--`);
w(`-- A gap row ASSERTS AN ABSENCE. Opening one without testing that the`);
w(`-- absence is still true records a claim about the world that the database`);
w(`-- itself contradicts. Tier 1 is re-runnable by design — the ON CONFLICT DO`);
w(`-- UPDATE on events exists precisely so it can be — so a re-run over an`);
w(`-- event whose waves Tier 2 has since loaded must not re-open the gap that`);
w(`-- Tier 2 closed.`);
w(`--`);
w(`-- DEFECT FOUND 20 AUGUST 2026, fixed here 24 August. It did exactly that.`);
w(`-- The old guard refused only a duplicate row that was still OPEN, so every`);
w(`-- Tier 2 close made room for the next Tier 1 open. Measured before the fix:`);
w(`-- 16 open "waves for <event>" rows, 15 of them on events that already held`);
w(`-- waves, and 63 rows total describing 21 events — up to five copies each.`);
w(`-- docs/findings/2026-08-20_wave_gap_ledger_reopened_by_tier1.md`);
w();
// SUPERSEDED 25 August 2026, and the event grain went with it. The block
// above fixed a ledger that re-opened what Tier 2 had closed; it did not make
// the event the right unit. It is not — an event-scoped row closes on the
// first wave loaded anywhere in the event, so three part-collected events
// reported themselves complete while 73 heats inside them held nothing.
// The wave gap is now maintained per heat, by one implementation that all
// three generators emit.
w(waveGapSql(season, eventNumber));
w();
w(`-- The remaining gaps assert things the database cannot re-test, so they`);
w(`-- are unconditional. The wave gap, which can be re-tested, is above.`);
w(`INSERT INTO data_gaps (scope, season_year, field, reason, source_note)`);
w(`SELECT v.scope, v.yr, v.field, v.reason, v.note FROM (VALUES`);

// Interference IS published on Tier 1: the athlete block carries the class
// `hot-heat-athlete--has-interference`. Only the offender is readable from
// this page shape — `against_id`, `penalty_level` and the affected ride are
// not on it, so nothing can be written to `interferences` from Tier 1 without
// inventing two of its four columns. The absence is therefore recorded here
// rather than left silent, which is what item 5 requires and what an earlier
// version of this generator did not do.
//
// Counted off parsed, style-stripped markup, never a substring scan of the
// raw bytes: WSL's inlined stylesheet names this same class four times, so a
// naive count over the file returns 8 where the page carries 4.
const interfered = roundList.flatMap((rb) =>
  rb.athletes
    .filter((a) => a.hasInterference)
    .map((a) => `heat ${a.wslHeatId}/athlete ${a.wslAthleteId}`),
);
const interferedUnique = [...new Set(interfered)].sort();

// ---------------------------------------------------------------------
// THE FINALS ARE NOT AN ORDINARY EVENT, AND THIS GENERATOR MUST NOT TOUCH THEM.
//
// ADDED 19 August 2026, immediately after this script produced
// ingest_2024_e10_lexus_wsl_finals.sql and ingest_2025_e12_lexus_wsl_finals_fiji.sql.
//
// It could not do that before, because collect_event.ts refuses the Finals page
// and so no manifest existed. write_finals_manifest.ts then created one — on
// purpose, so the popup collector could reach the Finals popups — and this
// generator, which is manifest-driven, silently picked it up.
//
// What it produced was not merely redundant. It wrote kind='regular' over an
// event that is not, and it named ALL EIGHT heats on the page — four men's and
// four women's — because the division filter lives in ingest_finals.ts, not
// here. Applying it would have put the women's WSL Finals into a men's CT
// database. That is the exact failure this project is built to prevent, and it
// appeared as a second-order effect of a fix, not as a bug in either script.
//
// The refusal is by the spec's declared format, not by event number or name.
// ---------------------------------------------------------------------
{
  const specPath = join(REPO_ROOT, "docs/format-spec/seasons", `${season}.yaml`);
  const doc = yaml.load(readFileSync(specPath, "utf8"));
  const ev =
    isRecord(doc) && Array.isArray(doc.events)
      ? doc.events.find(
          (e): e is Record<string, unknown> => isRecord(e) && e.number === eventNumber,
        )
      : undefined;
  if (ev && ev.format === "finals_five") {
    fail(
      `season ${season} event ${eventNumber} is format: finals_five — the WSL Finals.\n` +
        `  This generator writes kind='regular' and does NOT filter by division, and the\n` +
        `  Finals results page carries the men's AND women's ladders in one document.\n` +
        `  Use:  node --experimental-strip-types scripts/ingest_finals.ts --season ${season}`,
    );
  }
}

const specFacts = specEventFacts(season, eventNumber);

// The wave gap is no longer in this list — it is the one gap with a truth the
// database can re-test, it is now per heat, and scripts/lib/wave_gaps.ts emits
// it above. Everything left here asserts something the database cannot re-test.
const gaps: Array<[string, number | null, string, string, string]> = [];

if (!calendarRetained) {
  gaps.push([
    "event",
    season,
    `events.start_date, events.end_date and events.venue_id for ${season} event ${eventNumber}`,
    `docs/format-spec/seasons/${season}.yaml carries all three (${specFacts}), sourced to the WSL calendar page read on 25 July 2026. That page is not retained, so there is no artefact to cite. A fact with no artefact is not verified, however confidently the spec states it.`,
    `Collect /events/${season}/ct?all=1 and register it, then apply supabase/seeds/venues_and_heat_venues.sql.`,
  ]);
}

gaps.push(
  [
    "tour",
    null,
    "surfers.country_code",
    `The results page publishes a flag title only ("Brazil", "Hawaii"). That is not a country code, the countries table is empty, and "Hawaii" is not a country. Mapping title to code is a derivation with no published source.`,
    `Titles remain recoverable from the retained artefacts. Seed countries from a cited list before backfilling.`,
  ],
  [
    "round",
    season,
    `rounds.name for round 3 of ${season} event ${eventNumber}`,
    `The round nav displays "Bracket" while WSL's own data layer names the same round "Round of 32". Both are WSL's. The data-layer name is stored because it is the one that also names rounds 4-7, which the nav never shows. The disagreement is not resolved.`,
    `Retained artefact: the bracket page. docs/sources/manifests/${manifest.stem}.json records the same warning.`,
  ],
  [
    "event",
    season,
    `event_entries for ${season} event ${eventNumber}`,
    `Event placings and points are not written from results pages. Points come from the rankings page, and deriving them from placings silently awards points nobody earned — wildcards take a placing and score nothing. That is the v1 failure shape exactly.`,
    `Collect /athletes/tour/mct?year=${season}.`,
  ],
);

// A mid-event replacement. Recorded because the columns built to carry it --
// event_entries.participation and .status -- are empty for every event by
// deliberate decision, so without this row the fact is silent. First seen on
// 2025 event 6, 26 August 2026.
//
// What is asserted here is only what the retained pages show: who appears in
// round 1, who does not, and which round each late entrant first appears in.
// The pairing of a departure with an arrival is NOT asserted. It is the obvious
// reading and it is still an inference, and this project does not write
// inferences into provenance records.
if (enteredAfterRoundOne.length > 0) {
  const firstRoundOf = (id: string): number =>
    roundList.find((rb) => rb.athletes.some((a) => a.wslAthleteId === id))?.roundOrder ?? 0;
  const arrivals = enteredAfterRoundOne
    .map((id) => `${surfers.get(id)?.fullName ?? "?"} (athlete ${id}) from round ${firstRoundOf(id)}`)
    .join("; ");

  // Athletes the source's own progression text sends to a later round who then
  // never appear in one. Read from the markup, not inferred from absence alone.
  const drawnButAbsent = roundOne.athletes
    .filter((a) => a.progressionText !== null)
    .filter((a) => {
      const later = roundList.filter((rb) => rb.roundOrder > 1);
      return !later.some((rb) => rb.athletes.some((x) => x.wslAthleteId === a.wslAthleteId));
    })
    .map((a) => `${surfers.get(a.wslAthleteId)?.fullName ?? "?"} (athlete ${a.wslAthleteId}), whose round 1 progression reads "${a.progressionText}"`);

  gaps.push([
    "event",
    season,
    `event_entries.participation and .status for ${season} event ${eventNumber} — ${enteredAfterRoundOne.length} mid-event replacement(s)`,
    `${surfers.size} distinct athletes appear in this event but the round 1 draw holds ${fieldSize}. ` +
      `Entering after round 1: ${arrivals}. ` +
      (drawnButAbsent.length > 0
        ? `Drawn into a later round by the page's own progression text and never appearing in one: ${drawnButAbsent.join("; ")}. `
        : `No round 1 athlete is drawn onward and then absent. `) +
      `Which arrival replaces which departure is NOT recorded here: the pages publish no statement of it, and pairing them is an inference. ` +
      `The Era A rule that injured withdrawals keep their placings cannot be applied to this event until that pairing has a source.`,
    `event_entries is empty for every event pending the rankings page (see the event_entries gap row). ` +
      `Close this by loading event_entries with participation and status, sourced to a page that states the withdrawal and the replacement.`,
  ]);
}

if (interferedUnique.length > 0) {
  gaps.push([
    "event",
    season,
    `interferences for ${season} event ${eventNumber} — ${interferedUnique.length} athlete-heat records`,
    `The retained pages mark ${interferedUnique.length} athlete-heat records with hot-heat-athlete--has-interference: ${interferedUnique.join(", ")}. Nothing is written to the interferences table, because this page shape publishes the offender only — against_id, penalty_level and the ride the penalty zeroed are not on it. Two of four columns would have to be invented. Note the heat totals loaded for these records are already post-penalty, so they are correct and nothing in the database says why they are low.`,
    `Tier 2 heat popups name the penalty level and footnote which ride the interference occurred on and which ride was zeroed. Collect the popups for these heats. Until then waves.counted must not be derived by taking the best two for them — CLAUDE.md trap 14.`,
  ]);
}

gaps.forEach((g, i) => {
  w(
    `  (${q(g[0])}, ${n(g[1])}, ${q(g[2])}, ${q(g[3])}, ${q(g[4])})${i === gaps.length - 1 ? "" : ","}`,
  );
});
w(`) AS v(scope, yr, field, reason, note)`);
w(`WHERE NOT EXISTS (SELECT 1 FROM data_gaps d WHERE d.field = v.field AND d.closed_at IS NULL);`);
w();

w(`-- --- assertions ------------------------------------------------------`);
w(`-- Counted from the retained pages by scripts/ingest_event.ts. If the`);
w(`-- database disagrees, this transaction must not commit.`);
w(`DO $$`);
w(`DECLARE r_rounds int; r_heats int; r_entries int; r_surfers int; dupes int;`);
w(`BEGIN`);
w(`  SELECT count(*) INTO r_rounds FROM rounds r JOIN events e ON e.id = r.event_id`);
w(`    WHERE e.season_year = ${season} AND e.event_number = ${eventNumber};`);
w(`  SELECT count(*) INTO r_heats FROM heats h JOIN rounds r ON r.id = h.round_id`);
w(`    JOIN events e ON e.id = r.event_id WHERE e.season_year = ${season} AND e.event_number = ${eventNumber};`);
w(`  SELECT count(*) INTO r_entries FROM heat_entries he JOIN heats h ON h.id = he.heat_id`);
w(`    JOIN rounds r ON r.id = h.round_id JOIN events e ON e.id = r.event_id`);
w(`    WHERE e.season_year = ${season} AND e.event_number = ${eventNumber};`);
w(`  SELECT count(DISTINCT he.surfer_id) INTO r_surfers FROM heat_entries he`);
w(`    JOIN heats h ON h.id = he.heat_id JOIN rounds r ON r.id = h.round_id`);
w(`    JOIN events e ON e.id = r.event_id WHERE e.season_year = ${season} AND e.event_number = ${eventNumber};`);
w(`  SELECT count(*) INTO dupes FROM (`);
w(`    SELECT wsl_athlete_id FROM surfers WHERE wsl_athlete_id IS NOT NULL`);
w(`    GROUP BY wsl_athlete_id HAVING count(*) > 1) t;`);
w(`  IF r_rounds  <> ${roundList.length} THEN RAISE EXCEPTION 'rounds: expected ${roundList.length}, got %', r_rounds; END IF;`);
w(`  IF r_heats   <> ${totalHeats} THEN RAISE EXCEPTION 'heats: expected ${totalHeats}, got %', r_heats; END IF;`);
w(`  IF r_entries <> ${totalEntries} THEN RAISE EXCEPTION 'heat entries: expected ${totalEntries}, got %', r_entries; END IF;`);
w(`  IF r_surfers <> ${surfers.size} THEN RAISE EXCEPTION 'surfers in event: expected ${surfers.size}, got %', r_surfers; END IF;`);
w(`  -- surfers has no unique constraint on wsl_athlete_id, so the join in`);
w(`  -- heat_entries above would silently multiply rows if one ever appeared`);
w(`  -- twice. Asserted here because the schema does not enforce it.`);
w(`  IF dupes > 0 THEN RAISE EXCEPTION 'duplicate wsl_athlete_id in surfers: % ', dupes; END IF;`);
w(`  RAISE NOTICE 'OK: % rounds, % heats, % entries, % surfers', r_rounds, r_heats, r_entries, r_surfers;`);
w(`END $$;`);
w();
w(`COMMIT;`);
w();

const outDir = join(REPO_ROOT, "supabase/seeds");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(
  outDir,
  `ingest_${season}_e${String(eventNumber).padStart(2, "0")}_${eventSlug.replace(/-/g, "_")}.sql`,
);
writeFileSync(outPath, L.join("\n"), "utf8");

console.log(`\nwrote ${outPath.replace(REPO_ROOT + "/", "")}`);
console.log(`  ${L.length} lines, ${gaps.length} data_gaps rows`);
console.log(`\nRule 6: review it, then run it yourself.`);
