// =====================================================================
// parse_results.ts — read a retained WSL results page into typed records
// =====================================================================
//
// Reads retained artefacts from disk. Never fetches. Rule 7a is not in
// play here at all: this module has no network code.
//
// TWO PAGE SHAPES, and they are not interchangeable.
//
//   list view    rounds 1-2. Full names, counting pair, progression
//                string, per-athlete ride count, country.
//   bracket view rounds 3-7 on ONE page. Short names only, heat total
//                and placing only, every athlete record rendered TWICE.
//
// Anything this module cannot read from the page comes back `null`. It
// never fills a gap with a plausible value — that is the failure this
// rebuild exists to remove.
//
// THE STYLESHEET TRAP. WSL inlines ~860 KB of CSS which mentions
// `.hot-heat-athlete--has-interference`, `[data-athlete-status="out"]`
// and most other markers this module matches on. A substring count over
// the raw bytes returns 4 interference markers on a page that has none.
// Every function here works on style- and script-stripped HTML, and
// `stripNonMarkup` is exported so callers can prove they did the same.
//
// WHAT IS DELIBERATELY NOT READ HERE:
//
//   The `wave_scores` array on the Replay link. It carries 16 scores,
//   16 wave ids and 3 athlete ids with nothing joining them — it is
//   chronological across the whole heat, interleaved, not grouped by
//   surfer. Chunking it three at a time gives Groggia 5, 1, 3.33
//   instead of 5, 3.73, 3.17: no error raised, counts still reconcile,
//   numbers still look like surf scores. CLAUDE.md trap 13. Ride-level
//   data comes from the Tier 2 popup, which attributes it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, decodeEntities, fail } from "./retain.ts";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

/** How the page rendered an athlete's outcome. WSL's own class suffix. */
export type AdvanceMarker =
  | "advance-winner"
  | "advance"
  | "winner"
  | "eliminated"
  | "unknown";

export interface AthleteRecord {
  wslHeatId: string;
  wslAthleteId: string;
  /** Full name. `null` on the bracket view, which renders short only. */
  fullName: string | null;
  /** Short name, e.g. "Y. Dora". Present on both shapes. */
  shortName: string | null;
  /** Flag title attribute, e.g. "Brazil", "Hawaii". Not an ISO country. */
  countryTitle: string | null;
  /** Heat total as published. `null` if the page shows none. */
  heatTotal: number | null;
  /** Placing within the heat, from `--athlete-place-N`. */
  position: number | null;
  /** Ride count from `--waves-N`. Distinct from the counting pair. */
  rideCount: number | null;
  /** e.g. "Adv to ER - HT 2". `null` on the bracket view. */
  progressionText: string | null;
  /** The published counting pair, in the page's own order. */
  countedWaves: number[] | null;
  /** Raw `data-athlete-status`. Vocabulary unknown — do not enum it. */
  athleteStatus: string | null;
  advanceMarker: AdvanceMarker;
  hasInterference: boolean;
}

export interface HeatRecord {
  wslHeatId: string;
  wslRoundId: string;
  /** WSL's own round name from its data layer. */
  roundNameGtm: string;
  /** WSL's round ordinal from its data layer, 1-based. */
  roundNumberGtm: number;
  heatNumber: number | null;
  athleteIds: string[];
  athleteNames: string[];
}

export interface ParsedPage {
  slug: string;
  shape: "list" | "bracket";
  heats: HeatRecord[];
  athletes: AthleteRecord[];
  /** Records dropped as exact duplicates of an earlier record. */
  duplicatesCollapsed: number;
  /** Duplicate pairs that did NOT agree. Must be zero. */
  duplicateConflicts: string[];
}

// ---------------------------------------------------------------------
// Byte-level hygiene
// ---------------------------------------------------------------------

/**
 * Remove <style> and <script> blocks. Every selector match in this
 * module is made against the result.
 *
 * Not cosmetic: on the retained Pipe base page this takes 1,131,885
 * bytes to 271,675, and it is the difference between counting 36
 * athlete records and counting the stylesheet's mentions of them.
 */
export function stripNonMarkup(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

export function readRetainedHtml(slug: string): string {
  const path = join(REPO_ROOT, "docs/sources/raw", `${slug}.html`);
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fail(
      `Retained artefact not found: ${path}\n` +
        `Ingest reads from disk only. Collect it with \`npm run collect\` first — ` +
        `this script must never fetch.`,
    );
  }
}

// ---------------------------------------------------------------------
// Small extractors
// ---------------------------------------------------------------------

function classSuffixNumber(classAttr: string, prefix: string): number | null {
  const m = new RegExp(`hot-heat-athlete--${prefix}-(\\d+)(?:\\s|$)`).exec(classAttr);
  return m ? Number(m[1]) : null;
}

/**
 * Read an HTML attribute out of an opening tag's attribute string.
 *
 * The leading `(?:^|\s)` is load-bearing. Without it, asking for `id`
 * matches inside `data-athlete-id="3994"` and returns "3994" — a real
 * value, of the right type, from the wrong attribute. It parsed, it
 * looked like an id, and it silently dropped all 36 athlete records on
 * the first run of this parser.
 */
function attr(fragment: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(fragment);
  return m ? m[1] : null;
}

function innerTextOfClass(fragment: string, className: string): string | null {
  const m = new RegExp(
    `class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</div>`,
  ).exec(fragment);
  if (!m) return null;
  const text = decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim();
  return text.length > 0 ? text : null;
}

/**
 * Parse a published score. Returns null for anything non-numeric rather
 * than coercing — "-", "" and "TBD" all appear on WSL pages.
 *
 * Parsed numerically on purpose: the GTM blob strips trailing zeros
 * ("5") where the rendered markup keeps them ("5.00"). Matching on
 * string form finds a difference that is not there. CLAUDE.md trap 16.
 */
function parseScore(raw: string | null): number | null {
  if (raw === null) return null;
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function advanceMarkerOf(classAttr: string): AdvanceMarker {
  // Order matters: `--advance-winner` also contains `--advance`.
  if (/hot-heat-athlete--advance-winner/.test(classAttr)) return "advance-winner";
  if (/hot-heat-athlete--advance(?![-\w])/.test(classAttr)) return "advance";
  if (/hot-heat-athlete--winner(?![-\w])/.test(classAttr)) return "winner";
  if (/hot-heat-athlete--eliminated/.test(classAttr)) return "eliminated";
  return "unknown";
}

// ---------------------------------------------------------------------
// Heats, from the Details link's GTM blob
// ---------------------------------------------------------------------

interface GtmDetailBlob {
  "athlete-ids"?: string;
  "athlete-names"?: string;
  round_names?: string;
  round_numbers?: string;
  round_ids?: string;
  heat_numbers?: string;
  heat_ids?: string;
}

/**
 * Every heat on the page, taken from the Details link's data layer.
 *
 * This is the only attributed heat-to-round mapping WSL publishes on a
 * results page, and it is how rounds 4-7 are discovered at all — the
 * round nav lists three items and `?roundId=` for any of rounds 4-7
 * returns the same bracket page byte-for-byte.
 */
export function parseHeats(markup: string): HeatRecord[] {
  const out: HeatRecord[] = [];
  const seen = new Set<string>();
  const re =
    /data-request-name="postEventWatchHeatDetailsPopup"[\s\S]{0,200}?data-gtm-event='([^']*)'/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    let blob: GtmDetailBlob;
    try {
      blob = JSON.parse(decodeEntities(m[1])) as GtmDetailBlob;
    } catch {
      continue;
    }
    const heatId = blob.heat_ids?.trim();
    const roundId = blob.round_ids?.trim();
    const roundName = blob.round_names?.trim();
    const roundNumber = blob.round_numbers?.trim();
    if (!heatId || !roundId || !roundName || !roundNumber) continue;
    if (seen.has(heatId)) continue;
    seen.add(heatId);

    const heatNumberRaw = blob.heat_numbers?.trim();
    out.push({
      wslHeatId: heatId,
      wslRoundId: roundId,
      roundNameGtm: roundName,
      roundNumberGtm: Number(roundNumber),
      heatNumber: heatNumberRaw && /^\d+$/.test(heatNumberRaw) ? Number(heatNumberRaw) : null,
      athleteIds: (blob["athlete-ids"] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      athleteNames: (blob["athlete-names"] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// Athlete records
// ---------------------------------------------------------------------

/**
 * Every athlete-heat record on the page.
 *
 * The bracket view renders each record twice. Duplicates are collapsed
 * only when the two renders agree on every field; a disagreement is
 * returned in `duplicateConflicts` and is a hard failure for the
 * caller, because choosing between two renders that differ is a
 * decision and not a de-duplication.
 */
export function parseAthletes(markup: string): {
  athletes: AthleteRecord[];
  duplicatesCollapsed: number;
  duplicateConflicts: string[];
} {
  // Only top-level athlete containers. `hot-heat-athlete` alone opens
  // the record; `hot-heat-athlete__name`, `__score`, `__details` and
  // friends are nested inside it. Matching those too puts a block
  // boundary a few characters after each record's start, so every
  // field lookup then runs against an empty window and comes back null.
  const opens = [...markup.matchAll(/<div\s+class="(hot-heat-athlete(?:\s[^"]*)?)"([^>]*)>/g)];
  const byKey = new Map<string, AthleteRecord>();
  let duplicatesCollapsed = 0;
  const duplicateConflicts: string[] = [];

  for (let i = 0; i < opens.length; i++) {
    const open = opens[i];
    const classAttr = open[1];
    const openAttrs = open[2];
    const start = open.index ?? 0;
    const end = i + 1 < opens.length ? (opens[i + 1].index ?? markup.length) : markup.length;
    const block = markup.slice(start, end);

    const wslAthleteId = attr(openAttrs, "data-athlete-id");
    const domId = attr(openAttrs, "id");
    // id="hot-heat-athlete--104704-3994" — heat and athlete, together,
    // straight from WSL. Preferred over positional inference.
    const idMatch = domId ? /hot-heat-athlete--(\d+)-(\d+)/.exec(domId) : null;
    if (!wslAthleteId || !idMatch) continue;
    const wslHeatId = idMatch[1];

    const record: AthleteRecord = {
      wslHeatId,
      wslAthleteId,
      fullName: innerTextOfClass(block, "hot-heat-athlete__name--full"),
      shortName: innerTextOfClass(block, "hot-heat-athlete__name--short"),
      countryTitle: (() => {
        const m = /class="athlete-country-flag[^"]*"[^>]*title="([^"]*)"/.exec(block);
        return m ? decodeEntities(m[1]) : null;
      })(),
      // THREE page shapes, not two. Wave-pool events (2025 Abu Dhabi) render a
      // `wavepool-hybrid` module with no `hot-heat-athlete__score` element at
      // all — the heat total lives in `wavepool-hybrid__total` instead.
      //
      // Read the ordinary class first, fall back to the pool one. Before this,
      // Abu Dhabi produced 66 heat entries with a null heat total, and the
      // seed would not even load: Postgres types an all-NULL VALUES column as
      // text and refused the numeric column. The obvious conclusion was "the
      // pool page does not publish heat totals". It does — 10.87 sat in the
      // markup the whole time. Twelfth instance of an instrument's silence
      // being mistaken for the world's.
      heatTotal:
        parseScore(innerTextOfClass(block, "hot-heat-athlete__score")) ??
        parseScore(innerTextOfClass(block, "wavepool-hybrid__total")),
      position: classSuffixNumber(classAttr, "athlete-place"),
      rideCount: classSuffixNumber(classAttr, "waves"),
      progressionText: innerTextOfClass(block, "hot-heat-athlete__abbreviated-advanced-to"),
      countedWaves: (() => {
        // On the wave-pool shape `hot-heat-athlete__counted-waves` is a results
        // BAR whose first child is the total, not a "5.43 + 4.00" caption.
        // Splitting it on "+" would yield [10.87] — the heat total wearing the
        // counting pair's name, which is worse than null. The pair is
        // recoverable from the wave cells; that is a parser variant this module
        // does not have yet, so it returns null and the gap is recorded.
        if (/wavepool-hybrid__total/.test(block)) return null;
        const raw = innerTextOfClass(block, "hot-heat-athlete__counted-waves");
        if (raw === null) return null;
        const parts = raw.split("+").map((p) => parseScore(p));
        // A pair that does not parse cleanly is not a pair. Null beats
        // a half-read value that later reconciles by luck.
        return parts.every((p): p is number => p !== null) ? parts : null;
      })(),
      athleteStatus: attr(openAttrs, "data-athlete-status"),
      advanceMarker: advanceMarkerOf(classAttr),
      hasInterference: /hot-heat-athlete--has-interference/.test(classAttr),
    };

    const key = `${wslHeatId}:${wslAthleteId}`;
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, record);
      continue;
    }
    if (JSON.stringify(prior) === JSON.stringify(record)) {
      duplicatesCollapsed++;
    } else {
      duplicateConflicts.push(
        `${key}: two renders disagree.\n  a=${JSON.stringify(prior)}\n  b=${JSON.stringify(record)}`,
      );
    }
  }

  return {
    athletes: [...byKey.values()],
    duplicatesCollapsed,
    duplicateConflicts,
  };
}

// ---------------------------------------------------------------------
// Whole page
// ---------------------------------------------------------------------

export function parseResultsPage(slug: string): ParsedPage {
  const markup = stripNonMarkup(readRetainedHtml(slug));
  const heats = parseHeats(markup);
  const { athletes, duplicatesCollapsed, duplicateConflicts } = parseAthletes(markup);

  // Shape is inferred from what the page carries, not from the slug.
  // The bracket view publishes no counting pair and no progression
  // string for any record; the list view publishes both for all.
  const withCounting = athletes.filter((a) => a.countedWaves !== null).length;
  const shape: "list" | "bracket" = withCounting > 0 ? "list" : "bracket";

  return { slug, shape, heats, athletes, duplicatesCollapsed, duplicateConflicts };
}
